// Package billing prices tasks and keeps the money straight: a hold when a
// task is created, settlement when it finishes, and later top-ups through
// Stripe and auto-reload. Amounts are integer micro-dollars; prices in the
// catalog are decimal dollars per unit and are converted here, once.
//
// A workspace's balance_micros is what it has; held_micros is what its
// unfinished tasks have set aside. A new task holds an estimate of its price
// and is refused when balance - held doesn't cover it. When the task finishes,
// in the same transaction as its final status, the hold is released and, if
// it succeeded, its price is taken from the balance and posted to the ledger.
package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"

	"github.com/jackc/pgx/v5"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
)

// Micros converts dollars to micro-dollars, rounding half away from zero.
func Micros(dollars float64) int64 { return int64(math.Round(dollars * 1e6)) }

// Quote is the prices a task was accepted at, fixed when it is created: the
// tier its input picked, that tier's price after any promo, and the reference
// media it sent. Failed tasks and queue time are never charged; callers only
// charge successes.
type Quote struct {
	Tier       string  `json:"tier"`
	Unit       string  `json:"unit"`
	UnitPrice  float64 `json:"unit_price"`
	InputUnit  string  `json:"input_unit,omitempty"`
	InputUnits float64 `json:"input_units,omitempty"`
	InputPrice float64 `json:"input_price,omitempty"`
}

// NewQuote prices an input, which must already match the version's schema.
func NewQuote(p catalog.Pricing, input json.RawMessage) (Quote, error) {
	var fields map[string]any
	if len(input) > 0 {
		if err := json.Unmarshal(input, &fields); err != nil {
			return Quote{}, fmt.Errorf("billing: reading input: %w", err)
		}
	}
	tier, err := p.TierFor(fields)
	if err != nil {
		return Quote{}, err
	}
	q := Quote{Tier: tier.ID, Unit: p.Unit, UnitPrice: p.Net(tier.Price)}
	if p.Input != nil {
		if count := inputUnits(fields[p.Input.Field]); count > 0 {
			q.InputUnit, q.InputUnits, q.InputPrice = p.Input.Unit, count, p.Input.Price
		}
	}
	return q, nil
}

func inputUnits(value any) float64 {
	switch v := value.(type) {
	case nil:
		return 0
	case []any:
		return float64(len(v))
	case float64:
		return max(v, 0)
	case string:
		if v == "" {
			return 0
		}
	}
	return 1
}

// Amount is what the customer pays for units.
func (q Quote) Amount(units float64) int64 {
	return Micros(q.UnitPrice*units + q.InputPrice*q.InputUnits)
}

// Hold is what a new task sets aside: one unit and its reference media, and at
// least the smallest amount for a priced task, however small a unit is. It
// stays an estimate until units come from the input; settlement charges what
// the task really used.
func (q Quote) Hold() int64 {
	amount := q.Amount(1)
	if amount == 0 && (q.UnitPrice > 0 || q.InputPrice > 0) {
		return 1
	}
	return amount
}

// Cost is what the provider charges us for units at a tier on a route.
func Cost(r catalog.Route, tier string, units float64) int64 {
	return Micros(r.Cost(tier) * units)
}

var (
	// ErrInsufficientCredits means the balance, less what unfinished tasks
	// hold, doesn't cover a new task's hold.
	ErrInsufficientCredits = errors.New("billing: insufficient credits")
	// ErrSpendLimitReached means a key's monthly spend limit has no room for a
	// new task's hold.
	ErrSpendLimitReached = errors.New("billing: key spend limit reached")
)

// Account is a workspace's money as Lock read it.
type Account struct {
	WorkspaceID   string
	BalanceMicros int64
	HeldMicros    int64
}

// Available is what the workspace may still set aside.
func (a Account) Available() int64 { return a.BalanceMicros - a.HeldMicros }

// Lock reads a workspace's account and locks its row until tx ends, so the
// holds of tasks created at the same time are checked one after another.
func Lock(ctx context.Context, tx pgx.Tx, workspaceID string) (Account, error) {
	a := Account{WorkspaceID: workspaceID}
	err := tx.QueryRow(ctx, `select balance_micros, held_micros from workspaces where id = $1 for update`, workspaceID).
		Scan(&a.BalanceMicros, &a.HeldMicros)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, fmt.Errorf("billing: workspace %s doesn't exist", workspaceID)
	}
	return a, err
}

// Hold sets amount aside for a new task, or returns ErrInsufficientCredits.
// a must come from Lock in the same transaction.
func Hold(ctx context.Context, tx pgx.Tx, a Account, amount int64) error {
	if a.Available() < amount {
		return ErrInsufficientCredits
	}
	if amount == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `update workspaces set held_micros = held_micros + $2 where id = $1`, a.WorkspaceID, amount)
	return err
}

// LimitAllows reports whether a key that spent spent this month may hold
// amount more; a nil limit allows anything.
func LimitAllows(limit *int64, spent, amount int64) bool {
	return limit == nil || spent+amount <= *limit
}

// Settlement is how a finished task pays.
type Settlement struct {
	WorkspaceID string
	TaskID      string
	// HoldMicros is what the task set aside; it is released whatever the outcome.
	HoldMicros int64
	// Succeeded tasks are charged PriceMicros; failed, canceled and expired ones nothing.
	Succeeded   bool
	PriceMicros int64
}

// Settle releases a finished task's hold and charges it if it succeeded. It
// runs in the transaction that gives the task its final status, which happens
// once, so a task settles once; the ledger's unique (task_id, kind) refuses a
// second usage entry all the same.
//
// The charge is the task's real price, which may exceed its hold (more units
// than the one held for). The balance may then go below zero; that is
// accepted until holds are estimated from the input.
func Settle(ctx context.Context, tx pgx.Tx, s Settlement) error {
	var charge int64
	if s.Succeeded {
		if _, err := tx.Exec(ctx, `insert into ledger_entries (workspace_id, kind, amount_micros, task_id)
			values ($1, 'usage', $2, $3)`, s.WorkspaceID, -s.PriceMicros, s.TaskID); err != nil {
			return fmt.Errorf("posting usage of task %s: %w", s.TaskID, err)
		}
		charge = s.PriceMicros
	}
	if charge == 0 && s.HoldMicros == 0 {
		return nil
	}
	if _, err := tx.Exec(ctx, `update workspaces set balance_micros = balance_micros - $2, held_micros = held_micros - $3
		where id = $1`, s.WorkspaceID, charge, s.HoldMicros); err != nil {
		return fmt.Errorf("settling task %s: %w", s.TaskID, err)
	}
	return nil
}
