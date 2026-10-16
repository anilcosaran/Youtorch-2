package manifest

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
)

func pricing(defaultTier string) catalog.Pricing {
	return catalog.Pricing{Unit: "image", DefaultTier: defaultTier, Tiers: []catalog.Tier{{ID: "standard", Label: "Standard", Price: 0.01}}}
}

// repoCatalog is the catalog/ directory at the repository root.
func repoCatalog(t *testing.T) string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "catalog")
}

// The example manifests in the repository must always import.
func TestRepositoryManifestsAreValid(t *testing.T) {
	files, err := Files([]string{repoCatalog(t)})
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Skip("catalog/ has no manifests yet")
	}
	for _, f := range files {
		raw, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		var probe map[string]any
		if err := yaml.Unmarshal(raw, &probe); err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		dec := yaml.NewDecoder(strings.NewReader(string(raw)))
		dec.KnownFields(true)
		if probe["id"] != nil {
			var m Model
			if err := dec.Decode(&m); err != nil {
				t.Fatalf("%s: %v", f, err)
			}
			if err := m.Validate(); err != nil {
				t.Errorf("%s: %v", f, err)
			}
		} else {
			var a App
			if err := dec.Decode(&a); err != nil {
				t.Fatalf("%s: %v", f, err)
			}
			if err := a.Validate(); err != nil {
				t.Errorf("%s: %v", f, err)
			}
		}
	}
}

func TestModelValidation(t *testing.T) {
	m := Model{ID: "Bad/ID", Modality: "smell", Versions: []Version{{ID: "v1", Pricing: pricing("x")}}}
	err := m.Validate()
	for _, want := range []string{"publisher/slug", "name is required", "modality", "input schema", "default_tier"} {
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("want %q in %v", want, err)
		}
	}
}
