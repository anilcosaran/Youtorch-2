// Package migrations embeds the database schema, applied with goose.
package migrations

import "embed"

// FS holds the numbered SQL migrations.
//
//go:embed *.sql
var FS embed.FS

// Table is goose's version table.
const Table = "goose_db_version"
