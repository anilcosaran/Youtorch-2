# Modelvend platform yapısı: monorepo, teknoloji, white-label ve app'ler

> Durum: onay bekleyen öneri, 16 Ekim 2026. Onaylanınca bu yapının iskeleti kurulacak (bölüm 7). Gerçek sağlayıcı çağrıları, faturalama ve tam API daha sonra yazılacak.
> [architecture.md](architecture.md)'deki domain modelinin üstüne kurulur. Bölüm 5'teki repo yapısının ayrıntılı ve güncel hâli budur.

## 1. Kısaca

- **Tek repo, ayrı servisler.**
  - Müşteri konsolu, admin konsolu ve dokümanlar ayrı Next.js uygulamaları olarak `apps/` altında durur.
  - Gateway, MCP sunucusu, worker ve admin API ayrı Go binary'leridir: `services/cmd/*`.
  - Hepsi aynı sözleşmeleri kullanır: `api/*.yaml` dosyalarındaki OpenAPI tanımları.
- **Backend Go, postpane ile aynı stack:** chi, pgx, goose, River, Redis ve S3. Kod da (operatör oturumu, audit, sayfalama, worker havuzları) operasyon bilgisi de buradan taşınır.
- **Müşteri her zaman bizim kimliğimizi görür.** Bir model başka bir isimle, sağlayıcısı belli edilmeden yayınlanabilir; buna white-label denir. Yanıtlar, hatalar, çıktı URL'leri, header'lar ve dokümanlar yalnızca bizim adlarımızı ve şemamızı taşır.
- **App'ler kara kutudur.** Müşteri bir task gönderir ve task ID'siyle durumu ve çıktıyı izler. Arkada hangi modellerin ve sağlayıcıların çalıştığını göremez.
- **Tek kavram: task.** Model çağrısı da app çalıştırması da bir `task_…` kaydıdır. API, MCP ve webhook'lar bu kaydı aynı biçimde anlatır.

## 2. Teknoloji seçimi

| Katman                         | Öneri                                                                   | Neden                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend dili                   | Go 1.26                                                                 | postpane'in API'si, worker'ı ve admin API'si Go. Kod ve işletim bilgisi doğrudan taşınır. Gateway işi (proxy, streaming, uzun poll) Go'ya uygun.                               |
| HTTP                           | `go-chi/chi/v5`                                                         | postpane ile aynı                                                                                                                                                              |
| Veritabanı                     | Postgres 17 + `jackc/pgx/v5`                                            | Katalog, hesaplar, ledger ve task kayıtları ilişkisel veri; JSONB şemalar için yeterli                                                                                         |
| Migration                      | `pressly/goose/v3`                                                      | postpane ile aynı                                                                                                                                                              |
| Kuyruk ve job                  | `riverqueue/river` (Postgres üzerinde)                                  | Ayrı bir broker gerekmez. Task kaydı ile işi aynı transaction'da yazar, kaybolan iş olmaz. postpane'in worker pool ve KEDA kurgusu aynen kullanılır.                           |
| Cache, rate limit, idempotency | Redis (`go-redis/v9`)                                                   | Dakikalık limitler, sağlık sayaçları, katalog önbelleğinin geçersiz kılınması                                                                                                  |
| Çıktı depolama                 | S3 uyumlu, Cloudflare R2 ve CDN önerilir (`minio-go`)                   | Medya ağır bir iş; R2'de egress ücreti yok                                                                                                                                     |
| Sözleşme                       | OpenAPI 3.1, `api/*.yaml`                                               | Tek doğruluk kaynağı. Go handler'ları elle yazılır (postpane gibi) ve contract testiyle spec'e karşı doğrulanır (`kin-openapi`). TS tipleri `openapi-typescript` ile üretilir. |
| Model girdi doğrulama          | `santhosh-tekuri/jsonschema/v6`                                         | JSON Schema 2020-12                                                                                                                                                            |
| MCP                            | `modelcontextprotocol/go-sdk`, Streamable HTTP                          | Resmî SDK; aynı API anahtarıyla doğrulama                                                                                                                                      |
| Ödeme                          | Stripe (kart kaydı, top-up, auto-reload webhook'ları)                   | Konsolda kart ve yükleme akışı zaten var                                                                                                                                       |
| Gözlem                         | `log/slog`, Prometheus, OpenTelemetry trace                             | postpane'de Prometheus var. Task başına trace, attempt zincirini görmeyi kolaylaştırır.                                                                                        |
| Frontend                       | Next.js 16, React 19, Tailwind 4                                        | Bugünkü konsol ve admin                                                                                                                                                        |
| JS monorepo                    | npm workspaces (konsol taşıma branch'inde kuruldu), istenirse Turborepo | Kurulu olanı kullan; build önbelleği gerekirse Turborepo eklenir                                                                                                               |
| Yerel geliştirme               | Docker Compose: Postgres, Redis, MinIO, Mailpit                         | `make dev` ile hepsi ayağa kalkar                                                                                                                                              |
| Dağıtım                        | Docker imajları ve Helm (postpane chart kalıbı)                         |                                                                                                                                                                                |

TypeScript backend (Hono, pg-boss/BullMQ) de düşünüldü. Artısı tiplerin doğrudan paylaşılması. Eksisi postpane'de çalışan altyapıyı (River pool'ları, admin oturumları, audit, Helm) baştan yazmak. Tip paylaşımını OpenAPI'den üretim zaten sağladığı için Go seçildi.

## 3. Monorepo dosya yapısı

```
modelvend/
├─ apps/                                Next.js arayüzleri (npm workspaces)
│  ├─ console/                          app.modelvend.ai: müşteri konsolu (iç yapısı: architecture.md bölüm 6)
│  ├─ admin/                            admin.modelvend.ai: operatör konsolu (yalnız iç ağ veya SSO arkasında)
│  └─ docs/                             docs.modelvend.ai (sonra): model sayfaları katalogdan üretilir
│
├─ services/                            Go backend: tek modül, birden çok binary
│  ├─ go.mod                            github.com/brieeflabs/modelvend/services
│  ├─ cmd/
│  │  ├─ gateway/                       api.modelvend.ai: /v1 (tasks, models, apps, uploads) ve OpenAI uyumlu yüzey
│  │  ├─ mcp/                           mcp.modelvend.ai/mcp: MCP sunucusu
│  │  ├─ worker/                        River worker havuzları: dispatch, poll, finalize, webhook, cleanup
│  │  ├─ adminapi/                      /admin/v1, yalnız admin konsolu çağırır
│  │  └─ migrate/                       goose migration'ları ve katalog içe aktarma
│  ├─ internal/
│  │  ├─ platform/                      config, db, redis, storage, log, metrics, httpx, id üretimi, hata tipleri
│  │  ├─ catalog/                       Model, sürüm, fiyat, görünürlük ve disclosure; ID çözümleyici ve önbellek
│  │  ├─ schema/                        JSON Schema doğrulama, varsayılanlar, x-ui ipuçları
│  │  ├─ tasks/                         Task kaydı, durum makinesi, idempotency, olay akışı (SSE)
│  │  ├─ routing/                       Strateji, sağlık pencereleri, devre kesici, eşzamanlılık
│  │  ├─ providers/                     Sağlayıcı adapter'ları
│  │  │  ├─ provider.go                 Ortak arayüz: Submit, Status, Fetch, Cancel, ParseWebhook
│  │  │  ├─ mapping/                    Bizim girdimizden sağlayıcının parametrelerine eşleme ve transform kaydı
│  │  │  ├─ fake/                       Geliştirme ve testler için sahte sağlayıcı
│  │  │  ├─ fal/  replicate/  vertex/  openai/  elevenlabs/  runway/  kling/  minimax/  byteplus/  (sonra)
│  │  │  └─ managed/                    (sonra) kendi GPU'larımız
│  │  ├─ apps/                          App release çalıştırıcı: adımlar, şablonlar, çıktı eşleme
│  │  ├─ media/                         Çıktıyı R2'ye kopyalama, metadata temizliği, imzalı URL, saklama süresi
│  │  ├─ redact/                        Müşteriye giden her şeyin son kapısı: hata eşleme, header temizliği, white-label kuralları
│  │  ├─ billing/                       Fiyat hesabı, bloke ve tahsilat, ledger, Stripe, auto-reload
│  │  ├─ accounts/                      Workspace, kullanıcı, üyelik, tier, limit
│  │  ├─ keys/                          API anahtarları: hash, scope, harcama limiti
│  │  ├─ ratelimit/
│  │  ├─ webhooks/                      İmzalama, teslimat, yeniden deneme
│  │  ├─ jobs/                          River iş tanımları
│  │  ├─ publicapi/                     /v1 handler'ları ve public DTO'lar (iç struct'lar asla serileşmez)
│  │  ├─ openaicompat/                  /v1/chat/completions, /v1/images/generations, /v1/models
│  │  ├─ mcpserver/                     MCP araçları (bölüm 6)
│  │  ├─ adminapi/                      /admin/v1 handler'ları (apps/admin/src/lib/api sözleşmesi)
│  │  ├─ operators/  audit/             Operatör oturumları, izinler, audit (postpane'den uyarlanır)
│  │  └─ app/                           Süreçlerin ortak kurulumu: config, log, veritabanı, kuyruk istemcisi
│  └─ migrations/                       00001_init.sql, … (goose)
│
├─ api/                                 Sözleşmeler: tek doğruluk kaynağı
│  ├─ public.yaml                       /v1 (OpenAPI 3.1)
│  ├─ admin.yaml                        /admin/v1
│  └─ webhooks.yaml                     task.succeeded, task.failed, … olay gövdeleri
│
├─ packages/                            Paylaşılan JS paketleri
│  ├─ api-types/                        api/*.yaml'dan üretilen TS tipleri (console, admin, sdk-js kullanır)
│  └─ sdk-js/                           @modelvend/sdk: tasks.create, tasks.wait, tasks.stream
│
├─ catalog/                             Model ve app manifest'leri (YAML); admin ve CLI ile içe/dışa aktarılır
│  ├─ manifest.schema.json              Manifest biçiminin şeması (editörde otomatik tamamlama)
│  ├─ models/<publisher>/<slug>.yaml
│  └─ apps/<slug>.yaml
│
├─ deploy/
│  ├─ docker/                           gateway, worker, adminapi, mcp, console, admin imajları
│  ├─ compose.dev.yaml                  Postgres, Redis, MinIO, Mailpit
│  └─ helm/modelvend/
├─ docs/
├─ scripts/                             gen-types, seed, …
├─ Makefile                             make dev | gen | test | lint | migrate | images
└─ package.json                         npm workspaces: apps/*, packages/*
```

Kurallar:

- `apps/*` ve `packages/*` yalnızca HTTP üzerinden konuşur. Go koduna erişmezler, tipleri `packages/api-types`'tan alırlar.
- **Sözleşme önce değişir.**
  1. Önce `api/*.yaml` güncellenir.
  2. `make gen` TS tiplerini üretir.
  3. Go handler'ı yazılır.
  4. Contract testi, gerçek yanıtları spec'e karşı doğrular.
- Go'da her binary yalnızca kendi handler'larını açar, ama `internal/` paketlerini ortak kullanır. Örneğin MCP sunucusu task oluştururken gateway'in kullandığı `tasks` paketini çağırır; kendi kendine HTTP isteği atmaz.
- **Model şemaları nerede durur?**
  - Çalışma anında doğruluk kaynağı veritabanıdır; admin'den düzenlenir.
  - `catalog/` altındaki YAML dosyaları yeni model ve sürüm yazmanın, git'te gözden geçirmenin ve yedeklemenin yoludur.
  - İçe aktarma her zaman yeni bir **draft sürüm** oluşturur, canlı bir sürümü asla değiştirmez. Yaşam döngüsü (promote, default, pause) admin'de yürür.

## 4. Kendi isimle yayın (white-label)

### Kavramlar

Model kimliği tamamen bize aittir:

- **`publisher`:** Herhangi bir isim alanı olabilir: `modelvend`, ya da bir marka adı (`lumen`, `studio`). Gerçek üreticiyle eşleşmek zorunda değildir.
- **`author` (yalnız admin):** Modeli gerçekte kimin yaptığı, örneğin "Kling AI". Lisans ve sözleşme takibi için tutulur, müşteriye gösterilmez.
- **`disclosure`:** Modelin kaynağının ne kadar açık olduğu.
  - `open`: Kaynağı açık modeller, örneğin `kling/kling-3`. Model sayfasında üretici adı ve Providers sekmesi (sağlayıcı, bölge, uptime) görünür.
  - `white_label`: Üretici de sağlayıcı da hiçbir müşteri yüzeyinde görünmez. Providers sekmesinin yerinde yalnızca toplam uptime ve gecikme durur.

Aynı upstream model iki kez yayınlanabilir. Örneğin `kling/kling-3` açık olarak kalırken `modelvend/motion-pro` white-label olarak yayınlanır. İkincisinin kendi adı, kendi fiyatı ve kendi varsayılanları vardır, örneğin her zaman 1080p ve gizli bir negatif prompt. Route'ları aynı upstream'e gider.

### Sızıntı noktaları ve kapatılmaları

| Nerede sızar             | Nasıl kapatılır                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Yanıt gövdesi            | `publicapi` yalnızca kendi DTO'larını serileştirir. Task, model ve app nesnelerinde sağlayıcı alanı yoktur. Tür sistemi iç struct'ın dışarı çıkmasını engeller.                                                                                                                                                           |
| Hata mesajları           | Upstream hataları `redact` içinde bizim kodlarımıza çevrilir: `invalid_input` (bizim alan adlarımızla), `content_policy`, `generation_failed`, `timeout`. Ham mesaj yalnızca admin'deki attempt kaydında görünür.                                                                                                         |
| Girdi alanları           | Müşteri bizim şemamızı görür. Sağlayıcıya özgü parametre adlarına çeviri route'un `mapping` kısmında, içeride yapılır.                                                                                                                                                                                                    |
| Çıktı URL'leri           | Çıktı her zaman `cdn.modelvend.ai/o/<task>/<n>.<ext>` adresine kopyalanır. Upstream URL'si dışarı çıkmaz.                                                                                                                                                                                                                 |
| Dosya metadata'sı        | EXIF, XMP ve ID3 etiketleri temizlenir (örneğin `Software` alanı). C2PA ve SynthID gibi "yapay zekâ ile üretildi" işaretleri **silinmez**: AB Yapay Zekâ Yasası sentetik içeriğin işaretlenmesini istiyor ve sağlayıcı sözleşmeleri genelde bunları korumayı şart koşuyor. Gerekirse bunlara kendi C2PA kaydımız eklenir. |
| HTTP header'ları         | Upstream header'larının hepsi düşürülür. Yanıtlarda yalnızca bizim header'larımız olur: `x-request-id`, `ratelimit-*`, `deprecation`, `sunset`.                                                                                                                                                                           |
| ID'ler                   | Müşteri yalnızca `task_…` görür. Upstream ID'leri sadece admin'de görünür.                                                                                                                                                                                                                                                |
| Webhook'lar              | Bizim imzamızla, bizim gövdemizle gider.                                                                                                                                                                                                                                                                                  |
| Dokümanlar ve playground | Bizim şemamızdan üretilir; upstream parametre adı geçmez.                                                                                                                                                                                                                                                                 |
| Fiyat ve fatura          | Satır kalemlerinde yalnızca bizim model ID'miz yer alır.                                                                                                                                                                                                                                                                  |

**Hukuki not:** Her sağlayıcının sözleşmesi yeniden satışa izin vermeyebilir; bazıları atıf şartı koyar ya da başka isimle sunmayı yasaklar. Bu yüzden admin'de sağlayıcı ve route başına `white_label_allowed` alanı ve bir lisans notu tutulur. `white_label` bir model yalnızca izin veren route'lara yönlenebilir. Yayına almadan önce sağlayıcı bazında hukuki kontrol gerekir.

### Örnek manifest

```yaml
# catalog/models/modelvend/motion-pro.yaml
id: modelvend/motion-pro
name: Motion Pro
modality: video
tasks: [text-to-video, image-to-video]
visibility: public
disclosure: white_label # Üretici ve sağlayıcı müşteriye görünmez
author: Kling AI # Yalnız admin'de, lisans takibi için
versions:
  - id: v1
    label: "1.0"
    input:
      type: object
      required: [prompt]
      properties:
        prompt: { type: string, maxLength: 2000 }
        image_url: { type: string, format: uri }
        duration:
          type: integer
          enum: [5, 10]
          default: 5
          x-ui: { group: quick, widget: duration }
    output:
      type: object
      properties:
        video: { $ref: "#/$defs/video" }
    pricing:
      unit: second
      default_tier: 1080p
      tiers: [{ id: 1080p, label: 1080p, price: 0.11 }]
    routing: { strategy: priority, fallbacks: true, max_attempts: 2 }
    routes:
      - provider: fal
        upstream: fal-ai/kling-video/v3/pro/text-to-video
        cost: 0.084
        mapping: # Anahtarlar sağlayıcının parametreleri, değerler bizim girdimizden
          prompt: prompt
          image_url: image_url
          duration: { from: duration, as: string }
          negative_prompt: { const: "blurry, watermark, text" } # Müşteri görmez
      - provider: kling
        upstream: kling-v3-pro
        priority: 2
        cost: 0.09
        transform: kling_v3 # Basit eşlemeye sığmayan durumlar Go kodunda
```

## 5. App'ler: kara kutu çalıştırma

- App, model gibi çağrılabilen bir hedeftir. Kendi input ve output şeması, çalıştırma başına sabit bir fiyatı ve bir ilerleme tanımı vardır.
- **Müşteri ne yapar:** `POST /v1/tasks` ile `{"app": "product-shots", "input": {...}}` gönderir. Aynı task ID'siyle durumu sorgular, SSE akışını dinler ya da webhook alır.
- **İçeride ne olur:**
  - Worker, canlı release'in adımlarını çalıştırır. Her adım iç bir **alt task**'tır (`parent_id` alanıyla bağlıdır).
  - Alt task'lar müşteri API'sinde listelenmez ve ayrı faturalanmaz. Müşteri yalnızca app'in fiyatını öder.
  - Marj, admin'de release maliyetiyle birlikte görünür.
- **İlerleme bilgisi genel tutulur.** `progress: {stage: "rendering", percent: 60}` gibi. Aşama adlarını release tanımlar (`Analyzing`, `Rendering` gibi); model ya da sağlayıcı adı içermez.
- **Çıktı ve hatalar da gizlidir.** Çıktı, release'in `output` eşlemesinin ürettiği nesnedir. Ara adımların çıktıları dışarı çıkmaz. Hatalar genel kodlara çevrilir.
- **Modellerden bağımsızdır.** App'ler release'lerdeki sabitlenmiş sürümlerle çalışır. Bir model white-label olsa da açık olsa da app'in müşterisi bunu görmez.

```yaml
# catalog/apps/product-shots.yaml
slug: product-shots
name: Product Shots
input:
  type: object
  required: [image_url]
  properties:
    image_url: { type: string, format: uri }
    scene: { type: string, maxLength: 500 }
output:
  type: object
  properties:
    images: { type: array, items: { $ref: "#/$defs/image" } }
price: 0.18
stages: [Analyzing, Rendering]
steps:
  - id: describe
    stage: Analyzing
    model: modelvend/prompt-boost-1@v1
    input: { prompt: "{{input.scene}} product photo", target: image }
  - id: render
    stage: Rendering
    model: google/nano-banana-pro@2026-09-30
    input:
      prompt: "{{steps.describe.output.prompt}}"
      reference_image_urls: ["{{input.image_url}}"]
      num_images: 2
output_map:
  images: "{{steps.render.output.images}}"
```

## 6. Public API ve MCP: tek kavram, task

```
POST /v1/tasks                  {"model": "modelvend/motion-pro@v1" | "app": "product-shots", "input": {…}, "webhook_url"?, "metadata"?}
                                Header'lar: Idempotency-Key; Prefer: wait=30 (60 saniyeye kadar senkron bekler)
GET  /v1/tasks/{id}             Task nesnesi
GET  /v1/tasks/{id}/events      SSE: status, progress, output
POST /v1/tasks/{id}/cancel
GET  /v1/tasks                  ?status=&model=&app=&cursor=
GET  /v1/models                 Katalog; /v1/models/{publisher}/{slug}[@version] şema ve fiyatla birlikte
GET  /v1/apps                   /v1/apps/{slug} şema ve fiyatla birlikte
POST /v1/uploads                Referans medya için imzalı yükleme URL'si
GET  /v1/usage, /v1/balance
OpenAI uyumlu: /v1/chat/completions, /v1/images/generations (postpane bunları kullanıyor)
```

```json
{
  "id": "task_01JC9X7Z3K8Q",
  "object": "task",
  "target": { "type": "app", "id": "product-shots" },
  "status": "running",
  "progress": { "stage": "rendering", "percent": 60 },
  "input": { "image_url": "https://…", "scene": "marble countertop, morning light" },
  "output": null,
  "error": null,
  "usage": { "units": 1, "unit": "run", "cost": 0.18, "currency": "USD" },
  "created_at": "2026-10-16T21:04:11Z",
  "started_at": "2026-10-16T21:04:12Z",
  "finished_at": null,
  "metadata": { "order_id": "A-1042" }
}
```

- Durumlar: `queued`, `running`, `succeeded`, `failed`, `canceled`.
- Webhook olayları: `task.succeeded`, `task.failed`, `task.canceled`. Gövde Task nesnesidir ve HMAC ile imzalanır.

MCP sunucusu (`mcp.modelvend.ai/mcp`) aynı API anahtarıyla doğrulanır. Konsolun Quickstart'ındaki MCP kurulumu bu adresi zaten gösteriyor. Araçlar:

| Araç                         | Ne yapar                                                  |
| ---------------------------- | --------------------------------------------------------- |
| `search_models`, `get_model` | Katalogda arama; şema ve fiyatı döndürür                  |
| `list_apps`, `get_app`       | App'leri ve şemalarını döndürür                           |
| `create_task`                | Model veya app için task oluşturur, task ID'sini döndürür |
| `get_task`                   | Durum, ilerleme ve çıktı                                  |
| `wait_for_task`              | Task bitene kadar (en fazla N saniye) bekler              |
| `cancel_task`, `list_tasks`  |                                                           |

**Adlandırma:** architecture.md, admin sözleşmesi ve konsol örnekleri bugün `generations` / `req_` ve "Requests" adlarını kullanıyor. Öneri, her yerde `tasks` / `task_` adına geçmek. Hem model çağrısını hem app çalıştırmasını aynı kelime anlatır.

## 7. Onaylanınca kurulacak iskelet

Konsol taşıma branch'i (`apps/console`, `apps/admin`, npm workspaces) temel alınır. İş mantığı yazılmaz; yalnızca yapı, bağlantılar ve birer çalışan örnek kurulur:

1. **`services/`:** Go modülü ve beş binary (`gateway`, `mcp`, `worker`, `adminapi`, `migrate`).
   - Her binary config okur, Postgres ve Redis'e bağlanır, `/healthz`, `/readyz` ve `/metrics` uçlarını sunar.
   - `internal/` paketleri arayüzleriyle kurulur: `providers.Provider`, `tasks` durum makinesi, `redact` DTO'ları.
   - İçlerinde iş mantığı yoktur.
2. **Uçtan uca bir task örneği:**
   - `00001_init.sql` migration'ı çekirdek tabloları oluşturur.
   - River tek bir örnek job ile kurulur.
   - Sahte bir sağlayıcıyla (`providers/fake`) `POST /v1/tasks`, ardından `GET /v1/tasks/{id}` uçtan uca çalışır.
3. **Sözleşme ve tip üretimi:** `api/public.yaml`, `admin.yaml` ve `webhooks.yaml` task, model ve app uçlarıyla başlar. `packages/api-types` `make gen` ile üretilir.
4. **Yerel ortam ve imajlar:**
   - `deploy/compose.dev.yaml` (Postgres, Redis, MinIO).
   - Servislerin Dockerfile'ları.
   - `make dev` komutu servisleri ve iki Next uygulamasını birlikte başlatır.
5. **Katalog:** `catalog/manifest.schema.json`, bir white-label model ve bir app örneği. `migrate catalog import` komutu bunları draft olarak içe aktarır.
6. **Belgeler:** architecture.md ve admin sözleşmesinde task adlandırmasına geçiş; README'lerde yeni yapı.

Gerçek sağlayıcı adapter'ları, faturalama, Stripe, rate limit ve webhook teslimatı sonraki adımlardır.

## 8. Onay gereken kararlar

1. **Backend dili:** Go (öneri) mi, TypeScript mi?
2. **Adlandırma:** `tasks` / `task_` (öneri) mi, bugünkü `generations` / `req_` mi?
3. **Katalog kaynağı:** Veritabanı doğruluk kaynağı, `catalog/` YAML içe/dışa aktarma için (öneri). Alternatifi git'in tek kaynak olması.
4. **Depolama:** Cloudflare R2 (öneri) mi, AWS S3 mü?
5. **White-label hukuku:** Sağlayıcı bazında izin kontrolü kimde olacak? Admin'deki `white_label_allowed` alanı bunu zorunlu kılar.
