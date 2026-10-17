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
