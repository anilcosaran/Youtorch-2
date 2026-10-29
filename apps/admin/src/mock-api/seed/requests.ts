import type { BillingUnit, JsonSchema, Modality, ModelVersion, PriceTier, Route } from "@modelvend/admin-api/models";
import type { Attempt, RequestDetail, RequestStatus } from "@modelvend/admin-api/requests";
import { byPriority, defaultTier } from "../catalog";
import { createRandom, hashSeed, type Random } from "../random";
import type { ApiKeyRecord, AppRecord, CustomerRecord, ModelRecord, ProviderRecord } from "../types";
import { DAY, HOUR, MINUTE, iso, money, round } from "../util";
import type { SeedEvent } from "./audit";
import { domainOf } from "./customers";

const COUNT = 500;

const PROMPTS: Record<Modality, string[]> = {
  video: [
    "A slow dolly shot through a neon-lit night market in the rain, steam rising from food stalls",
    "Golden retriever puppy chasing bubbles in a sunlit backyard, shallow depth of field",
    "Drone shot over turquoise fjords at sunrise, mist on the water",
    "A barista pours latte art in close-up, warm morning light, 50mm",
    "Astronaut walking through a field of sunflowers, cinematic, wind in the petals",
    "Product turntable of a matte black sneaker on a concrete plinth, studio lighting",
    "Two friends laughing on a rooftop at dusk, city skyline behind them, handheld",
    "Paper boats drifting down a flooded cobblestone street, overcast, moody",
  ],
  image: [
    "Minimalist poster for a jazz festival with the words 'Blue Hour' in bold serif type",
    "Studio photo of a perfume bottle on travertine, soft shadows, pastel background",
    "Isometric illustration of a cozy reading nook with plants and a cat",
    "Portrait of an elderly fisherman, Rembrandt lighting, 85mm",
    "Flat lay of a breakfast table from above, croissants and berries, morning light",
    "Logo concept for a coffee roastery called Ember & Oak, hand-drawn",
    "Futuristic city at golden hour, glass towers with hanging gardens",
    "Children's book illustration of a fox reading under a mushroom, watercolor",
  ],
  audio: [
    "Warm lo-fi hip hop beat with vinyl crackle and soft keys",
    "Uplifting corporate acoustic guitar, light percussion",
    "Dark cinematic drone with slow strings building tension",
    "Upbeat synthwave with punchy drums and arpeggios",
  ],
  "3d": ["A low-poly treasure chest with brass trim", "A ceramic coffee mug with a chipped rim", "A stylized fox character, game-ready"],
  text: ["cat in a spaceship", "luxury watch on a rock", "sunset beach party", "cozy cabin in the snow", "sneaker splash ad"],
};

const SCRIPTS = [
  "Welcome back to the show. Today we go behind the scenes of our biggest launch yet.",
  "[warm] Thanks for calling. Your order has shipped and should arrive on Thursday.",
  "In 1969, three astronauts left Earth on a journey that would change how we see our planet.",
  "Step one: preheat the oven to two hundred degrees. Step two: whisk the eggs with the sugar until pale.",
  "[whispers] Don't look now, but someone has been reading over your shoulder this whole time.",
  "Bienvenidos a nuestro curso. En esta lección aprenderás los conceptos básicos del diseño.",
  "Our quarterly results show growth across every region, led by a strong holiday season.",
];

/**
 * How requests fail. The customer is never charged for a failed request; `providerCharges` marks failures the
 * provider still bills us for (it generated the output before its filter blocked it), which show as a cost.
 */
const ERRORS = [
  { code: "upstream_timeout", message: "The provider didn't finish within the timeout.", weight: 3, fallback: true, providerCharges: false },
  { code: "provider_error", message: "The provider answered 500 (internal error).", weight: 2, fallback: true, providerCharges: false },
  { code: "content_policy", message: "The provider's safety filter blocked the output after it was generated.", weight: 2.5, fallback: false, providerCharges: true },
  { code: "invalid_input", message: "image_url couldn't be downloaded (HTTP 403 from the host).", weight: 2.5, fallback: false, providerCharges: false },
] as const;

const RESOLUTION: Record<string, [number, number]> = {
  "480p": [854, 480],
  "720p": [1280, 720],
  "768p": [1366, 768],
  "1080p": [1920, 1080],
  "2k": [2560, 1440],
  "4k": [3840, 2160],
};

const FALLBACK_P50: Record<Modality, number> = { video: 50000, image: 7000, audio: 2500, "3d": 85000, text: 1200 };

const upload = (random: Random, ext: string) => `https://cdn.modelvend.ai/u/${random.hex(16)}.${ext}`;

/** A value for one schema property, plausible for its name. */
function sampleValue(name: string, schema: Record<string, unknown>, modality: Modality, random: Random): unknown {
  if (Array.isArray(schema.enum)) return random.pick(schema.enum);
  if (name === "prompt") return random.pick(PROMPTS[modality]);
  if (name === "negative_prompt") return "blurry, low quality, watermark, extra fingers";
  if (name === "text") return random.sample(SCRIPTS, random.int(1, 4)).join(" ");
  if (name === "voice_id") return random.pick(["aria", "roger", "sarah", "charlie", "laura"]);
  if (name === "language_code") return random.pick(["en", "en", "tr", "es", "de", "fr"]);
  if (name === "style") return "commercial studio";
  if (name === "seed") return random.int(0, 2 ** 31 - 1);
  if (schema.format === "uri") return upload(random, name.startsWith("video") ? "mp4" : "jpg");
  if (schema.type === "array") {
    const max = typeof schema.maxItems === "number" ? schema.maxItems : 3;
    return Array.from({ length: random.int(1, Math.min(3, max)) }, () => upload(random, "jpg"));
  }
  const min = typeof schema.minimum === "number" ? schema.minimum : 0;
  const max = typeof schema.maximum === "number" ? schema.maximum : 1;
  if (schema.type === "integer") return schema.default !== undefined && random.chance(0.6) ? schema.default : random.int(min, max);
  if (schema.type === "number") return round(random.float(min, max), 2);
  if (schema.type === "boolean") return typeof schema.default === "boolean" && random.chance(0.8) ? schema.default : random.chance(0.5);
  return "sample";
}

/** An input that validates against the version's schema. */
function sampleInput(schema: JsonSchema, modality: Modality, random: Random): Record<string, unknown> {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required ?? []) as string[];
  const input: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    const odds = name === "image_url" ? (modality === "3d" ? 0.9 : 0.45) : name === "negative_prompt" ? 0.2 : name === "seed" ? 0.3 : 0.55;
    if (required.includes(name) || random.chance(odds)) input[name] = sampleValue(name, property, modality, random);
  }
  if (modality === "3d" && !input.image_url && !input.prompt) input.prompt = random.pick(PROMPTS["3d"]);
  return input;
}

/** Fills `{{input.x}}` placeholders in an app step's params the way a run would. */
function resolveParams(value: unknown, random: Random): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveParams(item, random));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveParams(item, random)]));
  }
  if (typeof value !== "string" || !value.includes("{{")) return value;
  const whole = /^\{\{([^}]+)\}\}$/.exec(value)?.[1];
  const typed: Record<string, () => unknown> = {
    "input.image": () => upload(random, "jpg"),
    "input.scale": () => random.pick([2, 4]),
    "input.style": () => random.pick(["photo", "illustration"]),
    "input.format": () => random.pick(["glb", "fbx", "usdz"]),
    "input.script": () => random.sample(SCRIPTS, random.int(1, 3)).join(" "),
    "input.transcript": () => random.pick(SCRIPTS),
    "input.voice": () => random.pick(["aria", "roger", "sarah", "charlie"]),
    "input.language": () => random.pick(["en", "tr", "es", "de"]),
    "input.bpm": () => random.int(80, 128),
    "steps.boost.prompt": () => "Studio product photo on warm travertine, soft window light from the left, gentle reflections, 85mm",
  };
  if (whole && typed[whole]) return typed[whole]();
  const words: Record<string, string[]> = {
    "input.motion": ["Subtle", "Dynamic"],
    "input.camera": ["static", "push-in", "orbit"],
    "input.scene": ["Studio", "Travertine", "Splash", "Outdoor"],
    "input.mood": ["Calm", "Uplifting", "Tense"],
    "input.genre": ["lo-fi", "acoustic", "synthwave"],
  };
  return value.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => random.pick(words[key] ?? ["sample"]));
}

/** Billing units for an input. */
function unitsFor(unit: BillingUnit, input: Record<string, unknown>, schema: JsonSchema, random: Random): number {
  switch (unit) {
    case "second": {
      if (typeof input.duration === "number") return input.duration;
      const duration = (schema.properties as Record<string, { default?: unknown }> | undefined)?.duration?.default;
      return typeof duration === "number" ? duration : 5;
    }
    case "image":
      return typeof input.num_images === "number" ? input.num_images : 1;
    case "megapixel":
      return random.pick([4.2, 8.3, 8.3, 16.6, 33.2]);
    case "1k_chars":
      return round(String(input.text ?? "").length / 1000, 3) || 0.1;
    case "1m_tokens":
      return round(random.int(600, 2400) / 1_000_000, 6);
    default:
      return 1;
  }
}

function outputFor(modality: Modality, id: string, input: Record<string, unknown>, units: number, random: Random): Record<string, unknown> {
  const base = `https://cdn.modelvend.ai/o/${id}`;
  if (modality === "video") {
    let [width, height] = RESOLUTION[String(input.resolution)] ?? [1920, 1080];
    if (input.aspect_ratio === "9:16") [width, height] = [height, width];
    if (input.aspect_ratio === "1:1") width = height;
    return { video: { url: `${base}.mp4`, content_type: "video/mp4", duration: units, width, height }, seed: random.int(0, 2 ** 31 - 1) };
  }
  if (modality === "image") {
    const count = typeof input.num_images === "number" ? input.num_images : 1;
    const format = input.output_format === "jpeg" ? "jpeg" : input.output_format === "webp" ? "webp" : "png";
    const side = random.pick([1024, 2048]);
    return {
      images: Array.from({ length: count }, (_, i) => ({ url: `${base}-${i}.${format === "jpeg" ? "jpg" : format}`, content_type: `image/${format}`, width: side, height: side })),
      seed: random.int(0, 2 ** 31 - 1),
    };
  }
  if (modality === "audio") {
    const duration = input.text ? round(String(input.text).length / 15, 1) : 30;
    return { audio: { url: `${base}.mp3`, content_type: "audio/mpeg", duration } };
  }
  if (modality === "3d") {
    const format = typeof input.format === "string" ? input.format : "glb";
    return { mesh: { url: `${base}.${format}`, format, content_type: format === "glb" ? "model/gltf-binary" : "application/octet-stream" }, thumbnail: { url: `${base}.png` } };
  }
  const tokens = Math.round(units * 1_000_000);
  return {
    prompt: "A detailed studio product photograph on warm travertine with soft window light, gentle reflections and a shallow depth of field",
    negative_prompt: "text, watermark, clutter",
    usage: { input_tokens: Math.round(tokens * 0.35), output_tokens: tokens - Math.round(tokens * 0.35) },
  };
}

function upstreamId(providerId: string, random: Random): string {
  switch (providerId) {
    case "fal":
      return `${random.hex(8)}-${random.hex(4)}-${random.hex(4)}-${random.hex(4)}-${random.hex(12)}`;
    case "replicate":
      return random.id("", 26);
    case "google-vertex":
      return `operations/${random.int(100000000, 999999999)}${random.int(100000000, 999999999)}`;
    case "openai":
      return `resp_${random.hex(24)}`;
    case "kling":
      return String(random.int(100000000, 999999999)) + String(random.int(100000000, 999999999));
    default:
      return random.hex(24);
  }
}

interface Choice {
  model: ModelRecord;
  version: ModelVersion;
  app: string | null;
  input: Record<string, unknown>;
}

/** Requests over the last 7 days, denser toward now, newest first. */
export function seedRequests(
  now: number,
  random: Random,
  data: { models: ModelRecord[]; providers: ProviderRecord[]; customers: CustomerRecord[]; apiKeys: ApiKeyRecord[]; apps: AppRecord[] },
): { requests: RequestDetail[]; events: SeedEvent[] } {
  const providerName = (id: string) => data.providers.find((p) => p.id === id)?.name ?? id;
  const customers = data.customers.filter((c) => c.status === "active" && c.requests30d > 0);
  const callable = data.models.filter((m) => m.defaultVersion !== null && m.visibility !== "private");
  const liveApps = data.apps.filter((a) => a.status === "live");

  function choose(random: Random, createdAt: number): Choice {
    if (random.chance(0.12)) {
      const app = random.weighted(liveApps, (a) => a.runs24h);
      const release = app.releases.find((r) => r.status === "live") ?? app.releases[0];
      const step = release.steps[release.steps.length - 1];
      const model = data.models.find((m) => m.id === step.modelId);
      const version = model?.versionList.find((v) => v.id === step.version);
      if (model && version) return { model, version, app: app.slug, input: resolveParams(step.params, random) as Record<string, unknown> };
    }
    const open = callable.filter((m) => m.state === "active" || createdAt < Date.parse(m.updatedAt));
    const model = random.weighted(open, (m) => m.requests24h);
    const deprecated = model.versionList.filter((v) => v.status === "deprecated");
    const version =
      deprecated.length > 0 && random.chance(0.1)
        ? random.pick(deprecated)
        : (model.versionList.find((v) => v.id === model.defaultVersion) ?? model.versionList[0]);
    return { model, version, app: null, input: sampleInput(version.inputSchema, model.modality, random) };
  }

  const requests: RequestDetail[] = [];
  for (let i = 0; i < COUNT; i++) {
    const random = createRandom(hashSeed(`request:${i}`));
    const id = random.id("req_", 16);
    const age = i < 6 ? random.int(4, 170) * 1000 : Math.max(200_000, 7 * DAY * Math.pow(random.next(), 1.8));
    const createdAt = now - age;
    const customer = random.weighted(
      customers.filter((c) => Date.parse(c.createdAt) < createdAt),
      (c) => Math.sqrt(c.requests30d),
    );
    const keys = data.apiKeys.filter(
      (k) =>
        k.customerId === customer.id &&
        k.env === "live" &&
        Date.parse(k.createdAt) < createdAt &&
        (k.revokedAt === null || Date.parse(k.revokedAt) > createdAt),
    );
    const key = keys.length > 0 ? random.weighted(keys, (k) => (k.name === "Production" ? 4 : 1)) : null;
    if (!key) continue;

    const { model, version, app, input } = choose(random, createdAt);
    const modality = model.modality;
    const mode = modality === "video" || modality === "3d" ? "queue" : "sync";
    const pricing = version.pricing;
    const tier: PriceTier = random.chance(0.75) ? defaultTier(pricing) : random.pick(pricing.tiers);
    const scale = tier.price / (defaultTier(pricing).price || 1);
    const units = unitsFor(pricing.unit, input, version.inputSchema, random);
    const routes = [...version.routes].sort(byPriority);
    const active = routes.filter((r) => r.status === "active");
    const usable = active.length > 0 ? active : routes;
    if (usable.length === 0) continue;

    let status: RequestStatus;
    const recent = age < (mode === "queue" ? 4 * MINUTE : 30_000);
    if (recent) status = mode === "queue" && random.chance(0.4) ? "queued" : "running";
    else {
      const roll = random.next();
      status = roll < 0.065 ? "failed" : roll < 0.08 && mode === "queue" ? "canceled" : "succeeded";
    }
    const failure = status === "failed" ? random.weighted(ERRORS, (e) => e.weight) : null;
    const first =
      version.routing.strategy === "weighted" ? random.weighted(usable, (r) => r.weight) : usable[0];
    const second = usable.find((r) => r !== first) ?? null;
    const fellBack = status === "succeeded" && second !== null && version.routing.fallbacks && random.chance(0.06);

    const attempts: Attempt[] = [];
    const events: RequestDetail["events"] = [];
    let clock = createdAt;
    const accepted = `Accepted from key ${key.prefix}`;
    events.push({ at: iso(clock), status: mode === "queue" ? "queued" : "running", detail: mode === "queue" ? accepted : `${accepted} (sync)` });
    clock += random.int(80, 600);

    const runAttempt = (route: Route, outcome: Attempt["status"], error: string | null) => {
      const p50 = route.health.p50Ms ?? FALLBACK_P50[modality];
      const latency =
        outcome === "timeout" ? version.routing.timeoutSeconds * 1000 : Math.round(p50 * random.float(0.6, 1.7) * (outcome === "failed" ? 0.4 : 1));
      events.push({ at: iso(clock), status: "attempt", detail: `Attempt ${attempts.length + 1} on ${providerName(route.providerId)} (${route.upstreamModel})` });
      if (mode === "queue" && attempts.length === 0) events.push({ at: iso(clock + 900), status: "running", detail: "The provider started processing." });
      attempts.push({
        number: attempts.length + 1,
        provider: route.providerId,
        routeId: route.id,
        upstreamModel: route.upstreamModel,
        upstreamId: upstreamId(route.providerId, random),
        status: outcome,
        latencyMs: latency,
        error,
        startedAt: iso(clock),
      });
      clock += latency;
    };

    // Only a success is billed to the customer; the route that produced output is what the provider charged for.
    let billedRoute: Route | null = null;
    let chargedRoute: Route | null = null;
    if (status === "succeeded") {
      if (fellBack && second) {
        const timedOut = random.chance(0.5);
        runAttempt(first, timedOut ? "timeout" : "failed", timedOut ? "upstream_timeout" : "provider_error");
        events.push({ at: iso(clock), status: "attempt", detail: `Attempt 1 ${timedOut ? "timed out" : "failed"}; falling back to ${providerName(second.providerId)}.` });
        runAttempt(second, "succeeded", null);
        billedRoute = second;
      } else {
        runAttempt(first, "succeeded", null);
        billedRoute = first;
      }
      chargedRoute = billedRoute;
      const files = modality === "image" && typeof input.num_images === "number" ? input.num_images : 1;
      events.push({ at: iso(clock), status: "succeeded", detail: `Output stored (${files} ${files === 1 ? "file" : "files"}).` });
    } else if (status === "failed" && failure) {
      const outcome: Attempt["status"] = failure.code === "upstream_timeout" ? "timeout" : "failed";
      runAttempt(first, outcome, failure.code);
      if (failure.fallback && second && version.routing.fallbacks) {
        events.push({ at: iso(clock), status: "attempt", detail: `Attempt 1 failed; falling back to ${providerName(second.providerId)}.` });
        runAttempt(second, outcome, failure.code);
      }
      if (failure.providerCharges) chargedRoute = first;
      events.push({ at: iso(clock), status: "failed", detail: failure.message });
    } else if (status === "canceled") {
      runAttempt(first, "canceled", null);
      events.push({ at: iso(clock), status: "canceled", detail: "Canceled by the customer." });
    } else if (status === "running") {
      events.push({ at: iso(clock), status: "attempt", detail: `Attempt 1 on ${providerName(first.providerId)} (${first.upstreamModel})` });
      if (mode === "queue") events.push({ at: iso(clock + 900), status: "running", detail: "The provider started processing." });
    }

    const finished = status === "succeeded" || status === "failed" || status === "canceled";
    const webhookUrl = mode === "queue" && random.chance(0.4) ? `https://api.${domainOf(customer.email)}/webhooks/modelvend` : null;
    if (webhookUrl && finished) {
      events.push({ at: iso(clock + random.int(150, 400)), status, detail: `Webhook delivered to ${webhookUrl} (HTTP 200).` });
    }
    const end = Math.min(clock, now - 1000);

    requests.push({
      id,
      model: model.id,
      version: version.id,
      app,
      customer: { id: customer.id, name: customer.name },
      keyPrefix: key.prefix,
      status,
      provider: finished && attempts.length > 0 ? attempts[attempts.length - 1].provider : null,
      attempts: attempts.length,
      latencyMs: finished ? end - createdAt : null,
      units,
      unit: pricing.unit,
      // units × tier price × (1 − promo), as billing quotes it.
      price: billedRoute ? money(units * tier.price * (1 - (pricing.promo ?? 0))) : 0,
      cost: chargedRoute ? money(units * chargedRoute.cost.price * scale) : 0,
      errorCode: failure?.code ?? null,
      createdAt: iso(createdAt),
      mode,
      input,
      output: status === "succeeded" ? outputFor(modality, id, input, units, random) : null,
      errorMessage: failure?.message ?? null,
      webhookUrl,
      refundedAt: null,
      attemptList: attempts,
      events: events.filter((event) => Date.parse(event.at) <= now),
    });
  }
  requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Two refunds by support, written to the customers' ledgers.
  const events: SeedEvent[] = [];
  const reasons = ["Duplicate charge: the customer's client retried after a network error.", "Output was a black frame; customer sent a screenshot."];
  const refundable = requests.filter((r) => r.status === "succeeded" && r.price > 0.2 && Date.parse(r.createdAt) < now - DAY);
  for (const [index, request] of random.sample(refundable, 2).entries()) {
    const at = Math.min(Date.parse(request.createdAt) + random.int(3, 30) * HOUR, now - HOUR);
    const reason = reasons[index];
    request.refundedAt = iso(at);
    request.events.push({ at: iso(at), status: request.status, detail: `Refunded $${request.price.toFixed(2)} to the customer by Deniz Aydın: ${reason}` });
    const customer = data.customers.find((c) => c.id === request.customer.id);
    customer?.ledger.unshift({ id: random.id("led_", 12), kind: "refund", amount: request.price, note: `Refund for ${request.id}: ${reason}`, operator: "Deniz Aydın", at: iso(at) });
    customer?.ledger.sort((a, b) => b.at.localeCompare(a.at));
    events.push({ at, operatorId: "op_deniz", action: "request.refund", targetType: "request", targetId: request.id, detail: { amount: request.price, reason, customerId: request.customer.id } });
  }

  // Keep customers and keys consistent with their latest requests.
  for (const request of requests) {
    const customer = data.customers.find((c) => c.id === request.customer.id);
    if (customer && (customer.lastActiveAt === null || customer.lastActiveAt < request.createdAt)) customer.lastActiveAt = request.createdAt;
    const key = data.apiKeys.find((k) => k.prefix === request.keyPrefix);
    if (key && (key.lastUsedAt === null || key.lastUsedAt < request.createdAt)) key.lastUsedAt = request.createdAt;
  }
  return { requests, events };
}
