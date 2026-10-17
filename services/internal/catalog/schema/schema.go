// Package schema validates task input against a version's JSON Schema
// (draft 2020-12) and fills in its defaults. Field names in errors are ours,
// never a provider's: the schema is the public contract.
package schema

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"
)

// Validator checks input against one compiled schema.
type Validator struct {
	schema *jsonschema.Schema
	doc    map[string]any
}

// Compile parses and compiles a schema document.
func Compile(raw json.RawMessage) (*Validator, error) {
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("schema isn't valid JSON: %w", err)
	}
	obj, ok := doc.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("a schema must be a JSON object")
	}
	c := jsonschema.NewCompiler()
	c.DefaultDraft(jsonschema.Draft2020)
	if err := c.AddResource("mem://input.json", doc); err != nil {
		return nil, err
	}
	sch, err := c.Compile("mem://input.json")
	if err != nil {
		return nil, fmt.Errorf("compiling schema: %w", err)
	}
	return &Validator{schema: sch, doc: obj}, nil
}

// FieldErrors maps a field path ("duration", "images/0") to what is wrong with it;
// "" holds errors about the input as a whole.
type FieldErrors map[string]string

func (f FieldErrors) Error() string {
	keys := make([]string, 0, len(f))
	for k := range f {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, len(keys))
	for i, k := range keys {
		if k == "" {
			parts[i] = f[k]
		} else {
			parts[i] = k + ": " + f[k]
		}
	}
	return strings.Join(parts, "; ")
}

var printer = message.NewPrinter(language.English)

// Validate decodes input, applies the schema's top-level defaults and
// validates the result. It returns the input with defaults filled in.
func (v *Validator) Validate(input json.RawMessage) (json.RawMessage, error) {
	value, err := jsonschema.UnmarshalJSON(bytes.NewReader(input))
	if err != nil {
		return nil, FieldErrors{"": "input isn't valid JSON"}
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil, FieldErrors{"": "input must be a JSON object"}
	}
	applyDefaults(obj, v.doc)
	if err := v.schema.Validate(obj); err != nil {
		ve, ok := err.(*jsonschema.ValidationError)
		if !ok {
			return nil, err
		}
		fields := FieldErrors{}
		collect(ve, fields)
		return nil, fields
	}
	out, err := json.Marshal(obj)
	if err != nil {
		return nil, err
	}
	return out, nil
}

// collect keeps the leaf errors, one per field.
func collect(ve *jsonschema.ValidationError, into FieldErrors) {
	if len(ve.Causes) == 0 {
		key := strings.Join(ve.InstanceLocation, "/")
		if _, seen := into[key]; !seen {
			into[key] = ve.ErrorKind.LocalizedString(printer)
		}
		return
	}
	for _, c := range ve.Causes {
		collect(c, into)
	}
}

// applyDefaults fills missing top-level properties that declare a default.
func applyDefaults(obj map[string]any, doc map[string]any) {
	props, _ := doc["properties"].(map[string]any)
	for name, spec := range props {
		s, _ := spec.(map[string]any)
		if def, ok := s["default"]; ok {
			if _, present := obj[name]; !present {
				obj[name] = def
			}
		}
	}
}

// Cache compiles each schema once, keyed by e.g. "google/veo-3.1@v2:input".
// Versions are immutable once live, so entries never go stale for them;
// drafts are re-keyed by their content.
type Cache struct {
	mu sync.Mutex
	m  map[string]*Validator
}

// Get returns the validator for key, compiling raw on first use.
func (c *Cache) Get(key string, raw json.RawMessage) (*Validator, error) {
	key = key + ":" + fmt.Sprint(len(raw)) + ":" + string(hash(raw))
	c.mu.Lock()
	defer c.mu.Unlock()
	if v, ok := c.m[key]; ok {
		return v, nil
	}
	v, err := Compile(raw)
	if err != nil {
		return nil, err
	}
	if c.m == nil {
		c.m = map[string]*Validator{}
	}
	c.m[key] = v
	return v, nil
}

// hash is FNV-1a, enough to tell schema contents apart in a cache key.
func hash(b []byte) []byte {
	h := uint64(14695981039346656037)
	for _, c := range b {
		h ^= uint64(c)
		h *= 1099511628211
	}
	return []byte(fmt.Sprintf("%x", h))
}
