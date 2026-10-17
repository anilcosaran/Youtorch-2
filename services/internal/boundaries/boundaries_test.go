// Package boundaries checks the import rules in services/README.md, so the line
// between the public API, the admin API, the contexts and the platform holds.
// It has only tests: go list reads every package's imports, and check judges
// each one.
package boundaries

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os/exec"
	"slices"
	"strings"
	"testing"
)

const module = "github.com/brieeflabs/modelvend/services"

// binaries is what each binary may import besides bootstrap and platform. A
// trailing "/..." also allows the package's subpackages.
var binaries = map[string][]string{
	"cmd/gateway":  {"internal/api/public/rest"},
	"cmd/mcp":      {"internal/api/public/mcpserver"},
	"cmd/adminapi": {"internal/api/admin"},
	// The worker serves from its job workers, and picks the provider adapters
	// and the media store they get.
	"cmd/worker":  {"internal/tasks", "internal/tasks/jobs", "internal/providers/...", "internal/delivery/media"},
	"cmd/migrate": {"internal/catalog/manifest", "internal/identity/keys"},
}

// contexts are the bounded contexts under internal/.
var contexts = []string{
	"catalog", "tasks", "routing", "providers", "apps", "billing", "identity", "delivery", "audit", "ratelimit",
}

// platformImports are the only internal imports a platform package has.
var platformImports = map[string][]string{
	"internal/platform/logging":         {"internal/platform/config"},
	"internal/platform/database":        {"migrations"},
	"internal/platform/database/dbtest": {"internal/platform/database"},
}

const (
	admin        = "internal/api/admin"
	redact       = "internal/api/public/redact"
	rest         = "internal/api/public/rest"
	openaicompat = "internal/api/public/openaicompat"
)

func TestImportRules(t *testing.T) {
	for _, p := range packages(t) {
		from := strings.TrimPrefix(strings.TrimPrefix(p.ImportPath, module), "/")
		if from == "internal/boundaries" {
			continue
		}
		if layer(from) == "" {
			t.Errorf("%s has no import rules: add it to internal/boundaries", from)
			continue
		}
		imports := slices.Concat(p.Imports, p.TestImports, p.XTestImports)
		slices.Sort(imports)
		for _, imp := range slices.Compact(imports) {
			to, ok := strings.CutPrefix(imp, module+"/")
			if !ok || to == from {
				continue
			}
			if why := check(from, to); why != "" {
				t.Errorf("%s imports %s: %s", from, to, why)
			}
		}
	}
}

func TestCheck(t *testing.T) {
	for _, c := range []struct {
		from, to string
		ok       bool
	}{
		{"cmd/gateway", rest, true},
		{"cmd/gateway", "internal/platform/httpx", true},
		{"cmd/gateway", admin, false},
		{"cmd/adminapi", "internal/tasks", false},
		{"cmd/worker", "internal/providers/fake", true},
		{"cmd/newbinary", "internal/bootstrap", false},
		{rest, openaicompat, true},
		{rest, redact, true},
		{rest, admin, false},
		{openaicompat, rest, false},
		{"internal/api/public/mcpserver", redact, true},
		{"internal/api/public/mcpserver", rest, false},
		{admin, redact, false},
		{admin, "internal/tasks", true},
		{admin, "internal/bootstrap", false},
		{"internal/bootstrap", "internal/tasks", true},
		{"internal/bootstrap", rest, false},
		{"internal/tasks/jobs", "internal/catalog", true},
		{"internal/tasks", redact, false},
		{"internal/billing", "cmd/worker", false},
		{"internal/catalog/manifest", "migrations", false},
		{"internal/platform/logging", "internal/platform/config", true},
		{"internal/platform/database", "migrations", true},
		{"internal/platform/httpx", "internal/platform/config", false},
		{"internal/platform/ids", "internal/catalog", false},
		{"migrations", "internal/platform/database", false},
	} {
		if why := check(c.from, c.to); (why == "") != c.ok {
			t.Errorf("check(%s, %s) = %q, want allowed %v", c.from, c.to, why, c.ok)
		}
	}
}

// check says why from may not import to, or returns "" when it may. Both are
// paths inside the module.
func check(from, to string) string {
	switch layer(from) {
	case "cmd":
		bin := strings.Join(strings.SplitN(from, "/", 3)[:2], "/")
		allowed, ok := binaries[bin]
		switch {
		case !ok:
			return bin + " has no entry in binaries"
		case to == "internal/bootstrap" || layer(to) == "platform" || matches(allowed, to):
			return ""
		}
		return "cmd/* imports bootstrap, platform and what binaries lists for it"
	case "api":
		switch layer(to) {
		case "context", "platform":
			return ""
		case "api":
			a, b := apiPackage(from), apiPackage(to)
			switch {
			case a == b:
				return ""
			case a == admin || b == admin:
				return "api/admin and api/public never import each other"
			case b == redact, a == rest && b == openaicompat:
				return ""
			}
			return "inside api/public only redact is shared, and rest mounts openaicompat"
		}
		return "api/* imports contexts, platform and the shared api packages"
	case "bootstrap", "context":
		if l := layer(to); l == "context" || l == "platform" {
			return ""
		}
		return "contexts and bootstrap import only contexts and platform"
	case "platform":
		if slices.Contains(platformImports[from], to) {
			return ""
		}
		return "platform imports no other internal package, apart from platformImports"
	case "migrations":
		return "migrations imports no internal package"
	}
	return from + " has no import rules"
}

// layer is the rule set pkg falls under, or "" when none does.
func layer(pkg string) string {
	switch {
	case under(pkg, "cmd"):
		return "cmd"
	case apiPackage(pkg) != "":
		return "api"
	case pkg == "internal/bootstrap":
		return "bootstrap"
	case under(pkg, "internal/platform"):
		return "platform"
	case pkg == "migrations":
		return "migrations"
	}
	for _, c := range contexts {
		if under(pkg, "internal/"+c) {
			return "context"
		}
	}
	return ""
}

// apiPackage is the api package pkg belongs to (api/admin or api/public/x), or
// "" when it is outside internal/api.
func apiPackage(pkg string) string {
	if under(pkg, admin) {
		return admin
	}
	public, ok := strings.CutPrefix(pkg, "internal/api/public/")
	if !ok || public == "" {
		return ""
	}
	name, _, _ := strings.Cut(public, "/")
	return "internal/api/public/" + name
}

func matches(patterns []string, pkg string) bool {
	for _, p := range patterns {
		if base, ok := strings.CutSuffix(p, "/..."); ok && under(pkg, base) || p == pkg {
			return true
		}
	}
	return false
}

// under reports whether pkg is dir or inside it.
func under(pkg, dir string) bool {
	return pkg == dir || strings.HasPrefix(pkg, dir+"/")
}

type listed struct {
	ImportPath                         string
	Imports, TestImports, XTestImports []string
}

// packages lists every package in the module with its imports, its test files' included.
func packages(t *testing.T) []listed {
	t.Helper()
	out, err := exec.Command("go", "list", "-json=ImportPath,Imports,TestImports,XTestImports", module+"/...").Output()
	if exitErr := (*exec.ExitError)(nil); errors.As(err, &exitErr) {
		t.Fatalf("go list: %v\n%s", err, exitErr.Stderr)
	} else if err != nil {
		t.Fatalf("go list: %v", err)
	}
	var pkgs []listed
	dec := json.NewDecoder(bytes.NewReader(out))
	for {
		var p listed
		if err := dec.Decode(&p); errors.Is(err, io.EOF) {
			break
		} else if err != nil {
			t.Fatal(err)
		}
		pkgs = append(pkgs, p)
	}
	if len(pkgs) == 0 {
		t.Fatal("go list found no packages")
	}
	return pkgs
}
