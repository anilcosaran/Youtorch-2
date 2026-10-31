# syntax=docker/dockerfile:1

# One image with every Go binary; a deployment picks its binary with `command`.
# Build from the repository root:
#   docker build -f deploy/docker/services.Dockerfile --build-arg VERSION=dev -t modelvend-services .
# services.Dockerfile.dockerignore next to this file trims the context to services/.

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY services/go.mod services/go.sum ./
RUN go mod download
COPY services/ ./
ARG VERSION=dev
RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags "-s -w -X github.com/brieeflabs/modelvend/services/internal/bootstrap.Version=${VERSION}" \
    -o /out/ ./cmd/...

# Has CA certificates for provider calls, no shell, runs as uid 65532.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/ /usr/local/bin/
