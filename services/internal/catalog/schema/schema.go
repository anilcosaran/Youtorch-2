// Package schema validates task input against a version's JSON Schema
// (draft 2020-12) and fills in its defaults. Field names in errors are ours,
// never a provider's: the schema is the public contract.
//
// Validation is strict about what reaches a provider: formats ("uri",
// "email", …) are asserted, strings may not contain U+0000 (Postgres can't
// store it), and top-level properties the schema doesn't declare are dropped
// unless it explicitly allows additional properties.
package schema

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"
)

// Validator checks input against one compiled schema.
type Validator struct {
	schema   *jsonschema.Schema
	doc      map[string]any
	declared declared
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
	// Draft 2020-12 only annotates formats by default; we check them.
	c.AssertFormat()
	if err := c.AddResource("mem://input.json", doc); err != nil {
		return nil, err
	}
	sch, err := c.Compile("mem://input.json")
	if err != nil {
		return nil, fmt.Errorf("compiling schema: %w", err)
	}
	return &Validator{schema: sch, doc: obj, declared: declaredIn(obj)}, nil
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
// validates the result. It returns the input with defaults filled in and
// undeclared top-level properties dropped.
func (v *Validator) Validate(input json.RawMessage) (json.RawMessage, error) {
	value, err := jsonschema.UnmarshalJSON(bytes.NewReader(input))
	if err != nil {
		return nil, FieldErrors{"": "input isn't valid JSON"}
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil, FieldErrors{"": "input must be a JSON object"}
	}
	if fields := (FieldErrors{}); findNUL(obj, nil, fields) {
		return nil, fields
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
	v.declared.drop(obj)
	out, err := json.Marshal(obj)
	if err != nil {
		return nil, err
	}
	return out, nil
}

// nul is U+0000, which Postgres can't store in text or jsonb.
const nul = "\x00"

// findNUL reports every string and property name under v, at path, that
// contains U+0000.
func findNUL(v any, path []string, into FieldErrors) bool {
	found := false
	switch x := v.(type) {
	case string:
		if strings.Contains(x, nul) {
			into[strings.Join(path, "/")] = "must not contain the null character (U+0000)"
			found = true
		}
	case map[string]any:
		for k, child := range x {
			if strings.Contains(k, nul) {
				into[strings.Join(path, "/")] = "property names must not contain the null character (U+0000)"
				found = true
				continue
			}
			found = findNUL(child, append(path[:len(path):len(path)], k), into) || found
		}
	case []any:
		for i, child := range x {
			found = findNUL(child, append(path[:len(path):len(path)], fmt.Sprint(i)), into) || found
		}
	}
	return found
}

// HasNUL reports whether a JSON document has a string or property name
// containing U+0000. Invalid JSON has none.
func HasNUL(raw json.RawMessage) bool {
	var v any
	if len(raw) == 0 || json.Unmarshal(raw, &v) != nil {
		return false
	}
	return findNUL(v, nil, FieldErrors{})
}

// declared is what a schema says about its top-level properties.
type declared struct {
	names    map[string]bool
	patterns []*regexp.Regexp
	// open means the schema explicitly allows properties it doesn't name.
	open bool
}

// declaredIn reads the property names and patterns a schema declares at the
// top level, in its own properties and patternProperties and in those of the
// subschemas it composes there (allOf, anyOf, oneOf, if/then/else and local
// $refs). additionalProperties or unevaluatedProperties set to anything but
// false, in any of them, leaves the input open.
func declaredIn(doc map[string]any) declared {
	d := declared{names: map[string]bool{}}
	var visit func(s map[string]any, depth int)
	visit = func(s map[string]any, depth int) {
		if depth > 8 {
			return
		}
		for name := range asObject(s["properties"]) {
			d.names[name] = true
		}
		for pattern := range asObject(s["patternProperties"]) {
			re, err := regexp.Compile(pattern)
			if err != nil {
				// The validator accepted it, so only Go's flavour refuses it: keep everything rather than guess.
				d.open = true
				continue
			}
			d.patterns = append(d.patterns, re)
		}
		for _, k := range []string{"additionalProperties", "unevaluatedProperties"} {
			if allow, set := s[k]; set && allow != false {
				d.open = true
			}
		}
		for _, k := range []string{"allOf", "anyOf", "oneOf"} {
			branches, _ := s[k].([]any)
			for _, b := range branches {
				visit(asObject(b), depth+1)
			}
		}
		for _, k := range []string{"if", "then", "else"} {
			visit(asObject(s[k]), depth+1)
		}
		if ref, ok := s["$ref"].(string); ok {
			visit(local(doc, ref), depth+1)
		}
	}
	visit(doc, 0)
	return d
}

// drop removes the top-level properties of obj the schema doesn't declare.
func (d declared) drop(obj map[string]any) {
	if d.open {
		return
	}
	for name := range obj {
		if !d.names[name] && !d.matches(name) {
			delete(obj, name)
		}
	}
}

func (d declared) matches(name string) bool {
	for _, re := range d.patterns {
		if re.MatchString(name) {
			return true
		}
	}
	return false
}

func asObject(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

// local resolves a "#/$defs/name" style reference within doc; nil for others.
func local(doc map[string]any, ref string) map[string]any {
	path, ok := strings.CutPrefix(ref, "#/")
	if !ok {
		return nil
	}
	var cur any = doc
	for _, part := range strings.Split(path, "/") {
		part = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
		if cur = asObject(cur)[part]; cur == nil {
			return nil
		}
	}
	return asObject(cur)
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
