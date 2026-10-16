// Package mapping turns our input into a provider's parameters. Customers see
// our schema; a route's mapping says how each upstream parameter is filled:
//
//	prompt: prompt                            # copy our field
//	duration: {from: duration, as: string}    # copy and convert
//	quality: {from: tier, map: {1080p: hd}}   # translate values
//	negative_prompt: {const: "blurry"}        # fixed, invisible to callers
//	seed: {from: seed, default: 42}           # with a fallback
//
// Keys are the provider's parameter names; dotted sources reach into objects
// ("image.url"). Without a mapping, input passes through unchanged.
package mapping

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// Rule says where one upstream parameter comes from.
type Rule struct {
	From     string         `json:"from,omitempty"`
	As       string         `json:"as,omitempty"` // string, integer, number or boolean
	Map      map[string]any `json:"map,omitempty"`
	Const    any            `json:"const,omitempty"`
	Default  any            `json:"default,omitempty"`
	hasConst bool
}

func (r *Rule) UnmarshalJSON(b []byte) error {
	var from string
	if json.Unmarshal(b, &from) == nil {
		*r = Rule{From: from}
		return nil
	}
	type plain Rule
	var p plain
	if err := json.Unmarshal(b, &p); err != nil {
		return err
	}
	var raw map[string]json.RawMessage
	_ = json.Unmarshal(b, &raw)
	_, hasConst := raw["const"]
	*r = Rule(p)
	r.hasConst = hasConst
	if !hasConst && r.From == "" {
		return fmt.Errorf("a rule needs from or const")
	}
	return nil
}

// Spec is a route's whole mapping.
type Spec map[string]Rule

// Parse reads a route's mapping; empty means pass-through.
func Parse(raw json.RawMessage) (Spec, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	var s Spec
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, fmt.Errorf("route mapping: %w", err)
	}
	return s, nil
}

// Apply builds the provider's input from ours.
func (s Spec) Apply(input json.RawMessage) (json.RawMessage, error) {
	if s == nil {
		return input, nil
	}
	var in map[string]any
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, fmt.Errorf("input isn't an object: %w", err)
	}
	out := make(map[string]any, len(s))
	for param, rule := range s {
		var value any
		var ok bool
		if rule.hasConst {
			value, ok = rule.Const, true
		} else {
			value, ok = lookup(in, rule.From)
		}
		if !ok && rule.Default != nil {
			value, ok = rule.Default, true
		}
		if !ok {
			continue
		}
		if rule.Map != nil {
			mapped, found := rule.Map[fmt.Sprint(value)]
			if !found {
				return nil, fmt.Errorf("%s: no mapping for value %v", param, value)
			}
			value = mapped
		}
		converted, err := convert(value, rule.As)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", param, err)
		}
		out[param] = converted
	}
	return json.Marshal(out)
}

func lookup(in map[string]any, path string) (any, bool) {
	var cur any = in
	for _, part := range strings.Split(path, ".") {
		obj, ok := cur.(map[string]any)
		if !ok {
			return nil, false
		}
		if cur, ok = obj[part]; !ok {
			return nil, false
		}
	}
	return cur, true
}

func convert(v any, as string) (any, error) {
	switch as {
	case "":
		return v, nil
	case "string":
		switch x := v.(type) {
		case string:
			return x, nil
		case float64:
			return strconv.FormatFloat(x, 'f', -1, 64), nil
		default:
			return fmt.Sprint(x), nil
		}
	case "integer", "number":
		var f float64
		switch x := v.(type) {
		case float64:
			f = x
		case string:
			var err error
			if f, err = strconv.ParseFloat(x, 64); err != nil {
				return nil, fmt.Errorf("%q isn't a number", x)
			}
		default:
			return nil, fmt.Errorf("can't convert %T to a number", v)
		}
		if as == "integer" {
			return int64(f), nil
		}
		return f, nil
	case "boolean":
		switch x := v.(type) {
		case bool:
			return x, nil
		case string:
			return strconv.ParseBool(x)
		default:
			return nil, fmt.Errorf("can't convert %T to a boolean", v)
		}
	default:
		return nil, fmt.Errorf("unknown conversion %q", as)
	}
}
