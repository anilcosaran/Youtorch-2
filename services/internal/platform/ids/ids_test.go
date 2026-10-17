package ids

import (
	"testing"
	"time"
)

func TestNewIsValidAndUnique(t *testing.T) {
	seen := map[string]bool{}
	for range 1000 {
		id := New("task")
		if !Valid("task", id) {
			t.Fatalf("invalid id %q", id)
		}
		if seen[id] {
			t.Fatalf("duplicate id %q", id)
		}
		seen[id] = true
	}
}

func TestIDsSortByTime(t *testing.T) {
	a := encode(time.UnixMilli(1_700_000_000_000))
	b := encode(time.UnixMilli(1_700_000_000_001))
	if a[:10] >= b[:10] {
		t.Fatalf("%s should sort before %s", a, b)
	}
}

func TestValidRejects(t *testing.T) {
	for _, id := range []string{"", "task_", "req_01jcb2w8q4m3x7r9v5k2n6p8hz", "task_01JCB2W8Q4M3X7R9V5K2N6P8HZ", "task_01jcb2w8q4m3x7r9v5k2n6p8h"} {
		if Valid("task", id) {
			t.Errorf("%q should be invalid", id)
		}
	}
}
