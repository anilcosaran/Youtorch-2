package webhooks

import (
	"errors"
	"testing"
	"time"
)

func TestSignAndVerify(t *testing.T) {
	secret := []byte("whsec_test")
	body := []byte(`{"id":"task_1","status":"succeeded"}`)
	now := time.Unix(1_800_000_000, 0)
	header := Sign(secret, body, now)
	if err := Verify(secret, body, header, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	cases := map[string]error{
		"tampered body": Verify(secret, []byte(`{}`), header, now),
		"wrong secret":  Verify([]byte("other"), body, header, now),
		"too old":       Verify(secret, body, header, now.Add(10*time.Minute)),
		"malformed":     Verify(secret, body, "v1=abc", now),
	}
	for name, err := range cases {
		if !errors.Is(err, ErrSignature) {
			t.Errorf("%s: want ErrSignature, got %v", name, err)
		}
	}
}
