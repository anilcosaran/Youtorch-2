package schema

import (
	"encoding/json"
	"errors"
	"testing"
)

const videoSchema = `{
  "type": "object",
  "required": ["prompt"],
  "additionalProperties": false,
  "properties": {
    "prompt": {"type": "string", "maxLength": 20},
    "duration": {"type": "integer", "enum": [5, 10], "default": 5, "x-ui": {"group": "quick"}},
    "image_url": {"type": "string", "format": "uri"}
  }
}`

func TestValidateAppliesDefaults(t *testing.T) {
	v, err := Compile(json.RawMessage(videoSchema))
	if err != nil {
		t.Fatal(err)
	}
	out, err := v.Validate(json.RawMessage(`{"prompt": "a boat"}`))
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	_ = json.Unmarshal(out, &got)
	if got["duration"] != float64(5) {
		t.Fatalf("default not applied: %s", out)
	}
}

func TestValidateReportsFields(t *testing.T) {
	v, err := Compile(json.RawMessage(videoSchema))
	if err != nil {
		t.Fatal(err)
	}
	_, err = v.Validate(json.RawMessage(`{"prompt": "far too long for this schema", "duration": 7, "seed": 1}`))
	var fields FieldErrors
	if !errors.As(err, &fields) {
		t.Fatalf("want FieldErrors, got %v", err)
	}
	for _, key := range []string{"prompt", "duration"} {
		if fields[key] == "" {
			t.Errorf("missing error for %q in %v", key, fields)
		}
	}
	if fields[""] == "" {
		t.Errorf("unknown property should be reported on the object: %v", fields)
	}
}

func TestValidateRejectsNonObjects(t *testing.T) {
	v, _ := Compile(json.RawMessage(videoSchema))
	for _, in := range []string{`[]`, `"x"`, `{`} {
		if _, err := v.Validate(json.RawMessage(in)); err == nil {
			t.Errorf("%s should be rejected", in)
		}
	}
}

func TestCacheCompilesOnce(t *testing.T) {
	var c Cache
	a, err := c.Get("m@v1:input", json.RawMessage(videoSchema))
	if err != nil {
		t.Fatal(err)
	}
	b, _ := c.Get("m@v1:input", json.RawMessage(videoSchema))
	if a != b {
		t.Fatal("same schema should reuse the compiled validator")
	}
	if _, err := c.Get("bad", json.RawMessage(`[]`)); err == nil {
		t.Fatal("non-object schema should fail")
	}
}

func TestValidateAssertsFormats(t *testing.T) {
	v, err := Compile(json.RawMessage(videoSchema))
	if err != nil {
		t.Fatal(err)
	}
	_, err = v.Validate(json.RawMessage(`{"prompt": "a boat", "image_url": "not a url"}`))
	var fields FieldErrors
	if !errors.As(err, &fields) || fields["image_url"] == "" {
		t.Fatalf("a malformed uri should be refused on its field, got %v", err)
	}
	if _, err := v.Validate(json.RawMessage(`{"prompt": "a boat", "image_url": "https://example.com/a.png"}`)); err != nil {
		t.Fatalf("a valid uri was refused: %v", err)
	}
}

func TestValidateRefusesTheNullCharacter(t *testing.T) {
	v, err := Compile(json.RawMessage(`{"type": "object", "additionalProperties": true}`))
	if err != nil {
		t.Fatal(err)
	}
	for in, field := range map[string]string{
		`{"prompt": "a\u0000b"}`:             "prompt",
		`{"images": ["ok", "\u0000"]}`:       "images/1",
		`{"ref": {"name\u0000": 1}}`:         "ref",
		`{"deep": [{"caption": "x\u0000"}]}`: "deep/0/caption",
	} {
		_, err := v.Validate(json.RawMessage(in))
		var fields FieldErrors
		if !errors.As(err, &fields) || fields[field] == "" {
			t.Errorf("%s: want an error on %q, got %v", in, field, err)
		}
	}
	if !HasNUL(json.RawMessage(`{"a": "\u0000"}`)) || HasNUL(json.RawMessage(`{"a": "\\u0000 is an escaped backslash"}`)) {
		t.Error("HasNUL")
	}
}

func TestValidateDropsUndeclaredProperties(t *testing.T) {
	for _, c := range []struct {
		name, schema, input, want string
	}{
		{"undeclared", `{"type": "object", "properties": {"prompt": {"type": "string"}}}`,
			`{"prompt": "a", "webhook": "x", "num_inference_steps": 999}`, `{"prompt":"a"}`},
		{"no properties", `{}`, `{"prompt": "a"}`, `{}`},
		{"pattern", `{"properties": {"prompt": {}}, "patternProperties": {"^lora_": {}}}`,
			`{"prompt": "a", "lora_1": 1, "other": 2}`, `{"lora_1":1,"prompt":"a"}`},
		{"composed", `{"allOf": [{"properties": {"a": {}}}, {"$ref": "#/$defs/b"}], "$defs": {"b": {"properties": {"b": {}}}}}`,
			`{"a": 1, "b": 2, "c": 3}`, `{"a":1,"b":2}`},
		{"allowed", `{"properties": {"prompt": {}}, "additionalProperties": true}`,
			`{"prompt": "a", "extra": 1}`, `{"extra":1,"prompt":"a"}`},
		{"allowed with a schema", `{"properties": {"prompt": {}}, "additionalProperties": {"type": "integer"}}`,
			`{"prompt": "a", "extra": 1}`, `{"extra":1,"prompt":"a"}`},
	} {
		v, err := Compile(json.RawMessage(c.schema))
		if err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		out, err := v.Validate(json.RawMessage(c.input))
		if err != nil || string(out) != c.want {
			t.Errorf("%s: got %s %v, want %s", c.name, out, err, c.want)
		}
	}
}
