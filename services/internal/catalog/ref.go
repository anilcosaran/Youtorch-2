package catalog

import (
	"fmt"
	"regexp"
	"strings"
)

// Ref is what a caller names: "publisher/slug" or "publisher/slug@version".
type Ref struct {
	Publisher string
	Slug      string
	// Version is empty for the model's default version.
	Version string
}

// idPart is a publisher, slug or version ID: lowercase, URL-safe.
var idPart = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]*$`)

// ValidPart reports whether s may be a publisher, slug or version ID.
func ValidPart(s string) bool { return len(s) <= 64 && idPart.MatchString(s) }

// ParseRef reads "publisher/slug[@version]".
func ParseRef(s string) (Ref, error) {
	name, version, pinned := strings.Cut(strings.TrimSpace(s), "@")
	publisher, slug, ok := strings.Cut(name, "/")
	if !ok || !ValidPart(publisher) || !ValidPart(slug) || (pinned && !ValidPart(version)) {
		return Ref{}, fmt.Errorf("%q isn't a model ID; use publisher/slug or publisher/slug@version", s)
	}
	return Ref{Publisher: publisher, Slug: slug, Version: version}, nil
}

// ModelID is "publisher/slug".
func (r Ref) ModelID() string { return r.Publisher + "/" + r.Slug }

func (r Ref) String() string {
	if r.Version == "" {
		return r.ModelID()
	}
	return r.ModelID() + "@" + r.Version
}
