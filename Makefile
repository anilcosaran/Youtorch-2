# Common tasks. On Windows run them from Git Bash, with make installed (scoop install make).
COMPOSE := docker compose -f deploy/compose.dev.yaml
CONSOLE_PORT ?= 3000
ADMIN_PORT ?= 3001
# Loaded per recipe rather than exported: the config tests expect a clean environment.
LOAD_ENV := set -a && . ./deploy/dev.env && set +a
CHART := deploy/helm/modelvend

.PHONY: help up down reset migrate seed test test-go test-node gen images chart dev dev-gateway dev-mcp dev-worker dev-adminapi dev-console dev-admin

help:
	@echo "up        start Postgres, Redis, object storage and Mailpit"
	@echo "down      stop them and keep their data"
	@echo "reset     stop them and delete their data"
	@echo "migrate   apply the schema"
	@echo "seed      add the fake provider, a test model and a key (prints the key once)"
	@echo "dev       run every service and both apps against the local stack"
	@echo "test      run the Go tests (database included) and every workspace's check"
	@echo "chart     lint and render the Helm chart"
	@echo "images    build the service, console and admin images"

up:
	$(COMPOSE) up -d --wait

down:
	$(COMPOSE) down

reset:
	$(COMPOSE) down -v

migrate: up
	$(LOAD_ENV) && cd services && go run ./cmd/migrate up

seed: migrate
	$(LOAD_ENV) && cd services && go run ./cmd/migrate dev-seed

test: test-go test-node

test-go: up
	cd services && go vet ./...
	TEST_DATABASE_URL="$$(sed -n 's/^TEST_DATABASE_URL=//p' deploy/dev.env)" && export TEST_DATABASE_URL && cd services && go test ./...

test-node:
	npm run check

gen:
	@echo "Type generation arrives with api/*.yaml."

chart:
	helm lint $(CHART) -f $(CHART)/values-dev.yaml
	helm template modelvend $(CHART) -f $(CHART)/values-dev.yaml --namespace modelvend > /dev/null

images:
	docker build -f deploy/docker/services.Dockerfile -t modelvend-services .
	docker build -f apps/console/Dockerfile -t modelvend-console .
	docker build -f apps/admin/Dockerfile -t modelvend-admin .

# make -j runs them side by side; Ctrl-C stops them all.
dev: migrate
	$(MAKE) -j6 dev-gateway dev-mcp dev-worker dev-adminapi dev-console dev-admin

dev-gateway:
	$(LOAD_ENV) && cd services && HTTP_ADDR=:8080 go run ./cmd/gateway

dev-mcp:
	$(LOAD_ENV) && cd services && HTTP_ADDR=:8090 go run ./cmd/mcp

dev-worker:
	$(LOAD_ENV) && cd services && HTTP_ADDR=:9090 go run ./cmd/worker

dev-adminapi:
	$(LOAD_ENV) && cd services && HTTP_ADDR=:8081 go run ./cmd/adminapi

dev-console:
	npm exec --workspace apps/console -- next dev --port $(CONSOLE_PORT)

dev-admin:
	npm exec --workspace apps/admin -- next dev --port $(ADMIN_PORT)
