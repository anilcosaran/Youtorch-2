package rest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/santhosh-tekuri/jsonschema/v6"
	"go.yaml.in/yaml/v3"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/catalog/schema"
	"github.com/brieeflabs/modelvend/services/internal/identity/keys"
	"github.com/brieeflabs/modelvend/services/internal/platform/database/dbtest"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
)

const specLocation = "file:///public.yaml"

// spec is api/public.yaml, ready to check answers against.
type spec struct {
	doc      map[string]any
	compiler *jsonschema.Compiler
}

func loadSpec(t *testing.T) *spec {
	t.Helper()
	raw, err := os.ReadFile("../../../../../api/public.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := jsonschema.UnmarshalJSON(bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	compiler := jsonschema.NewCompiler()
	compiler.DefaultDraft(jsonschema.Draft2020)
	if err := compiler.AddResource(specLocation, decoded); err != nil {
		t.Fatal(err)
	}
	return &spec{doc: doc, compiler: compiler}
}

func escapePointer(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "~", "~0"), "/", "~1")
}

// check fails unless the spec documents this answer and its body matches.
func (s *spec) check(t *testing.T, method, path string, status int, body []byte) {
	t.Helper()
	code := fmt.Sprint(status)
	paths, _ := s.doc["paths"].(map[string]any)
	item, _ := paths[path].(map[string]any)
	operation, _ := item[strings.ToLower(method)].(map[string]any)
	if operation == nil {
		t.Errorf("%s %s isn't in api/public.yaml", method, path)
		return
	}
	responses, _ := operation["responses"].(map[string]any)
	response, ok := responses[code].(map[string]any)
	if !ok {
		t.Errorf("%s %s answered %d, which api/public.yaml doesn't document: %s", method, path, status, body)
		return
	}
	// The schema of the answer, addressed by where it sits in the document.
	pointer := "#/paths/" + escapePointer(path) + "/" + strings.ToLower(method) + "/responses/" + code
	if ref, ok := response["$ref"].(string); ok {
		pointer = ref
	}
	compiled, err := s.compiler.Compile(specLocation + pointer + "/content/application~1json/schema")
	if err != nil {
		t.Fatal(err)
	}
	value, err := jsonschema.UnmarshalJSON(bytes.NewReader(body))
	if err != nil {
		t.Errorf("%s %s: the body isn't JSON: %s", method, path, body)
		return
	}
	if err := compiled.Validate(value); err != nil {
		t.Errorf("%s %s %d doesn't match api/public.yaml: %v\nbody: %s", method, path, status, err, body)
	}
}

// operations lists what the spec documents, to prove every one was exercised.
func (s *spec) operations() map[string]bool {
	out := map[string]bool{}
	paths, _ := s.doc["paths"].(map[string]any)
	for path, item := range paths {
		for method := range item.(map[string]any) {
			out[strings.ToUpper(method)+" "+path] = true
		}
	}
	return out
}

const contractPricing = `{"unit": "image", "default_tier": "standard", "tier_field": "quality", "tier_values": {"best": "premium"},
	"tiers": [{"id": "standard", "label": "Standard", "price": 0.02}, {"id": "premium", "label": "Premium", "price": 0.1}],
	"input": {"unit": "image", "price": 0.005, "field": "refs"}, "promo": 0.25}`

const contractInput = `{"type": "object", "required": ["prompt"], "properties": {
	"prompt": {"type": "string"},
	"quality": {"type": "string", "enum": ["standard", "best"]},
	"refs": {"type": "array", "items": {"type": "string"}}}}`

const contractOutput = `{"type": "object", "properties": {"images": {"type": "array"}}}`

// contractEnv is a catalog with one model in each state and a key for each kind of caller.
type contractEnv struct {
	db                               *pgxpool.Pool
	workspace                        string
	funded, scoped, broke, suspended string
}

func (e *contractEnv) key(t *testing.T, workspace string, scopes []string) string {
	t.Helper()
	secret, prefix, hash := keys.Generate()
	if scopes == nil {
		scopes = []string{}
	}
	if _, err := e.db.Exec(context.Background(), `insert into api_keys (workspace_id, name, prefix, secret_hash, scopes)
		values ($1, 'test', $2, $3, $4)`, workspace, prefix, hash, scopes); err != nil {
		t.Fatal(err)
	}
	return secret
}

func (e *contractEnv) newWorkspace(t *testing.T, status string, balance int64) string {
	t.Helper()
	var id string
	if err := e.db.QueryRow(context.Background(), `insert into workspaces (name, status, balance_micros)
		values ('Test', $1, $2) returning id`, status, balance).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

func setupContract(t *testing.T) (*contractEnv, http.Handler) {
	t.Helper()
	ctx := context.Background()
	db := dbtest.New(t)
	version := func(model, id, status, extra string) string {
		return fmt.Sprintf(`insert into model_versions (model_id, id, label, status, input_schema, output_schema, pricing, routing %s)
			values ('%s', '%s', '1', '%s', '%s', '%s', '%s', '{}' %s)`, extra[:strings.Index(extra, "|")], model, id, status,
			contractInput, contractOutput, contractPricing, extra[strings.Index(extra, "|")+1:])
	}
	model := func(id, state, defaultVersion string) string {
		parts := strings.Split(id, "/")
		return fmt.Sprintf(`insert into models (id, publisher, slug, name, description, modality, tasks, visibility, state, default_version)
			values ('%s', '%s', '%s', 'Test', 'A test model.', 'image', '{text-to-image}', 'public', '%s', '%s')`, id, parts[0], parts[1], state, defaultVersion)
	}
	for _, sql := range []string{
		model("test/live", "active", "v2"),
		version("test/live", "v2", "live", "|"),
		version("test/live", "v1", "deprecated", ", sunset_at, replacement| , now() + interval '30 days', 'v2'"),
		version("test/live", "v0", "retired", ", replacement| , 'v2'"),
		version("test/live", "next", "draft", "|"),
		model("test/paused", "paused", "v1"),
		version("test/paused", "v1", "live", "|"),
	} {
		if _, err := db.Exec(ctx, sql); err != nil {
			t.Fatalf("%v\n%s", err, sql)
		}
	}
	e := &contractEnv{db: db}
	e.workspace = e.newWorkspace(t, "active", 10_000_000)
	e.funded = e.key(t, e.workspace, nil)
	e.scoped = e.key(t, e.workspace, []string{"test/paused"})
	e.broke = e.key(t, e.newWorkspace(t, "active", 0), nil)
	e.suspended = e.key(t, e.newWorkspace(t, "suspended", 10_000_000), nil)

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	// Only inserts: nothing works the jobs, so tasks stay queued until a test moves them.
	client, err := river.NewClient[pgx.Tx](riverpgxv5.New(db), &river.Config{Logger: logger, TestOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	store := &catalog.Store{DB: db}
	api := &API{
		Tasks:   &tasks.Service{DB: db, Store: &tasks.Store{DB: db}, Catalog: store, Schemas: &schema.Cache{}, Jobs: client},
		Catalog: store,
		Keys:    &keys.Store{DB: db},
		Logger:  logger,
	}
	r := chi.NewRouter()
	api.Routes(r)
	return e, r
}

// TestAnswersMatchTheContract calls the real handlers on a real database, and
// checks each answer against api/public.yaml: its status must be documented
// and its body must match, with no field the document doesn't name.
func TestAnswersMatchTheContract(t *testing.T) {
	e, handler := setupContract(t)
	s := loadSpec(t)
	seen := map[string]bool{}

	type answer struct {
		status int
		body   map[string]any
		header http.Header
	}
	call := func(key, method, target, operationPath, body string, headers ...string) answer {
		t.Helper()
		req := httptest.NewRequest(method, target, strings.NewReader(body))
		if key != "" {
			req.Header.Set("Authorization", "Bearer "+key)
		}
		for i := 0; i+1 < len(headers); i += 2 {
			req.Header.Set(headers[i], headers[i+1])
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		raw := rec.Body.Bytes()
		s.check(t, method, operationPath, rec.Code, raw)
		seen[method+" "+operationPath] = true
		var parsed map[string]any
		_ = json.Unmarshal(raw, &parsed)
		return answer{rec.Code, parsed, rec.Header()}
	}
	expect := func(a answer, status int, code string) {
		t.Helper()
		if a.status != status {
			t.Errorf("got %d %v, want %d", a.status, a.body, status)
			return
		}
		if code != "" {
			errBody, _ := a.body["error"].(map[string]any)
			if errBody["code"] != code {
				t.Errorf("got %v, want code %s", a.body, code)
			}
		}
	}
	const (
		tasksPath  = "/v1/tasks"
		taskPath   = "/v1/tasks/{id}"
		cancelPath = "/v1/tasks/{id}/cancel"
		modelsPath = "/v1/models"
		modelPath  = "/v1/models/{publisher}/{slug}"
		valid      = `{"model": "test/live", "input": {"prompt": "a", "quality": "best", "refs": ["x", "y"]}}`
	)

	// Reading the catalog.
	expect(call("", "GET", modelsPath, modelsPath, ""), 401, "unauthenticated")
	expect(call(e.suspended, "GET", modelsPath, modelsPath, ""), 403, "account_suspended")
	list := call(e.funded, "GET", modelsPath, modelsPath, "")
	expect(list, 200, "")
	if data, _ := list.body["data"].([]any); len(data) != 2 {
		t.Errorf("want both public models listed: %v", list.body)
	}
	live := call(e.funded, "GET", modelPath[:10]+"/test/live", modelPath, "")
	expect(live, 200, "")
	pricing, _ := live.body["pricing"].(map[string]any)
	tiers, _ := pricing["tiers"].([]any)
	premium, _ := tiers[1].(map[string]any)
	if premium["price"] != "0.075" || premium["list_price"] != "0.1" {
		t.Errorf("want the promo in the price: %v", premium)
	}
	deprecated := call(e.funded, "GET", "/v1/models/test/live?version=v1", modelPath, "")
	expect(deprecated, 200, "")
	if !strings.HasPrefix(deprecated.header.Get("Deprecation"), "@") || deprecated.header.Get("Sunset") == "" {
		t.Errorf("want deprecation headers: %v", deprecated.header)
	}
	expect(call(e.funded, "GET", "/v1/models/test/nope", modelPath, ""), 404, "model_not_found")
	expect(call(e.funded, "GET", "/v1/models/test/live?version=next", modelPath, ""), 404, "model_not_found")
	retired := call(e.funded, "GET", "/v1/models/test/live?version=v0", modelPath, "")
	expect(retired, 410, "version_retired")
	if errBody, _ := retired.body["error"].(map[string]any); errBody["replacement"] != "test/live@v2" {
		t.Errorf("want where to move: %v", retired.body)
	}
	paused := call(e.funded, "GET", "/v1/models/test/paused", modelPath, "")
	expect(paused, 200, "")
	if paused.body["state"] != "paused" {
		t.Errorf("a paused model should read as paused: %v", paused.body)
	}

	// Creating tasks.
	created := call(e.funded, "POST", tasksPath, tasksPath, valid, "Idempotency-Key", "contract-1")
	expect(created, 202, "")
	id, _ := created.body["id"].(string)
	if created.header.Get("Location") != "/v1/tasks/"+id {
		t.Errorf("location %q", created.header.Get("Location"))
	}
	replay := call(e.funded, "POST", tasksPath, tasksPath, valid, "Idempotency-Key", "contract-1")
	expect(replay, 202, "")
	if replay.body["id"] != id || replay.header.Get("Idempotent-Replayed") != "true" {
		t.Errorf("want a replay of %s: %v %v", id, replay.body, replay.header)
	}
	expect(call(e.funded, "POST", tasksPath, tasksPath, `{"model": "test/paused", "input": {"prompt": "a"}}`, "Idempotency-Key", "contract-1"), 422, "idempotency_key_reused")
	pinned := call(e.funded, "POST", tasksPath, tasksPath, `{"model": "test/live@v1", "input": {"prompt": "a"}}`)
	expect(pinned, 202, "")
	if !strings.HasPrefix(pinned.header.Get("Deprecation"), "@") {
		t.Errorf("want a deprecation header on a pinned call: %v", pinned.header)
	}
	expect(call(e.funded, "POST", tasksPath, tasksPath, `{not json`), 400, "invalid_json")
	expect(call("", "POST", tasksPath, tasksPath, valid), 401, "unauthenticated")
	expect(call(e.broke, "POST", tasksPath, tasksPath, valid), 402, "insufficient_credits")
	expect(call(e.scoped, "POST", tasksPath, tasksPath, valid), 403, "key_scope")
	expect(call(e.funded, "POST", tasksPath, tasksPath, `{"model": "test/nope", "input": {"prompt": "a"}}`), 404, "model_not_found")
	expect(call(e.funded, "POST", tasksPath, tasksPath, `{"model": "test/live@v0", "input": {"prompt": "a"}}`), 410, "version_retired")
	expect(call(e.funded, "POST", tasksPath, tasksPath, `{"input": {"prompt": "a"}}`), 422, "invalid_request")
	expect(call(e.funded, "POST", tasksPath, tasksPath, `{"model": "not-a-model", "input": {"prompt": "a"}}`), 422, "invalid_request")
	expect(call(e.funded, "POST", tasksPath, tasksPath, `{"model": "test/live", "input": {"quality": "best"}}`), 422, "invalid_input")
	expect(call(e.funded, "POST", tasksPath, tasksPath, `{"model": "test/live", "input": {"prompt": "a", "quality": "ultra"}}`), 422, "invalid_input")
	expect(call(e.funded, "POST", tasksPath, tasksPath, `{"app": "product-shots", "input": {"prompt": "a"}}`), 501, "not_implemented")
	expect(call(e.funded, "POST", tasksPath, tasksPath, `{"model": "test/paused", "input": {"prompt": "a"}}`), 503, "model_paused")

	// Reading tasks.
	queued := call(e.funded, "GET", "/v1/tasks/"+id, taskPath, "")
	expect(queued, 200, "")
	if queued.body["usage"] != nil {
		t.Errorf("an unfinished task has no usage: %v", queued.body)
	}
	expect(call("", "GET", "/v1/tasks/"+id, taskPath, ""), 401, "unauthenticated")
	expect(call(e.broke, "GET", "/v1/tasks/"+id, taskPath, ""), 404, "task_not_found")

	if _, err := e.db.Exec(context.Background(), `update tasks set status = 'succeeded', output = '{"images": []}', units = 2, unit = 'image',
		price_micros = 160000, finished_at = now(), started_at = now() where id = $1`, id); err != nil {
		t.Fatal(err)
	}
	done := call(e.funded, "GET", "/v1/tasks/"+id, taskPath, "")
	expect(done, 200, "")
	usage, _ := done.body["usage"].(map[string]any)
	if usage["amount_micros"] != float64(160000) || usage["tier"] != "premium" {
		t.Errorf("usage: %v", usage)
	}
	finishedReplay := call(e.funded, "POST", tasksPath, tasksPath, valid, "Idempotency-Key", "contract-1")
	expect(finishedReplay, 200, "")

	page := call(e.funded, "GET", "/v1/tasks?limit=1", tasksPath, "")
	expect(page, 200, "")
	if page.body["next_cursor"] == nil {
		t.Errorf("want a next page: %v", page.body)
	}
	expect(call(e.funded, "GET", "/v1/tasks?status=bogus", tasksPath, ""), 422, "invalid_request")
	expect(call("", "GET", tasksPath, tasksPath, ""), 401, "unauthenticated")

	// Canceling.
	pinnedID, _ := pinned.body["id"].(string)
	expect(call(e.funded, "POST", "/v1/tasks/"+pinnedID+"/cancel", cancelPath, ""), 200, "")
	expect(call(e.funded, "POST", "/v1/tasks/"+pinnedID+"/cancel", cancelPath, ""), 409, "task_finished")
	expect(call(e.funded, "POST", "/v1/tasks/task_nope/cancel", cancelPath, ""), 404, "task_not_found")
	expect(call("", "POST", "/v1/tasks/"+pinnedID+"/cancel", cancelPath, ""), 401, "unauthenticated")

	for operation := range s.operations() {
		if !seen[operation] {
			t.Errorf("api/public.yaml documents %s but no test called it", operation)
		}
	}
}
