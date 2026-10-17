// Package ratelimit enforces per-workspace and per-key limits in Redis:
// requests per minute and tasks in flight, answering 429 with Retry-After.
// It also keeps the per-route health counters the router reads.
package ratelimit
