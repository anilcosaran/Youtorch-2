// Package logging builds the process logger.
package logging

import (
	"log/slog"
	"os"

	"github.com/brieeflabs/modelvend/services/internal/platform/config"
)

// New writes JSON (or text with LOG_FORMAT=text) to stdout at LOG_LEVEL,
// tagged with the process name.
func New(cfg config.Config, process string) *slog.Logger {
	var level slog.Level
	if err := level.UnmarshalText([]byte(cfg.LogLevel)); err != nil {
		level = slog.LevelInfo
	}
	opts := &slog.HandlerOptions{Level: level}
	var handler slog.Handler = slog.NewJSONHandler(os.Stdout, opts)
	if cfg.LogFormat == "text" {
		handler = slog.NewTextHandler(os.Stdout, opts)
	}
	return slog.New(handler).With("process", process)
}
