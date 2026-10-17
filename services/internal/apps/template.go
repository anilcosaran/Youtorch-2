package apps

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// placeholder matches {{ path }}; paths are dotted, with numeric parts for array items.
var placeholder = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}`)

// Render fills the templates in v from scope ({"input": ..., "steps": {id: {"output": ...}}}).
// A string that is exactly one placeholder takes the value as is, so arrays
// and objects pass through; placeholders inside longer strings are written as text.
func Render(v any, scope map[string]any) (any, error) {
	switch x := v.(type) {
	case string:
		if m := placeholder.FindStringSubmatch(x); m != nil && m[0] == strings.TrimSpace(x) {
			return lookup(scope, m[1])
		}
		var err error
		out := placeholder.ReplaceAllStringFunc(x, func(s string) string {
			path := placeholder.FindStringSubmatch(s)[1]
			val, lerr := lookup(scope, path)
			if lerr != nil {
				err = lerr
				return ""
			}
			return fmt.Sprint(val)
		})
		return out, err
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, child := range x {
			r, err := Render(child, scope)
			if err != nil {
				return nil, err
			}
			out[k] = r
		}
		return out, nil
	case []any:
		out := make([]any, len(x))
		for i, child := range x {
			r, err := Render(child, scope)
			if err != nil {
				return nil, err
			}
			out[i] = r
		}
		return out, nil
	default:
		return v, nil
	}
}

func lookup(scope map[string]any, path string) (any, error) {
	var cur any = scope
	for _, part := range strings.Split(path, ".") {
		switch node := cur.(type) {
		case map[string]any:
			next, ok := node[part]
			if !ok {
				return nil, fmt.Errorf("{{%s}}: %q is missing", path, part)
			}
			cur = next
		case []any:
			i, err := strconv.Atoi(part)
			if err != nil || i < 0 || i >= len(node) {
				return nil, fmt.Errorf("{{%s}}: no item %q", path, part)
			}
			cur = node[i]
		default:
			return nil, fmt.Errorf("{{%s}}: can't read %q of a %T", path, part, cur)
		}
	}
	return cur, nil
}

// References lists the template paths used anywhere in v.
func References(v any) []string {
	var out []string
	var walk func(any)
	walk = func(v any) {
		switch x := v.(type) {
		case string:
			for _, m := range placeholder.FindAllStringSubmatch(x, -1) {
				out = append(out, m[1])
			}
		case map[string]any:
			for _, child := range x {
				walk(child)
			}
		case []any:
			for _, child := range x {
				walk(child)
			}
		}
	}
	walk(v)
	return out
}
