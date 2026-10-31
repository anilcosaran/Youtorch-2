import type { LedgerEntry, LimitOverrides } from "@modelvend/admin-api/customers";
import { createRandom, hashSeed, type Random } from "../random";
import type { CustomerRecord, ModelRecord } from "../types";
import { DAY, HOUR, MINUTE, iso, money, round, startOfUtcDay, toMicros, utcDay } from "../util";
import type { SeedEvent } from "./audit";

const COMPANIES: [string, string][] = [
  ["Lumafilm", "lumafilm.com"],
  ["Pixelforge", "pixelforge.io"],
  ["Northwind Studio", "northwind.studio"],
  ["Brightframe", "brightframe.co"],
  ["Cutline Media", "cutline.media"],
  ["Reelcraft", "reelcraft.app"],
  ["Mosaic Labs", "mosaiclabs.ai"],
  ["Halftone", "halftone.design"],
  ["Glimmer", "glimmer.app"],
  ["Shopwise", "shopwise.co"],
  ["Canvasly", "canvasly.io"],
  ["Adloop", "adloop.co"],
  ["Studio Kite", "studiokite.com"],
  ["Vantage Retail", "vantageretail.com"],
  ["Echo Podcasts", "echopods.fm"],
  ["Narrato", "narrato.ai"],
  ["Motionworks", "motionworks.tv"],
  ["Kubik 3D", "kubik3d.com"],
  ["Polyform Games", "polyform.games"],
  ["Tinybox Games", "tinybox.games"],
  ["Fable & Co", "fableco.com"],
  ["Brandwave", "brandwave.io"],
  ["Clipstack", "clipstack.app"],
  ["Avenue Commerce", "avenuecommerce.com"],
  ["Hearth Homes", "hearthhomes.com"],
  ["Atlas Learning", "atlaslearning.org"],
  ["Mirelo", "mirelo.app"],
  ["Sundial Labs", "sundial.dev"],
  ["Rocketship Ads", "rocketship.ad"],
  ["Paperplane", "paperplane.so"],
  ["Foundry Nine", "foundrynine.com"],
  ["Quietroom Audio", "quietroom.audio"],
  ["Orbit Creative", "orbitcreative.co"],
  ["Lattice Health", "latticehealth.com"],
  ["Trailhead Travel", "trailhead.travel"],
  ["Nimbus Docs", "nimbusdocs.com"],
  ["Marble Fashion", "marble.fashion"],
  ["Kiln Interactive", "kiln.gg"],
  ["Driftwood Films", "driftwoodfilms.com"],
  ["Sparrow Social", "sparrow.social"],
  ["Plume Beauty", "plumebeauty.com"],
  ["Cobalt Analytics", "cobalt.dev"],
  ["Zest Kitchen", "zestkitchen.co"],
  ["Harbor Realty", "harborrealty.com"],
  ["Prism Education", "prism.education"],
  ["Wildcard Studio", "wildcard.studio"],
  ["Meridian News", "meridian.news"],
  ["Bento Apps", "bento.so"],
  ["Ferro Automotive", "ferroauto.com"],
  ["Larkspur Toys", "larkspurtoys.com"],
  ["Hexa Robotics", "hexarobotics.ai"],
  ["Tideline Music", "tideline.fm"],
  ["Juniper Labs", "juniperlabs.io"],
  ["Copperleaf", "copperleaf.app"],
  ["Indigo Print", "indigoprint.com"],
  ["Stellar Kids", "stellarkids.tv"],
  ["Velvet Hour", "velvethour.co"],
  ["Granite Insurance", "graniteins.com"],
  ["Pebble Pets", "pebblepets.com"],
  ["Kumo Translate", "kumotranslate.com"],
];

const FIRST = [
  "Ava", "Liam", "Sofia", "Noah", "Mia", "Elif", "Kenji", "Priya", "Lucas", "Amara", "Mateo", "Hana", "Omar", "Chloe",
  "Arjun", "Lea", "Yuki", "Diego", "Freya", "Malik", "Ines", "Tariq", "Nora", "Felix", "Zara", "Emre", "Isabel", "Kai",
  "Leila", "Oscar", "Selin", "Ravi", "Maya", "Hugo", "Aiko", "Bruno", "Camila", "Daniel", "Esra", "Finn",
];

const LAST = [
  "Chen", "Okafor", "Novak", "Silva", "Kim", "Yılmaz", "Tanaka", "Sharma", "Martin", "Haddad", "Rossi", "Müller",
  "Andersen", "Costa", "Nguyen", "Dubois", "Kowalski", "Reyes", "Larsen", "Ibrahim", "Petrov", "Moreau", "Lindgren",
  "Patel", "Schmidt", "Kaya", "O'Brien", "Fischer", "Alvarez", "Sato", "Becker", "Demir", "Hughes", "Jensen",
];

/** How much a customer uses; there are no plans, this only makes the data look real. */
type Size = "free" | "standard" | "scale" | "enterprise";

const SIZE_PLAN: [Size, number][] = [
  ["enterprise", 6],
  ["scale", 12],
  ["standard", 26],
  ["free", 16],
];

/** Tasks per 30 days. */
const VOLUME: Record<Size, [number, number]> = {
  free: [0, 150],
  standard: [300, 6000],
  scale: [8000, 40000],
  enterprise: [40000, 200000],
};

const BALANCE: Record<Size, [number, number]> = {
  free: [0, 8],
  standard: [20, 900],
  scale: [400, 9000],
  enterprise: [5000, 60000],
};

const SUSPENSIONS = [
  { reason: "Chargeback on a $500 top-up; card issuer reports fraud. Suspended pending the dispute.", daysAgo: 3, by: "op_deniz" },
  { reason: "Repeated content policy violations: 40+ blocked requests for prohibited content in one day.", daysAgo: 6, by: "op_anil" },
  { reason: "Card testing pattern: 14 failed top-ups from different cards in an hour.", daysAgo: 11, by: "op_deniz" },
];

/** Strips accents for email addresses: "Yılmaz" → "yilmaz". */
const ascii = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();

/** The customers' email domain, for webhook URLs. */
export const domainOf = (email: string) => email.slice(email.indexOf("@") + 1);

export function seedCustomers(
  now: number,
  random: Random,
  models: ModelRecord[],
): { customers: CustomerRecord[]; events: SeedEvent[] } {
  const events: SeedEvent[] = [];
  const sizes = random.shuffle(SIZE_PLAN.flatMap(([size, count]) => Array.from({ length: count }, () => size)));
  const today = startOfUtcDay(now);
  const callable = models.filter((m) => m.visibility !== "private" && m.defaultVersion !== null);
  let incidentCredits = 0;

  const customers = COMPANIES.map(([company, domain], index): CustomerRecord => {
    // Each customer draws from its own generator, so its ID never depends on the time of day.
    const random = createRandom(hashSeed(`customer:${index}`));
    const id = random.id("cus_", 10);
    const size = sizes[index];
    const first = FIRST[(index * 7 + 3) % FIRST.length];
    const last = LAST[(index * 11 + 5) % LAST.length];
    const ageDays = index < 8 ? random.int(1, 28) : size === "enterprise" ? random.int(200, 700) : random.int(31, 600);
    const createdAt = now - ageDays * DAY - random.int(0, 20) * HOUR;
    const suspension = index === 12 || index === 27 || index === 41 ? SUSPENSIONS[[12, 27, 41].indexOf(index)] : null;
    const suspendedAt = suspension ? now - suspension.daysAgo * DAY - random.int(1, 8) * HOUR : null;
    const pricePerTask = random.float(0.22, 0.4);
    const idle = size === "free" && random.chance(0.3);
    const target = idle ? 0 : random.int(...VOLUME[size]);

    // Daily usage, growing slowly, quieter at weekends, none before signup or after suspension.
    const weights = Array.from({ length: 30 }, (_, i) => {
      const dayStart = today - (29 - i) * DAY;
      if (dayStart + DAY < createdAt) return 0;
      if (suspendedAt !== null && dayStart > suspendedAt) return 0;
      const weekday = new Date(dayStart).getUTCDay();
      const weekend = weekday === 0 || weekday === 6 ? 0.7 : 1;
      return Math.pow(1.012, i) * weekend * random.float(0.75, 1.25) * (i === 29 ? (now - today) / DAY : 1);
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const usage = weights.map((weight, i) => {
      const tasks = totalWeight > 0 ? Math.round((target * weight) / totalWeight) : 0;
      return {
        day: utcDay(today - (29 - i) * DAY),
        tasks,
        spend: money(tasks * pricePerTask * random.float(0.9, 1.1)),
        errors: Math.round(tasks * random.float(0.004, 0.025)),
      };
    });
    const tasks30d = usage.reduce((a, u) => a + u.tasks, 0);
    const spend30d = money(usage.reduce((a, u) => a + u.spend, 0));
    const lastDay = [...usage].reverse().find((u) => u.tasks > 0);
    const lastActiveAt = lastDay
      ? Math.min(Date.parse(`${lastDay.day}T00:00:00Z`) + random.int(8, 22) * HOUR, suspendedAt ?? now, now - random.int(2, 90) * MINUTE)
      : null;

    // Top models: a few of the callable ones, splitting the month's volume.
    const picked = random.sample(callable, random.int(2, 5));
    const shares = picked.map(() => random.float(0.2, 1));
    const shareTotal = shares.reduce((a, b) => a + b, 0);
    const topModels = picked
      .map((model, i) => {
        const version = model.versionList.find((v) => v.id === model.defaultVersion);
        return {
          modelId: model.id,
          tasks: Math.round((tasks30d * shares[i]) / shareTotal),
          spendMicros: toMicros((spend30d * shares[i]) / shareTotal),
          unit: version?.pricing.unit ?? "request",
        };
      })
      .filter((m) => m.tasks > 0)
      .sort((a, b) => b.tasks - a.tasks);

    const autoReload =
      size === "standard" || size === "scale"
        ? { enabled: random.chance(0.45), thresholdMicros: toMicros(size === "scale" ? 200 : 50), amountMicros: toMicros(size === "scale" ? 1000 : 200) }
        : { enabled: false, thresholdMicros: toMicros(50), amountMicros: toMicros(200) };

    const ledger: LedgerEntry[] = [];
    const entry = (kind: LedgerEntry["kind"], amount: number, note: string, at: number, operator: string | null = null) =>
      ledger.push({ id: random.id("led_", 12), kind, amountMicros: toMicros(amount), note, operator, at: iso(Math.min(at, now - MINUTE)) });
    usage.forEach((u, i) => {
      if (u.tasks > 0) {
        const end = today - (29 - i) * DAY + DAY - 1000;
        entry("usage", -u.spend, `Usage · ${u.tasks.toLocaleString("en-US")} tasks`, i === 29 ? now - 5 * MINUTE : end);
      }
    });
    if (size === "enterprise") {
      const invoice = round(spend30d * random.float(0.9, 1.2), 2);
      entry("top_up", invoice, `Invoice INV-${utcDay(today - 20 * DAY).replace(/-/g, "").slice(0, 6)}-${random.int(1000, 9999)} paid by wire`, today - 20 * DAY + 14 * HOUR);
    } else if (spend30d > 0) {
      let paid = 0;
      let at = Math.max(createdAt + HOUR, today - 29 * DAY);
      while (paid < spend30d * 1.05 && at < now) {
        const amount = autoReload.enabled ? autoReload.amountMicros / 1_000_000 : random.pick(size === "scale" ? [500, 1000, 2500] : [25, 50, 100, 250]);
        entry("top_up", amount, autoReload.enabled ? "Auto-reload" : "Card top-up", at);
        paid += amount;
        at += random.int(3, 9) * DAY;
      }
    }
    if (size === "free" && createdAt > now - 30 * DAY) entry("grant", 5, "Welcome credits", createdAt + MINUTE);
    if (index % 15 === 4) {
      const at = now - random.int(5, 25) * DAY;
      entry("grant", 500, "Startup program", at, "Anıl Coşaran");
      events.push({ at, operatorId: "op_anil", action: "customer.credits", targetType: "customer", targetId: id, detail: { amountMicros: toMicros(500), reason: "Startup program" } });
    }
    if (topModels.some((m) => m.modelId === "openai/sora-2") && size !== "free" && incidentCredits++ < 4) {
      const amount = size === "enterprise" ? 200 : 25;
      const at = now - DAY - random.int(1, 6) * HOUR;
      entry("grant", amount, "Credit for failed Sora 2 renders during the OpenAI incident", at, "Deniz Aydın");
      events.push({ at, operatorId: "op_deniz", action: "customer.credits", targetType: "customer", targetId: id, detail: { amountMicros: toMicros(amount), reason: "Credit for failed Sora 2 renders during the OpenAI incident" } });
    }
    ledger.sort((a, b) => b.at.localeCompare(a.at));

    const limitOverrides: LimitOverrides = {};
    if (size === "enterprise" && index % 2 === 0) limitOverrides.requestsPerMinute = 6000;
    if (size === "enterprise" && index % 3 === 0) limitOverrides.concurrency = 400;
    if (size === "standard" && index % 7 === 0) limitOverrides.concurrency = 25;
    if (size === "scale" && index % 5 === 0) limitOverrides.monthlySpendMicros = toMicros(15000);

    if (Object.keys(limitOverrides).length > 0 && index % 2 === 0) {
      events.push({
        at: now - random.int(2, 28) * DAY,
        operatorId: "op_deniz",
        action: "customer.update",
        targetType: "customer",
        targetId: id,
        detail: { limits: limitOverrides },
      });
    }
    if (suspension && suspendedAt !== null) {
      events.push({
        at: suspendedAt,
        operatorId: suspension.by,
        action: "customer.suspend",
        targetType: "customer",
        targetId: id,
        detail: { reason: suspension.reason },
      });
    }

    return {
      id,
      name: company,
      owner: { id: random.id("usr_", 10), name: `${first} ${last}`, email: `${ascii(first)}@${domain}` },
      memberEmails: [`${ascii(first)}@${domain}`, ...(size === "free" ? [] : [`${ascii(FIRST[(index * 3 + 1) % FIRST.length])}@${domain}`])],
      status: suspension ? "suspended" : "active",
      balanceMicros: suspension && index === 12 ? 0 : toMicros(random.float(...BALANCE[size])),
      heldMicros: 0,
      spend30dMicros: toMicros(spend30d),
      tasks30d,
      createdAt: iso(createdAt),
      lastActiveAt: lastActiveAt === null ? null : iso(lastActiveAt),
      autoReload,
      suspendedReason: suspension?.reason ?? null,
      usage: usage.map(({ spend, ...day }) => ({ ...day, spendMicros: toMicros(spend) })),
      topModels,
      ledger,
      limitOverrides,
    };
  });

  customers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { customers, events };
}
