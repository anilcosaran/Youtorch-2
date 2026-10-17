// Package webhooks signs and delivers task events to customers. Delivery,
// retries with backoff and the per-workspace signing secret come next; the
// signature format is fixed now so SDKs can verify it:
//
//	Modelvend-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">
//	Modelvend-Idempotency-Key: <task id>-<status>
package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Tolerance is how old a signature may be before receivers should refuse it.
const Tolerance = 5 * time.Minute

// Sign returns the Modelvend-Signature header value for body.
func Sign(secret []byte, body []byte, at time.Time) string {
	ts := strconv.FormatInt(at.Unix(), 10)
	return "t=" + ts + ",v1=" + mac(secret, ts, body)
}

func mac(secret []byte, ts string, body []byte) string {
	h := hmac.New(sha256.New, secret)
	h.Write([]byte(ts))
	h.Write([]byte("."))
	h.Write(body)
	return hex.EncodeToString(h.Sum(nil))
}

var ErrSignature = errors.New("webhooks: signature doesn't match")

// Verify checks a header the way receivers should.
func Verify(secret []byte, body []byte, header string, now time.Time) error {
	var ts, sig string
	for _, part := range strings.Split(header, ",") {
		k, v, _ := strings.Cut(strings.TrimSpace(part), "=")
		switch k {
		case "t":
			ts = v
		case "v1":
			sig = v
		}
	}
	sec, err := strconv.ParseInt(ts, 10, 64)
	if err != nil || sig == "" {
		return fmt.Errorf("%w: malformed header", ErrSignature)
	}
	if age := now.Sub(time.Unix(sec, 0)); age > Tolerance || age < -Tolerance {
		return fmt.Errorf("%w: timestamp outside tolerance", ErrSignature)
	}
	if !hmac.Equal([]byte(sig), []byte(mac(secret, ts, body))) {
		return ErrSignature
	}
	return nil
}
