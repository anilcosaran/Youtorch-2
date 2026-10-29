import { ADAPTERS, PROVIDER_KINDS } from "@modelvend/admin-api/providers";
import { audit, changes } from "../audit";
import { conflict, fail, invalid, invalidState, notFound } from "../http";
import { route, type Context, type RouteDef } from "../router";
import type { ProviderRecord, Store } from "../types";
import { clone } from "../util";
import { has, idField, nested, nullableNumber, oneOf, reason, stringList, text, within, type Body } from "../validate";
import { providerView } from "../views";

const PROVIDER_ID = /^[a-z0-9][a-z0-9-]*$/;

function findProvider(store: Store, id: string): ProviderRecord {
  return store.providers.find((p) => p.id === id) ?? notFound("provider");
}

function readBaseUrl(body: Body, required: boolean): string | undefined {
  const value = text(body, "baseUrl", { max: 300, ...(required ? { required: "Enter the API's base URL." } : {}) });
  if (value === undefined) return undefined;
  let url: URL | null = null;
  try {
    url = new URL(value);
  } catch {
    // Reported below.
  }
  if (!url || url.protocol !== "https:") invalid("baseUrl", "Enter an https:// URL.");
  return value.replace(/\/+$/, "");
}

function readRegions(body: Body, required: boolean): string[] | undefined {
  const regions = stringList(body, "regions", 20);
  if ((required || regions !== undefined) && (!regions || regions.length === 0)) invalid("regions", "Add at least one region.");
  return regions;
}

function done(ctx: Context, provider: ProviderRecord) {
  provider.updatedAt = new Date().toISOString();
  return providerView(ctx.store, provider);
}

function createProvider(ctx: Context) {
  const { store, body } = ctx;
  const id = idField(body, "id", "provider ID", PROVIDER_ID);
  const name = text(body, "name", { max: 80, required: "Enter a name." });
  const kind = oneOf(body, "kind", PROVIDER_KINDS, true);
  const adapter = oneOf(body, "adapter", ADAPTERS, true);
  const baseUrl = readBaseUrl(body, true) ?? "";
  const regions = readRegions(body, true) ?? [];
  if (store.providers.some((p) => p.id === id)) conflict("A provider with this ID already exists.", { id: "A provider with this ID already exists." });
  const at = new Date().toISOString();
  const provider: ProviderRecord = {
    id,
    name,
    kind,
    adapter,
    // Nothing can reach it until it has a credential and is resumed.
    status: "disabled",
    baseUrl,
    regions,
    credential: { configured: false, hint: null, source: null, rotatedAt: null },
    limits: { concurrency: null, requestsPerMinute: null },
    health: { state: "operational", successRate24h: null, p50Ms: null, incidents7d: 0, checkedAt: null },
    cost30d: 0,
    balance: null,
    createdAt: at,
    updatedAt: at,
  };
  store.providers.push(provider);
  audit(ctx, "provider.create", "provider", id, { name, kind, adapter });
  return providerView(store, provider);
}

/** The secret from the body, trimmed; 422 when it is too short to be one. */
function readSecret(body: Body): string {
  const secret = typeof body.secret === "string" ? body.secret.trim() : "";
  if (secret.length < 8) invalid("secret", "Paste the full secret; it looks too short.");
  return secret;
}

/** Stores a new secret; only its hint is kept in the clear. */
function storeCredential(ctx: Context, provider: ProviderRecord, secret: string) {
  const hint = `…${secret.slice(-4)}`;
  provider.credential = { configured: true, hint, source: "console", rotatedAt: new Date().toISOString() };
  audit(ctx, "provider.credential", "provider", provider.id, { hint });
}

function updateProvider(ctx: Context) {
  const provider = findProvider(ctx.store, ctx.params.id);
  const { body } = ctx;
  const before = clone(provider);
  const name = text(body, "name", { max: 80 });
  if (name === "") invalid("name", "Enter a name.");
  const baseUrl = readBaseUrl(body, false);
  const moves = baseUrl !== undefined && baseUrl !== provider.baseUrl;
  const hasSecret = body.secret !== undefined && body.secret !== null && body.secret !== "";
  // The stored secret goes only to the endpoint it was entered for: moving needs it entered again.
  if (moves && provider.credential.configured && !hasSecret) {
    const message = "Enter the API key again to change the endpoint; the stored one stays with the old one.";
    fail(422, "credential_required", message, { secret: message });
  }
  const secret = hasSecret ? readSecret(body) : undefined;
  const regions = readRegions(body, false);
  const limits = has(body, "limits") ? nested(body, "limits") : null;
  const { concurrency, rpm } = limits
    ? within("limits", () => ({
        concurrency: nullableNumber(limits, "concurrency", { min: 1, integer: true }),
        rpm: nullableNumber(limits, "requestsPerMinute", { min: 1, integer: true }),
      }))
    : { concurrency: undefined, rpm: undefined };
  // Everything is valid: apply it all, so a refused request changes nothing.
  if (name !== undefined) provider.name = name;
  if (baseUrl !== undefined) provider.baseUrl = baseUrl;
  if (secret !== undefined) storeCredential(ctx, provider, secret);
  if (regions) provider.regions = regions;
  if (concurrency !== undefined) provider.limits.concurrency = concurrency;
  if (rpm !== undefined) provider.limits.requestsPerMinute = rpm;
  const changed = changes(before, provider, ["name", "baseUrl", "regions", "limits"]);
  if (Object.keys(changed).length > 0) audit(ctx, "provider.update", "provider", provider.id, changed);
  return done(ctx, provider);
}

function pauseProvider(ctx: Context) {
  const provider = findProvider(ctx.store, ctx.params.id);
  const why = reason(ctx.body);
  if (provider.status === "paused") conflict("The provider is already paused.");
  if (provider.status === "disabled") invalidState("The provider is disabled, so it gets no traffic to pause.");
  provider.status = "paused";
  audit(ctx, "provider.pause", "provider", provider.id, { reason: why });
  return done(ctx, provider);
}

function resumeProvider(ctx: Context) {
  const provider = findProvider(ctx.store, ctx.params.id);
  if (provider.status === "active") conflict("The provider is already active.");
  if (!provider.credential.configured) invalidState("Set a credential before turning the provider on.", "no_credential");
  const from = provider.status;
  provider.status = "active";
  audit(ctx, "provider.resume", "provider", provider.id, { from });
  return done(ctx, provider);
}

function setCredential(ctx: Context) {
  const provider = findProvider(ctx.store, ctx.params.id);
  storeCredential(ctx, provider, readSecret(ctx.body));
  return done(ctx, provider);
}

function checkProvider(ctx: Context) {
  const provider = findProvider(ctx.store, ctx.params.id);
  provider.health.checkedAt = new Date().toISOString();
  const view = providerView(ctx.store, provider);
  if (!provider.credential.configured) {
    return { ok: false, latencyMs: 0, message: "No credential is set for this provider.", provider: view };
  }
  const latencyMs = ctx.store.random.int(90, 450);
  const message =
    provider.health.state === "operational"
      ? `Authenticated in ${latencyMs} ms.`
      : `Authenticated in ${latencyMs} ms, but the provider reports ${provider.health.state === "outage" ? "an outage" : "degraded service"}.`;
  return { ok: true, latencyMs, message, provider: view };
}

export const providerRoutes: RouteDef[] = [
  route("GET", "/providers", "providers.view", ({ store }) => store.providers.map((p) => providerView(store, p))),
  route("POST", "/providers", "providers.edit", createProvider),
  route("PATCH", "/providers/:id", "providers.edit", updateProvider),
  route("POST", "/providers/:id/pause", "providers.edit", pauseProvider),
  route("POST", "/providers/:id/resume", "providers.edit", resumeProvider),
  route("PUT", "/providers/:id/credential", "providers.edit", setCredential),
  // Calls out with the stored credential and writes health, so it is a change.
  route("POST", "/providers/:id/check", "providers.edit", checkProvider),
];
