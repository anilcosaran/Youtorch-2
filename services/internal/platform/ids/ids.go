// Package ids makes the public IDs we hand out: a type prefix and a sortable,
// random part, e.g. "task_01jcb2w8q4m3x7r9v5k2n6p8hz".
package ids

import (
	"crypto/rand"
	"encoding/binary"
	"strings"
	"time"
)

// Crockford's base32 in lowercase: no i, l, o or u, so IDs read aloud well.
const alphabet = "0123456789abcdefghjkmnpqrstvwxyz"

// New returns prefix + "_" + 26 characters: 48 bits of milliseconds then 80
// random bits, so IDs sort by creation time.
func New(prefix string) string {
	return prefix + "_" + encode(time.Now())
}

func encode(at time.Time) string {
	var b [16]byte
	binary.BigEndian.PutUint64(b[0:8], uint64(at.UnixMilli())<<16)
	_, _ = rand.Read(b[6:])
	var sb strings.Builder
	sb.Grow(26)
	// 128 bits as 26 base32 digits, most significant first.
	hi := binary.BigEndian.Uint64(b[0:8])
	lo := binary.BigEndian.Uint64(b[8:16])
	for i := 25; i >= 0; i-- {
		shift := uint(i * 5)
		var v uint64
		switch {
		case shift >= 64:
			v = hi >> (shift - 64)
		case shift+5 > 64:
			v = lo>>shift | hi<<(64-shift)
		default:
			v = lo >> shift
		}
		sb.WriteByte(alphabet[v&31])
	}
	return sb.String()
}

// Valid reports whether id has the prefix and a well-formed random part.
func Valid(prefix, id string) bool {
	rest, ok := strings.CutPrefix(id, prefix+"_")
	if !ok || len(rest) != 26 {
		return false
	}
	for i := 0; i < len(rest); i++ {
		if !strings.ContainsRune(alphabet, rune(rest[i])) {
			return false
		}
	}
	return true
}
