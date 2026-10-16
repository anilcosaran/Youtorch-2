// Package config reads the process configuration from the environment.
// Every setting has one environment variable; services/README.md lists them.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Env       string // "development" or "production"
	LogLevel  string
	LogFormat string // "json" or "text"

	// HTTPAddr is where the process listens; each binary has its own default.
	HTTPAddr string
	// MetricsAddr serves Prometheus metrics on a separate listener when set.
	MetricsAddr    string
	MigrateOnStart bool

	DatabaseURL string
	// RedisURL is optional until rate limits and health counters land.
	RedisURL string

	// PublicAPIURL is the public origin of the gateway, e.g. https://api.modelvend.ai.
	PublicAPIURL string
	// InternalWorkspaces are our own workspaces: their keys reach private models and staging versions.
	InternalWorkspaces []string

	Storage Storage
	Worker  Worker
}

// Storage is the S3-compatible bucket outputs are copied to (Cloudflare R2 in production).
type Storage struct {
	Endpoint  string
	Region    string
	Bucket    string
	AccessKey string
	SecretKey string
	UseSSL    bool
	// PublicURL is the CDN origin the bucket is served from, e.g. https://cdn.modelvend.ai.
	PublicURL string
}

// Configured reports whether outputs can be copied to our storage.
func (s Storage) Configured() bool { return s.Endpoint != "" && s.Bucket != "" }

type Worker struct {
	// Queues this process works; empty for all.
	Queues      []string
	Concurrency int
}

func (c Config) Development() bool { return c.Env == "development" }

// Load reads the environment. defaultAddr is the binary's own listen address.
func Load(defaultAddr string) (Config, error) {
	c := Config{
		Env:            get("APP_ENV", "production"),
		LogLevel:       get("LOG_LEVEL", "info"),
		LogFormat:      get("LOG_FORMAT", "json"),
		HTTPAddr:       get("HTTP_ADDR", defaultAddr),
		MetricsAddr:    os.Getenv("METRICS_ADDR"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		RedisURL:       os.Getenv("REDIS_URL"),
		PublicAPIURL:   strings.TrimRight(get("PUBLIC_API_URL", "http://localhost:8080"), "/"),
		MigrateOnStart: false,
		Storage: Storage{
			Endpoint:  os.Getenv("STORAGE_ENDPOINT"),
			Region:    get("STORAGE_REGION", "auto"),
			Bucket:    os.Getenv("STORAGE_BUCKET"),
			AccessKey: os.Getenv("STORAGE_ACCESS_KEY"),
			SecretKey: os.Getenv("STORAGE_SECRET_KEY"),
			PublicURL: strings.TrimRight(os.Getenv("STORAGE_PUBLIC_URL"), "/"),
		},
		Worker:             Worker{Queues: list(os.Getenv("WORKER_QUEUES"))},
		InternalWorkspaces: list(os.Getenv("INTERNAL_WORKSPACES")),
	}
	var errs []error
	var err error
	if c.MigrateOnStart, err = boolean("MIGRATE_ON_START", false); err != nil {
		errs = append(errs, err)
	}
	if c.Storage.UseSSL, err = boolean("STORAGE_USE_SSL", true); err != nil {
		errs = append(errs, err)
	}
	if c.Worker.Concurrency, err = integer("WORKER_CONCURRENCY", 20); err != nil {
		errs = append(errs, err)
	}
	if c.Env != "development" && c.Env != "production" {
		errs = append(errs, fmt.Errorf("APP_ENV must be development or production, not %q", c.Env))
	}
	if c.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL is required"))
	}
	// Outside development an output must never leave with the provider's URL.
	if !c.Development() && !c.Storage.Configured() {
		errs = append(errs, errors.New("STORAGE_ENDPOINT and STORAGE_BUCKET are required outside development"))
	}
	if c.Storage.Configured() && c.Storage.PublicURL == "" {
		errs = append(errs, errors.New("STORAGE_PUBLIC_URL is required with STORAGE_ENDPOINT"))
	}
	return c, errors.Join(errs...)
}

func get(name, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(name)); v != "" {
		return v
	}
	return fallback
}

func boolean(name string, fallback bool) (bool, error) {
	v := strings.TrimSpace(os.Getenv(name))
	if v == "" {
		return fallback, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("%s must be true or false, not %q", name, v)
	}
	return b, nil
}

func integer(name string, fallback int) (int, error) {
	v := strings.TrimSpace(os.Getenv(name))
	if v == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return 0, fmt.Errorf("%s must be a positive whole number, not %q", name, v)
	}
	return n, nil
}

func list(v string) []string {
	var out []string
	for _, part := range strings.Split(v, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}
