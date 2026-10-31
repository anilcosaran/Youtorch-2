# Deploying Modelvend

| Path                  | What it is                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| `compose.dev.yaml`    | Local Postgres, Redis, SeaweedFS (S3) and Mailpit; `make up` starts them  |
| `dev.env`             | Local settings pointing at them; throwaway values, not secrets            |
| `docker/`             | The image holding every Go binary                                         |
| `helm/modelvend/`     | The chart: services, apps, migration job, CloudNativePG, Redis, isolation |
| `argocd/`             | The Argo CD project and the dev application                               |
| `secrets/`            | The keys of the secret that lives outside Git, and a check for them       |

## How a change reaches the dev cluster

1. A push to `main` runs `.github/workflows/images.yml`, which publishes the images to GHCR.
2. The workflow commits their digests to `helm/modelvend/values-dev.yaml`.
3. Argo CD sees the commit and syncs in order: database and Redis, then the migration job, then the deployments.

## Setting up the dev cluster

This needs doing once. The cluster must already run Argo CD and the CloudNativePG operator.

1. Check the operator and its namespace: `networkPolicy.platformNamespaces` must name it.
2. Create the namespace and a pull secret with a token that can read the GHCR packages:

   ```bash
   kubectl create namespace modelvend
   ```

   ```bash
   kubectl -n modelvend create secret docker-registry ghcr-pull --docker-server=ghcr.io --docker-username=<user> --docker-password=<token>
   ```

3. Create `modelvend-secrets` from a copy of `secrets/modelvend-secrets.example.env` kept outside the repository, then check it:

   ```bash
   kubectl -n modelvend create secret generic modelvend-secrets --from-env-file=<your copy>
   ```

   ```bash
   deploy/secrets/check.sh modelvend
   ```

4. Give Argo CD read access to `git@github.com:brieeflabs/Modelvend.git`, then apply the project and the application:

   ```bash
   kubectl apply -f deploy/argocd/project.yaml -f deploy/argocd/application-dev.yaml
   ```

5. To open it up, set in `values-dev.yaml`: `ingress.enabled`, `ingress.className`, `ingress.hosts`, `ingress.annotations` (the allowlist), `ingress.tlsSecretName`, `networkPolicy.ingressControllerNamespace` and `publicApiUrl`. Set the repository variables `DEV_CONSOLE_URL`, `DEV_API_BASE_URL` and `DEV_MCP_URL`, since the apps inline them at build time.

The digest commit pushes straight to `main`, so branch protection must let `github-actions[bot]` through.

## Not verified

The chart passes `helm lint`, `helm template` and `kubeconform`, and the images ran locally under the same read-only settings. It hasn't been applied to a cluster, and `postgresql.cnpg.io/v1` `Cluster` isn't schema-checked.
