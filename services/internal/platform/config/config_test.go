package config

import (
	"strings"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("DATABASE_URL", "postgres://localhost/modelvend")
	c, err := Load(":8080")
	if err != nil {
		t.Fatal(err)
	}
	if c.HTTPAddr != ":8080" || c.Worker.Concurrency != 20 || c.LogFormat != "json" {
		t.Fatalf("unexpected defaults: %+v", c)
	}
	if c.Storage.Configured() {
		t.Fatal("storage should be unconfigured")
	}
}

func TestLoadRequiresStorageInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("DATABASE_URL", "postgres://localhost/modelvend")
	_, err := Load(":8080")
	if err == nil || !strings.Contains(err.Error(), "STORAGE_ENDPOINT") {
		t.Fatalf("want a storage error, got %v", err)
	}
}

func TestLoadReportsEveryProblem(t *testing.T) {
	t.Setenv("APP_ENV", "staging")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("WORKER_CONCURRENCY", "zero")
	_, err := Load(":8080")
	for _, want := range []string{"APP_ENV", "DATABASE_URL", "WORKER_CONCURRENCY"} {
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("error should mention %s: %v", want, err)
		}
	}
}

func TestWorkerQueues(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("DATABASE_URL", "postgres://localhost/modelvend")
	t.Setenv("WORKER_QUEUES", " dispatch, ,poll ")
	c, err := Load(":9090")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(c.Worker.Queues, "|") != "dispatch|poll" {
		t.Fatalf("queues: %q", c.Worker.Queues)
	}
}
