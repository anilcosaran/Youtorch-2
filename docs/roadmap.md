# Modelvend yol haritası: eksikler, kararlar ve fazlar

> Durum: 30 Ekim 2026. Kod, [architecture.md](architecture.md) ve [structure.md](structure.md) karşılaştırılarak ve uygulama çalıştırılarak çıkarıldı. architecture.md bölüm 9'daki yol haritasının yerine geçer.
> Hukuk notları sözleşme metinlerinin okunmasına dayanır, hukuki görüş değildir.
> 31 Ekim denetiminin hataları ve çelişkileri [audit.md](audit.md)'de; kararlar [product-rules.md](product-rules.md) bölüm 11'de. Her fazın kapsamına dahildir.

## 1. Alınan kararlar

| Konu           | Karar                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| İlk hedef      | Beta yok. Önce dev ortamında kendimiz test ederiz, prod kümesi gelince prod açılır                      |
| Ürün kuralları | Üye, limit, kredi, fiyat ve model ekleme kuralları [product-rules.md](product-rules.md)'de              |
| Ödeme          | Yurt dışı şirket + Stripe. Stripe Türkiye'de yok, şirket kurulana kadar kredi admin'den elle yüklenir   |
| Üreticiler     | Doğrudan Google, OpenAI, ElevenLabs, Kling. fal ve Replicate kullanılmaz                                |
| Modaliteler    | Görsel, video, ses, metin, 3D                                                                           |
| Modellerin adı | Kendi adıyla (`disclosure: open`). White-label betadan sonra                                            |
| Moderasyon     | Yalnızca üretici filtreleri (risk: bölüm 6)                                                             |
| Müşteri girişi | Kendi sistemimiz: Go, e-posta doğrulama, Google ile giriş, workspace üyelikleri                         |
| Altyapı        | Ortak dev Kubernetes kümesinde izole namespace, uygulamalar pod olarak. Prod kümesi sonra gelir         |
| Teslimat       | Helm chart; Argo CD Modelvend reposunu izler; imajlar GHCR'de; CI imaj digest'ini values dosyasına commit'ler |
| Postgres, Redis | Kümede, Modelvend'e özel: kendi namespace'inde CNPG ve Redis                                           |
| Secret'lar     | Git dışında; repoda yalnızca anahtar adları ve boş örnek env dosyaları                                  |
| Medya          | Bunny Storage ve CDN                                                                                    |
| Kapsam         | App'ler, MCP, alt hesaplar ve kurumsal fiyat listeleri dahil                                            |
| Takvim         | Tarih yok. Şirket ve üretici görüşmelerini Anıl yürütür, kod paralel ilerler                            |

## 2. Dış işler (kod dışı, Anıl)

Kod bunları beklemez: dev ortamı sahte sağlayıcı ve test anahtarlarıyla ilerler. Ama prod açılışı bunlar olmadan yapılamaz. Şirket ve Stripe olmadan kart akışı yalnızca sahte ödeme adapter'ıyla denenir; kredi admin'den elle yüklenir.

- [ ] Yurt dışı şirket ve banka hesabı. [Stripe Atlas](https://stripe.com/atlas) bir seçenek; Türk vatandaşı için uygunluk Stripe'tan teyit edilmeli.
- [ ] Stripe başvurusu. Ön ödemeli kredi [kısıtlı işler listesinde](https://stripe.com/legal/restricted-businesses) ve ek inceleme istiyor; işin modeli başvuruda açıkça anlatılmalı.
- [ ] Üreticilerden yazılı yeniden satış izni:
  - **Google:** [Gemini şartlarında](https://ai.google.dev/gemini-api/terms) genel yasak görülmedi, Google APIs şartları ayrıca okunmalı. Vertex AI yolu sorulmalı.
  - **OpenAI:** sözleşme doğrulanamadı (sayfa erişimi engelledi).
  - **ElevenLabs:** [şartlar](https://elevenlabs.io/terms-of-use) alt lisansı yasaklıyor; OEM veya yetkili satıcı anlaşması gerekir.
  - **Kling:** net hüküm doğrulanamadı; [ücretli hizmet şartları](https://kling.ai/document-api/guides/protocols/paid-service.md) okunmalı.
- [ ] Üretici hesapları, API anahtarları ve bakiyeler.
- [ ] 3D için üretici seçimi (bölüm 5).
- [ ] Müşteri şartları, gizlilik politikası, kabul edilebilir kullanım ve iade politikası. Üreticilerin son kullanıcı şartlarını kapsamalı.
- [ ] Alan adları: `api`, `app`, `admin`, `mcp`, `docs`, `cdn` (`modelvend.ai`).

## 3. Eksik envanteri

**Var:** çalışıyor ve denendi. **Kısmi:** bir bölümü var. **Mock:** yalnızca arayüz. **Yok:** kod yok.

### Müşteri API'si ve çalışma motoru

| Parça                                                         | Durum | Not                                                                 |
| ------------------------------------------------------------- | ----- | ------------------------------------------------------------------- |
| `POST/GET /v1/tasks`, iptal, `/v1/models`                     | Var   | Sahte sağlayıcıyla uçtan uca denendi                                |
| Bakiye blokesi, tahsilat, ledger, anahtar scope ve limitleri  | Var   | Bloke bir birimlik tahmin; girdiden hesaplanmıyor                   |
| Idempotency, `Deprecation`/`Sunset`, `Prefer: wait`           | Var   |                                                                     |
| MCP temel araçları                                            | Kısmi | `list_apps`, `get_app` yok                                          |
| Gerçek sağlayıcı adapter'ları                                 | Yok   | Worker yalnızca `fake` kaydediyor                                   |
| `/v1/chat/completions`, `/v1/images/generations`              | Yok   | 501 dönüyor                                                         |
| `/v1/tasks/{id}/events` (SSE), `/v1/uploads`                  | Yok   |                                                                     |
| `/v1/usage`, `/v1/balance`, `/v1/apps`, `/models/…/endpoints` | Yok   |                                                                     |
| Webhook teslimatı                                             | Kısmi | Yalnızca imza formatı var; teslimat ve yeniden deneme yok           |
| Rate limit ve tier limitleri                                  | Yok   | `ratelimit` boş, Redis yalnızca ayarlarda                           |
| Sağlık pencereleri, devre kesici                              | Kısmi | Router arayüzü hazır, veri gelmiyor; `fastest` `priority` gibi çalışıyor |
| App çalıştırıcısı                                             | Kısmi | Release doğrulama ve şablon var; task oluşturma `ErrAppsUnavailable` dönüyor |
| Route `transform`                                             | Yok   | Bu route'lar gönderimden önce başarısız oluyor                      |
| Çıktı metadata temizliği                                      | Yok   | Kendi adıyla yayında zorunlu değil, white-label'da şart             |
| Çıktı saklama süresi ve silme job'ı                           | Yok   | Dokümanda 30 gün                                                    |
| Alt hesaplar, `end_user`, management key, fiyat listeleri     | Yok   | Taslak: architecture.md bölüm 10                                    |

### Admin

| Parça                                                                | Durum | Not                                                       |
| -------------------------------------------------------------------- | ----- | --------------------------------------------------------- |
| Tüm ekranlar ve sözleşme (`packages/admin-api`, 10 alan)             | Mock  | Model ekleme ve canlıya alma kuralları mock'ta çalışıyor  |
| Go admin API                                                         | Yok   | Her uç 501                                                |
| Operatör oturumu, izinler, audit                                     | Yok   | `operators` ve `audit` paketleri boş                      |
| Katalog yazma (model, sürüm, route)                                  | Yok   | `catalog.Store` yalnızca okuyor                           |
| Sağlayıcı anahtarının şifreli saklanması                             | Yok   | Kolon var, şifreleme ve anahtar yönetimi yok              |
| Sözleşmede `disclosure`, route `mapping`/`transform`, `x-ui`         | Yok   | Veritabanında var, admin'den ayarlanamıyor                |
| Sağlayıcıda `white_label_allowed`, `license_notes`                   | Yok   | Sözleşmede ve arayüzde yok                                |
| Fiyat listesi ve alt hesap ekranları                                 | Yok   |                                                           |

Route `mapping` en kritik olanı: bu alan olmadan admin'den eklenen model üreticiye doğru parametre gönderemez.

### Müşteri konsolu

| Parça                                                      | Durum | Not                                                                         |
| ---------------------------------------------------------- | ----- | --------------------------------------------------------------------------- |
| Dashboard, katalog, model, app, usage, billing, anahtarlar | Mock  | 49 import doğrudan `@/mocks`'tan                                            |
| Veri katmanı (`data/`), üretilmiş tipler                   | Yok   | Tipler katalog modeline uymuyor (publisher ve sürüm yok)                    |
| Giriş, kayıt, davet, oturum; `identity/accounts`           | Yok   | Konsol herkese açık render oluyor; kullanıcı ve üyelik tabloları da yok     |
| Playground                                                 | Mock  | Çalıştırma simüle; form şemadan değil, modaliteye göre elle yazılmış        |
| Task geçmişi, ayarlar, üyeler, webhook ayarları            | Yok   |                                                                             |
| Referans medya yükleme                                     | Yok   |                                                                             |
| Canvas                                                     | Mock  | Backend tasarımı yok (bölüm 5)                                              |
| Stripe: kart, yükleme, auto-reload                         | Mock  |                                                                             |
| Sahte içerik temizliği                                     | Yok   | Örnek: "kendi modelimiz" `lumen-1`, seçilmeyen üreticilerin modelleri       |

### Altyapı ve teslimat

| Parça                                                    | Durum | Not                                                                        |
| -------------------------------------------------------- | ----- | -------------------------------------------------------------------------- |
| Next.js Dockerfile'ları                                  | Var   |                                                                            |
| Go servis imajları                                       | Yok   | `deploy/docker` boş                                                        |
| Helm chart, Argo CD Application                          | Yok   | `deploy/helm` boş                                                          |
| CI (`check`, `go test`, imaj)                            | Yok   | `.github` yok                                                              |
| OpenAPI (`api/*.yaml`), `api-types`, `sdk-js`            | Yok   | Klasörler boş; kod `api/admin.yaml`'a atıf yapıyor                         |
| Compose, `make dev`                                      | Yok   | Backend'i yerelde kaldırmak için el ile komut gerekiyor                    |
| `catalog/` manifest'leri                                 | Yok   | Veritabanında yalnızca `dev-echo`                                          |
| Bunny `media.Store`                                      | Yok   | Kod S3 uyumlu; Bunny S3 API'si önizlemede (bölüm 6)                        |
| Gözlem                                                   | Kısmi | Prometheus metrikleri var; trace, pano ve alarm yok                        |
| E-posta gönderimi                                        | Yok   | Doğrulama, davet, sunset ve düşük bakiye için gerekli                      |
| Veritabanı testleri                                      | Kısmi | `dbtest` yalnızca bir test dosyasında; `TEST_DATABASE_URL` CI'da yok       |
| Doküman sitesi (`apps/docs`)                             | Yok   | Konsol `docs.modelvend.ai`'ye link veriyor                                 |
| Güncel olmayan dokümanlar                                | Kısmi | architecture.md "backend henüz yok" diyor; README portları yanlış          |

## 4. Fazlar

Her faz ayrı PR'lara bölünür ve sonunda "bitti" ölçütü doğrulanır. Faz 2 ile Faz 3 paralel yürüyebilir.

### Faz 0: Zemin

Sonraki her şeyin üstüne oturacağı yapı.

- CI: `npm run check`, `go test` (Postgres ile), imaj derleme.
- `deploy/compose.dev.yaml` (Postgres, Redis, MinIO, Mailpit) ve `make dev`, `gen`, `test`, `migrate`.
- Go servisleri için tek imaj.
- `deploy/helm/modelvend` chart'ı ve `deploy/argocd` altında Argo CD tanımları: Modelvend'e özel AppProject (yalnızca bu repo ve kendi namespace'i) ve Application.
- GHCR'ye imaj gönderme ve digest'i ortam values dosyasına commit'leme. Kümeye pull token'ı.
- Namespace içinde CNPG cluster (dev'de tek kopya) ve Redis. Küme operatörleri ortak kullanılır.
- Secret sözleşmesi: boş örnek env dosyaları ve eksik anahtarı bildiren kontrol. Değerler Git'e girmez.
- Küme bağlantısı Anıl'dan gelince Argo tanımları uygulanır. O zamana kadar chart `helm template` ve yerel kümede doğrulanır.
- `api/public.yaml`, `console.yaml`, `admin.yaml`, `webhooks.yaml`; `packages/api-types` üretimi; contract testi. Önce [audit.md](audit.md) bölüm 1 kapanır: para biçimi, `task_` kimliği, app biçimi, birimler, tek anahtar türü, kademe seçimi ve kademe maliyeti.
- Sözleşme eksiklerini kapatma: `disclosure`, route `mapping`/`transform`, `x-ui`, `white_label_allowed`. Kaldırılanlar: `tier` ve `TIER_LIMITS`. Yeniler: limit ayarları ve katalog alanları. Mock da birlikte güncellenir ([product-rules.md](product-rules.md) bölüm 9).
- Doküman güncellemeleri.

**Bitti:** Main'e birleşen commit CI'dan geçip Argo CD ile namespace'e deploy oluyor. `dev-echo` kümede uçtan uca çalışıyor.

### Faz 1: Gerçek admin

Admin paneli mock'tan kurtulur.

- `operators`: oturum, izinler, şifre, sign-in sınırı. `audit`: her değişiklik yazılır, sistem aktörü dahil. Eşzamanlı düzenleme kontrolü.
- Katalog dışa ve içe aktarma (dev'den prod'a). Gelir tanımına göre saatlik özet tablolar.
- `catalog`: model, sürüm, route ve fiyat yazma; yaşam döngüsü kuralları; önbellek geçersiz kılma.
- Model sihirbazı: şablon seçimi, görsel şema düzenleyici, `mapping`, katalog alanları.
- "Test et" ve canlıya almada test zorunluluğu. Şablon ve test, Faz 2'nin ilk adapter'ı ile birlikte gerçek üreticide tamamlanır; önce sahte sağlayıcıyla çalışır.
- Fiyat değişimi: `price_revisions`, `price_locks`, kapsam, tarih ve duyuru seçimi, marj koruması. Site duyuruları.
- Ayarlar ekranı: genel limitler (dakikada istek, eşzamanlılık, kuyruk, günlük ve aylık harcama, yükleme tavanı), hoş geldin kredisi, bonus, komisyon oranı, asgari marj.
- Müşteri kartında aynı limitler için hesaba özel değer; gerekçe ve audit.
- `providers`: şifreli anahtar, rotasyon, gerçek bağlantı testi, durdurma.
- Customers ve API keys: kredi verme (elle yükleme buradan), askıya alma, iptal.
- Requests ve Overview: gerçek veriden. Canlı trafik için materialized view'lar.
- Go API, mock ile aynı testlerden geçer. Mock geliştirme için kalır.

**Bitti:** Admin `ADMIN_API_URL` ile çalışıyor. Yeni model ekleniyor, canlıya alınıyor ve `GET /v1/models`'te görünüyor. Yeniden başlatınca veri kaybolmuyor.

### Faz 2: Gerçek üreticiler ve API

Modelvend gerçek içerik üretir.

- Önce [audit.md](audit.md) bölüm 2 ve 3: zaman aşımı sırası, kopyalama yeniden denemesi, boş çıktı, üretici 429'u, dispatch kontrolleri, hata kodları ve hata yüzeyi.
- Adapter'lar sırayla: Google, OpenAI, ElevenLabs, Kling. Bir model çağrısı her adapter için dev ortamında "Test et" ile denenir. Üretici anahtarları dev'e aittir, yeniden satış izni prod'da canlıya almanın şartıdır.
- Şablonlar: `catalog/templates/<üretici>/<model>.yaml`. İlk katalog bunlardan admin üzerinden açılır.
- Bunny `media.Store` ve imzalı indirme.
- Webhook teslimatı ve yeniden deneme. SSE. `/v1/uploads`.
- `/v1/usage`, `/v1/balance`, `/v1/apps`, `/models/…/endpoints`.
- OpenAI uyumlu uçlar, metin için akış (streaming) dahil.
- Girdiden en yüksek tutarı bloke etme, fiyatın task oluşturulurken sabitlenmesi, eksi bakiye kuralı, `transform`'lar.
- Rate limit (Redis), eşzamanlılık kuyruğu ve workspace başına adalet; hepsi admin'deki genel ve hesaba özel değerlerden okunur. Günlük harcama limiti. Sağlık pencereleri ve devre kesici.
- Üretici moderasyon sinyallerinin `content_policy` hatasına ve attempt kaydına taşınması. Saklama süresi job'ı.

**Bitti:** Her modalitede en az bir model gerçek üreticide çalışıyor, çıktısı Bunny'den servis ediliyor, doğru ücretleniyor, webhook'u geliyor. Üretici düştüğünde fallback çalışıyor.

### Faz 3: Gerçek konsol

Müşteri kayıt olup kullanabilir.

- `identity/accounts`: kullanıcı, çok workspace'li üyelik, dört rol, davet, e-posta doğrulama, Google ile giriş, oturum, sahiplik devri, silme akışları.
- Üye çıkarılınca anahtarların otomatik iptali (`api_keys.created_by`).
- E-posta gönderimi.
- `data/` katmanı; mock'lar `data/source/mock`'a taşınır; üretilmiş tipler; `/models/{publisher}/{slug}` URL'leri.
- `ConsoleProvider` bölünür; Server Action'lar.
- `/console/v1`: anahtar, bakiye, ledger, üyeler, playground ve kullanım; oturum ve roller burada.
- Şemadan playground (`lib/schema-form`); durumlar ve hata kodları `redact.Task` üzerine ([audit.md](audit.md) bölüm 5).
- Gerçek anahtarlar, usage, ledger; yeni ekranlar: tasks, settings, üyeler, webhook'lar.
- Sahte içeriğin temizliği.

**Bitti:** Bir kullanıcı kaydolur, ekip arkadaşını davet eder, anahtar açar, playground'dan video üretir, harcamasını görür. Üyeyi çıkarınca anahtarları kapanır. Konsolda mock kaynağı kapalıyken hiçbir ekran kırılmaz.

### Faz 4: Ödeme

- Kredi partileri (`credit_lots`), en erken dolan önce harcama, süre dolumu job'ı ve bildirimleri. Bu kısım ödemeden bağımsızdır, elle krediyle de çalışır.
- `billing` için ödeme portu; sahte ödeme adapter'ı (dev) ve Stripe adapter'ı.
- Kart kaydı (hosted form), yükleme, ayrı komisyon, ayarlanabilir bonus, auto-reload, makbuz.
- Stripe webhook'ları: idempotent, ledger'a `top_up`. 14 gün iade ve itiraz akışı.
- Stripe Tax; Stripe bakiyesi ile ledger mutabakatı.

**Bitti:** Sahte adapter ile yükleme, komisyon, bonus, auto-reload, iade ve süre dolumu ledger'a doğru işleniyor. Şirket açılınca aynı testler Stripe test modunda geçiyor ve mutabakat sıfır fark veriyor.

### Faz 5: App'ler, MCP ve Canvas

- App çalıştırıcısı: alt task'lar (`parent_id`), adım şablonları, ilerleme, hata eşleme, sabit fiyat, deploy ve rollback.
- MCP: `list_apps`, `get_app`.
- Konsolda app'lerin canlı release şemasından beslenmesi.
- Canvas: bölüm 5'teki karara göre.

**Bitti:** Bir app API'den, konsoldan ve MCP'den çalışıyor. Müşteri ara adımları ve modelleri görmüyor, yalnızca app fiyatını ödüyor. Admin'de marj görünüyor.

### Faz 6: Alt hesaplar ve fiyat listeleri

architecture.md bölüm 10'daki sırayla:

1. `end_user`.
2. Fiyat listeleri ve `Quote` (fiyat bloke anında sabitlenir).
3. Alt hesaplar, shared mod, management key, `/v1/subaccounts`.
4. Prepaid mod ve aktarım.

**Bitti:** Bir ajans alt hesap açar, ona özel limit ve anahtar verir, kullanımı ayrı görür. Limit ve bakiye ağacın tamamında doğru uygulanıyor. Özel fiyat görünen ve kesilen tutarda aynı.

### Faz 7: Prod hazırlığı

- Yük ve hata testleri: üretici kesintisi, webhook hatası, çift tahsilat denemeleri.
- Pano ve alarmlar, trace, yedek ve geri yükleme denemesi, runbook.
- Güvenlik incelemesi: anahtarlar, SSRF, kiracı ayrımı, admin erişimi.
- `apps/docs`, `@modelvend/sdk`.
- Yasal sayfalar, destek kanalı.
- Prod kümesi, prod namespace ve veritabanı (3 kopya, dış yedek).

**Bitti:** Bölüm 2 tamam, kontrol listesi temiz, prod'da ilk gerçek ödeme ve üretim çalışıyor.

### Proddan sonra

White-label (metadata temizliği ve izin kontrolleri), müşteri tarafı `provider` alanı, kendi runtime'larımız ve GPU (`runtimes/`), veritabanı partition'ı ve analitik depo.

## 5. Açık kararlar

Bunlar kodu bloklamıyor, ilgili faza gelmeden kesinleşmeli. Cevap gelmezse varsayılan uygulanır.

| Karar                                                | Faz | Varsayılan                                                                        |
| ---------------------------------------------------- | --- | --------------------------------------------------------------------------------- |
| Küme bağlantısı, namespace adı, alan adları ve erişim | 0   | Anıl iletir; varsayılan namespace `modelvend`, dev alan adları IP allowlist arkasında |
| Prod kümesi                                          | 7   | Anıl belirler. Dış müşteri ve gerçek para dev ortamında çalışmaz                  |
| E-posta sağlayıcısı                                  | 3   | Resend                                                                            |
| 3D üreticisi: seçilen dördü 3D sunmuyor (bildiğim kadarıyla) | 2   | 3D, üretici seçilene kadar katalogda yok                                          |
| Canvas: backend tasarımı yok                         | 5   | "Yakında" kalır; akışı önce tasarlanır                                            |
| Hesap başına çıktı saklama süresi değiştirilebilsin mi | 2   | 30 gün sabit                                                                      |

Dokümanlardaki şu açık kararlar öneriyle kapatıldı: sürüm ID'si `vN` ve `label`; `staging` durumu kaldırıldı; müşteri sürümün tek fiyatını öder; katalog kaynağı veritabanı, YAML içe aktarma için; fiyat listesi ile promosyondan düşük olan uygulanır; ana hesabın limitleri bütün ağaç için ortak; alt hesaba konsol kullanıcısı ve reseller marjı yok.

## 6. Riskler

- **Yeniden satış izni:** Üreticiler reddederse bir modalite kalkar veya iş modeli değişir. Adapter'lar port arkasında olduğu için kod etkilenmez, ticari plan etkilenir. Stripe başvurusu da bu cevaba dayanır.
- **Plan olmaması:** Yeni hesabın limiti büyük hesapla aynı. Çalıntı kart ve üretici limitini tüketme riskine karşı ilk 7 gün yükleme tavanı, kuyruk sınırı ve doğrulanmış e-posta şartı var ([product-rules.md](product-rules.md) bölüm 3). Prod'da yetmezse kademe sonradan eklenebilir.
- **Anlık fiyat artışı:** Şartlarda yazılı değilse müşteri itirazına ve kart itirazına açık. Korunan fiyatlar da birikir, marj raporunda izlenmeli.
- **Yalnızca üretici filtresi:** [Stripe](https://stripe.com/legal/restricted-businesses) yapay zekâ üretimi dahil yetişkin içeriği yasaklıyor, ihlal hesabı kapatabilir. Şirket ABD'de olursa görünür çocuk istismarı içeriğini bildirme yükümlülüğü doğabilir (18 U.S.C. § 2258A; avukata teyit ettirilmeli). Bu yüzden prod'dan önce en azından şikâyet kanalı, hesap askıya alma ve kayıt tutma kurulmalı. Üretici filtresi kaçırırsa bizim tarafımızda ikinci bir kontrol yok; bu karar Faz 7'de yeniden gözden geçirilmeli. Dev ortamındaki testlerde bu risk sınırlı.
- **AB Yapay Zekâ Yasası 50. madde:** Makine okunur işaretleme yükümlülüğü [2 Ağustos 2026'da başladı; önceden piyasada olan sistemlere 2 Aralık 2026'ya kadar süre tanındığı bildiriliyor](https://www.iubenda.com/en/blog/ai-omnibus-adopted-august-2-obligations-july-2026/) (ikincil kaynak). Modelvend'in rolü hukukçuya sorulmalı. Üreticilerin işaretleri (C2PA, SynthID) hiçbir durumda silinmez.
- **Bunny S3 API'si önizlemede:** [Dokümanda](https://bunny.net/docs/storage/s3) 500 istek/sn ve 1 Gbps sınırı var, S3 desteği yalnızca bölge oluşturulurken açılıyor. Faz 2'de ilk iş S3 uyumluluk testi; yetersizse `media.Store` portuna Bunny'nin kendi API'si için adapter yazılır. Sınır yalnızca depoya yazmada değil, kaynak okumada da önemli; CDN önbelleği önde durmalı.
- **Ortak dev kümesi:** Namespace kaynak sınırları (ResourceQuota, NetworkPolicy) ile izole edilmeli. Yoğun iş başka uygulamaları etkilememeli. Dev ortamına gerçek üretici anahtarı ve müşteri verisi konacaksa erişim buna göre daraltılmalı.
- **Kapsam geniş:** App, alt hesap ve fiyat listesi birlikte büyük bir yüzey. Kapsam sıkışırsa ilk ertelenecekler Faz 6'nın prepaid modu ve Canvas.
- **Bloke tahmini:** Girdiden hesaplanana kadar uzun bir video bakiyeyi eksiye düşürebilir. Faz 2 bitmeden gerçek para alınmamalı.

## 7. Kaynaklar

- Sağlayıcılar: [fal API şartları](https://fal.ai/legal/api-services), [fal genel şartlar](https://www.fal.ai/legal/terms-of-service), [Replicate](https://replicate.com/terms), [Gemini](https://ai.google.dev/gemini-api/terms), [Gemini forum sorusu](https://discuss.ai.google.dev/t/confirming-resale-reseller-policy-scope-for-the-gemini-api/181039), [ElevenLabs](https://elevenlabs.io/terms-of-use), [BytePlus video](https://docs.byteplus.com/docs/modelark/Specific_Terms_for_the_BytePlus_Video_Generation_Model_Services), [Runway özeti (ikincil)](https://conductatlas.com/platform/runway/runway-terms-of-service/api-use-requires-prominent-powered-by-runway-display/), [Kling](https://kling.ai/document-api/guides/protocols/paid-service.md)
- Ödeme: [Stripe ülkeler](https://stripe.com/global), [Stripe kısıtlı işler](https://stripe.com/legal/restricted-businesses)
- Altyapı: [Bunny S3](https://bunny.net/docs/storage/s3), [Bunny değişiklik günlüğü](https://bunny.net/docs/storage/changelog.md)
- Mevzuat: [AI Omnibus özeti (ikincil)](https://www.iubenda.com/en/blog/ai-omnibus-adopted-august-2-obligations-july-2026/)
