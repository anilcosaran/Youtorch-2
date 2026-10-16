// Package mcpserver serves Modelvend to MCP clients (Claude, Cursor, …) over
// Streamable HTTP at /mcp. It authenticates with the same API keys as /v1 and
// calls the same task service, so a task created here is the same task the
// API, webhooks and the console show.
package mcpserver

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/keys"
	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
	"github.com/brieeflabs/modelvend/services/internal/publicapi"
	"github.com/brieeflabs/modelvend/services/internal/redact"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
)

// Server holds what the tools call.
type Server struct {
	Tasks   *tasks.Service
	Catalog *catalog.Store
	Keys    *keys.Store
	Logger  *slog.Logger
	Version string
}

// maxWait caps how long wait_for_task blocks.
const maxWait = 60 * time.Second

// Handler is the /mcp endpoint.
func (s *Server) Handler() http.Handler {
	server := mcp.NewServer(&mcp.Implementation{Name: "modelvend", Title: "Modelvend", Version: s.Version}, &mcp.ServerOptions{
		Instructions: "Run image, video, audio and 3D models and apps. Find a model with search_models, read its input " +
			"schema with get_model, start it with create_task, then follow the task with wait_for_task or get_task.",
	})
	mcp.AddTool(server, &mcp.Tool{Name: "search_models", Description: "Find models in the catalog by name, task or modality."}, s.searchModels)
	mcp.AddTool(server, &mcp.Tool{Name: "get_model", Description: "A model's input schema, output schema and price."}, s.getModel)
	mcp.AddTool(server, &mcp.Tool{Name: "create_task", Description: "Run a model (or an app) with input matching its schema. Returns the task; media models finish later."}, s.createTask)
	mcp.AddTool(server, &mcp.Tool{Name: "get_task", Description: "A task's status, progress and output."}, s.getTask)
	mcp.AddTool(server, &mcp.Tool{Name: "wait_for_task", Description: "Wait up to timeout_seconds (at most 60) for a task to finish, then return it."}, s.waitForTask)
	mcp.AddTool(server, &mcp.Tool{Name: "cancel_task", Description: "Cancel a task that hasn't finished."}, s.cancelTask)
	mcp.AddTool(server, &mcp.Tool{Name: "list_tasks", Description: "Recent tasks of this workspace, newest first."}, s.listTasks)

	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server },
		&mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true, Logger: s.Logger})
	return auth.RequireBearerToken(s.verify, &auth.RequireBearerTokenOptions{AllowMissingExpiration: true})(handler)
}

// verify accepts our API keys as MCP bearer tokens.
func (s *Server) verify(ctx context.Context, token string, _ *http.Request) (*auth.TokenInfo, error) {
	p, err := s.Keys.Authenticate(ctx, token)
	if err != nil {
		if errors.Is(err, keys.ErrInvalid) || errors.Is(err, keys.ErrSuspended) {
			return nil, auth.ErrInvalidToken
		}
		return nil, err
	}
	return &auth.TokenInfo{UserID: p.WorkspaceID, Extra: map[string]any{"principal": p}}, nil
}

func principal(req *mcp.CallToolRequest) keys.Principal {
	if req.Extra == nil || req.Extra.TokenInfo == nil {
		return keys.Principal{}
	}
	p, _ := req.Extra.TokenInfo.Extra["principal"].(keys.Principal)
	return p
}

// result returns v as the tool's JSON text, or err as a tool error customers can read.
func result(v any, err error) (*mcp.CallToolResult, any, error) {
	if err != nil {
		var he *httpx.Error
		if errors.As(publicapi.PublicError(err), &he) {
			text := he.Code + ": " + he.Message
			for field, msg := range he.Fields {
				text += "\n- " + field + ": " + msg
			}
			return &mcp.CallToolResult{IsError: true, Content: []mcp.Content{&mcp.TextContent{Text: text}}}, nil, nil
		}
		return nil, nil, err
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return nil, nil, err
	}
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: string(b)}}}, nil, nil
}

type searchInput struct {
	Query    string `json:"query,omitempty" jsonschema:"words to match in the name, ID, description or tasks"`
	Modality string `json:"modality,omitempty" jsonschema:"image, video, audio, 3d or text"`
}

type modelSummary struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Modality    string         `json:"modality"`
	Tasks       []string       `json:"tasks"`
	Description string         `json:"description"`
	Pricing     redact.Pricing `json:"pricing"`
}

func (s *Server) searchModels(ctx context.Context, _ *mcp.CallToolRequest, in searchInput) (*mcp.CallToolResult, any, error) {
	all, err := s.Catalog.ListPublic(ctx)
	if err != nil {
		return result(nil, err)
	}
	words := strings.Fields(strings.ToLower(in.Query))
	out := []modelSummary{}
	for _, r := range all {
		m := redact.PublicModel(r)
		if in.Modality != "" && m.Modality != in.Modality {
			continue
		}
		haystack := strings.ToLower(m.ID + " " + m.Name + " " + m.Description + " " + strings.Join(m.Tasks, " "))
		match := true
		for _, w := range words {
			match = match && strings.Contains(haystack, w)
		}
		if match {
			out = append(out, modelSummary{ID: m.ID, Name: m.Name, Modality: m.Modality, Tasks: m.Tasks, Description: m.Description, Pricing: m.Pricing})
		}
	}
	return result(map[string]any{"models": out}, nil)
}

type modelInput struct {
	Model string `json:"model" jsonschema:"model ID as publisher/slug or publisher/slug@version"`
}

func (s *Server) getModel(ctx context.Context, req *mcp.CallToolRequest, in modelInput) (*mcp.CallToolResult, any, error) {
	ref, err := catalog.ParseRef(in.Model)
	if err != nil {
		return result(nil, catalog.ErrNotFound)
	}
	r, err := s.Catalog.Resolve(ctx, ref, catalog.Access{Internal: principal(req).Internal})
	if err != nil {
		return result(nil, err)
	}
	return result(redact.PublicModel(r), nil)
}

type createInput struct {
	Model string         `json:"model,omitempty" jsonschema:"model ID to run; set this or app"`
	App   string         `json:"app,omitempty" jsonschema:"app slug to run; set this or model"`
	Input map[string]any `json:"input" jsonschema:"input matching the model's input schema"`
	// WaitSeconds blocks until the task finishes or the time runs out.
	WaitSeconds int `json:"wait_seconds,omitempty" jsonschema:"seconds to wait for the result, up to 60"`
}

func (s *Server) createTask(ctx context.Context, req *mcp.CallToolRequest, in createInput) (*mcp.CallToolResult, any, error) {
	p := principal(req)
	input, err := json.Marshal(in.Input)
	if err != nil {
		return result(nil, err)
	}
	created, err := s.Tasks.Create(ctx, tasks.CreateParams{
		WorkspaceID: p.WorkspaceID, KeyID: p.KeyID, Internal: p.Internal,
		Model: in.Model, App: in.App, Input: input,
	})
	if err != nil {
		return result(nil, err)
	}
	t := created.Task
	if wait := min(time.Duration(in.WaitSeconds)*time.Second, maxWait); wait > 0 {
		if t, err = s.Tasks.Wait(ctx, p.WorkspaceID, t.ID, wait); err != nil {
			return result(nil, err)
		}
	}
	return result(redact.PublicTask(t), nil)
}

type taskInput struct {
	TaskID string `json:"task_id" jsonschema:"the task's ID, task_…"`
}

func (s *Server) getTask(ctx context.Context, req *mcp.CallToolRequest, in taskInput) (*mcp.CallToolResult, any, error) {
	t, err := s.Tasks.Get(ctx, principal(req).WorkspaceID, in.TaskID)
	if err != nil {
		return result(nil, err)
	}
	return result(redact.PublicTask(t), nil)
}

type waitInput struct {
	TaskID         string `json:"task_id" jsonschema:"the task's ID, task_…"`
	TimeoutSeconds int    `json:"timeout_seconds,omitempty" jsonschema:"how long to wait, up to 60 (default 30)"`
}

func (s *Server) waitForTask(ctx context.Context, req *mcp.CallToolRequest, in waitInput) (*mcp.CallToolResult, any, error) {
	wait := 30 * time.Second
	if in.TimeoutSeconds > 0 {
		wait = min(time.Duration(in.TimeoutSeconds)*time.Second, maxWait)
	}
	t, err := s.Tasks.Wait(ctx, principal(req).WorkspaceID, in.TaskID, wait)
	if err != nil {
		return result(nil, err)
	}
	return result(redact.PublicTask(t), nil)
}

func (s *Server) cancelTask(ctx context.Context, req *mcp.CallToolRequest, in taskInput) (*mcp.CallToolResult, any, error) {
	t, err := s.Tasks.Cancel(ctx, principal(req).WorkspaceID, in.TaskID)
	if err != nil {
		return result(nil, err)
	}
	return result(redact.PublicTask(t), nil)
}

type listInput struct {
	Status string `json:"status,omitempty" jsonschema:"queued, running, succeeded, failed or canceled"`
	Limit  int    `json:"limit,omitempty" jsonschema:"how many, up to 50 (default 10)"`
}

func (s *Server) listTasks(ctx context.Context, req *mcp.CallToolRequest, in listInput) (*mcp.CallToolResult, any, error) {
	limit := in.Limit
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	list, err := s.Tasks.Store.List(ctx, principal(req).WorkspaceID, tasks.ListFilter{Status: tasks.Status(in.Status), Limit: limit})
	if err != nil {
		return result(nil, err)
	}
	out := make([]redact.Task, len(list))
	for i, t := range list {
		out[i] = redact.PublicTask(t)
	}
	return result(map[string]any{"tasks": out}, nil)
}
