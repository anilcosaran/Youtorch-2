# Modelvend denetimi: hatalar, çelişkiler ve kötü yapılar

> Durum: 31 Ekim 2026. Go backend, admin sözleşmesi ve müşteri konsolu kod okunarak denetlendi. Düzeltmeler henüz yapılmadı; "Faz" sütunu [roadmap.md](roadmap.md)'deki fazdır.
>
> **Doğrulama:** ✓ işaretlilerin satırları ayrıca açılıp kontrol edildi; diğerleri denetim raporundan geliyor ve düzeltilirken yeniden doğrulanmalı. Hiçbiri çalışma zamanında denenmedi. Backend'in veritabanı testleri denetim sırasında çalışmadı; sonradan Faz 0'daki yerel Postgres ile çalıştırıldı ve geçti. Yine de bu testler aşağıdaki hataları yakalamıyor, yarış ve kilit bulguları okumaya dayanıyor.
>
> **Temiz çıkanlar (kod okumasına göre):** tahsilat ve çift ücret, idempotency, kiracı ayrımı, anahtar hash'leme, SSRF koruması, hata mesajı temizliği, import sınırları; konsolun REST örnek yolları ve MCP araç adları; admin'de sayfalama ve son admin kuralları.

Kararlar [product-rules.md](product-rules.md)'de, bölüm 1 ve 11.

## 1. Sözleşme önceden düzeltilmeli (Faz 0)

Lansmandan sonra değiştirilmesi zor olanlar. OpenAPI yazılmadan önce kapanmalı.

**Public API tarafı kapandı (`api/public.yaml`):** para biçimi, kademe seçimi ve kademe maliyeti, girdi fiyatı, tek anahtar türü, `staging`'in kaldırılması, emekli sürüme 410, durdurulmuş modelin okunabilmesi, `author`'ın gizlenmesi, listelerde özet, REST ve MCP ortak doğrulama, zaman ve `Deprecation` biçimi. Gerçek yanıtlar `services/internal/api/public/rest/contract_test.go` ile sözleşmeye karşı denetleniyor. **Açık kalanlar:** admin ve konsol tarafı, yani aşağıdaki admin sözleşmesi satırları ile konsol tipleri ve örnekleri.

| Bulgu | Yer | Ne yapılacak |
| ----- | --- | ------------ |
| ✓ Public para float dolar; `usage.cost` müşteri fiyatı, `cost_micros` ise üretici maliyeti | `services/internal/api/public/redact/redact.go:52` | `amount_micros` ve metin birim fiyat; `cost` adı kalkar |
| ✓ Admin app biçimi Go ile uyuşmuyor; `stages`, `output_map`, app şemaları sözleşmede yok. Admin'den çalışan app kurulamıyor | `packages/admin-api/src/apps.ts:24`, `services/internal/apps/apps.go:19` | Sözleşme Go biçimine geçer; "params birleştirme" kalkar, yalnızca şablon |
| ✓ `routes.cost_unit` kodda ve migration'da yok, sözleşme ve `unit_mismatch` kuralı buna dayanıyor | `services/migrations/00001_init.sql:116` | Kademe başına maliyet yapısıyla birlikte çözülür |
| ✓ `req_…` "çağıranların sorguladığı ID" deniyor; gerçek ID `task_…`, `req_` ise `X-Request-Id` | `packages/admin-api/src/requests.ts:20` | Sözleşme `task_` kullanır |
| `AttemptStatus`'ta `running` yok, Go yazıyor; UI etiketsiz kalır | `packages/admin-api/src/requests.ts:17` | Eklenir; `model`, `version`, `units` gibi alanlar nullable olur |
| Operatör, oturum, audit, kullanıcı tablosu yok; `created_by` ve `operator_id` metin, FK yok | `services/migrations/00001_init.sql` | Migration önce yazılır; ID saklanır, ad join ile gelir |
| Birim adları, `cost`, ID biçimleri ve plan alanı konsol, admin ve API'de farklı (`sec`/`second`, `1K chars`/`1k_chars`) | `apps/console/src/mocks/models.ts:15`, `apps/admin/src/mock-api/seed/catalog.ts:120` | Tek sözlük, üretilen enum'lar |
| Konsol `Model` tipi `/v1/models`'ten doldurulamıyor (publisher, slug, promosyon, girdi fiyatı, kapasite yok) | `apps/console/src/types/model.ts:28`, `redact.go:97` | Public biçim genişler, tipler üretilir |
| Token fiyatı mikro dolara sığmıyor; maliyet 0, bloke 0 oluyor | `00001_init.sql:116`, `manifest.go:364` | Birim fiyat ondalık saklanır; bloke asgari tutarla |
| `redact.Pricing.Tiers` iç tipi doğrudan açıyor; `author` "yalnız admin" denip public | `redact.go:116`, `redact.go:151` | Ayrı public tip; `author` kararı dokümana |
| Listeler tam girdi ve çıktı döndürüyor; 100 satır yüzlerce MB olabilir | `rest/rest.go:217`, `mcpserver.go:255` | Listede özet, ayrıntı tek task ucunda |
| REST ve MCP aynı işlemde farklı davranıyor (limit, hata kodu, liste biçimi, geçersiz `status`) | `mcpserver.go:167`, `rest.go:116` | Doğrulama `tasks.Service`'e, ortak liste DTO'su |
| Zaman damgaları normalize değil; `Deprecation: true` RFC biçiminde değil | `redact.go:68`, `rest.go:156` | UTC ve saniye; RFC 9745 |
| Admin ve Go şema doğrulaması farklı kuralda | `apps/admin/src/mock-api/validate.ts`, `catalog/schema` | Tek kural seti ve test örnekleri |

## 2. Para ve iş akışı hataları (Faz 2, gerçek üreticilerden önce)

| Bulgu | Yer | Ne yapılacak |
| ----- | --- | ------------ |
| ✓ Zaman aşımı üreticiye sormadan kontrol ediliyor; worker kapalı kaldıysa bitmiş ve ödenmiş işler `timeout` oluyor | `services/internal/tasks/jobs/jobs.go:332` | Önce `Status`, sonra süre; `RescueStuckJobsAfter` kısaltılır |
| ✓ Depoya kopyalama ilk hatada görevi düşürüyor, yeniden deneme yok; kural "yeniden denenir" diyor | `jobs.go:393` | Ayrı kopyalama job'ı, kendi süresi, güvenli yazma |
| ✓ Boş çıktı 1 birim ücretleniyor; varsayılan kademe yoksa ücret 0 ve hata yok | `jobs.go:398` | Boş çıktı `failed`; `ok` kontrolü ve alarm |
| ✓ Kademe seçilemiyor, girdi fiyatı hiç ücretlendirilmiyor | `jobs.go:402`, `billing/billing.go:30` | Girdiden kademe, girdi fiyatı tahsilata |
| ✓ Bloke yalnızca bir birim | `billing.go:45` | Girdiden en yüksek tutar (kural zaten yazılı) |
| ✓ Üretici adapter'ı hangi kayda hizmet ettiğini bilmiyor; `base_url` ve anahtar adapter'a ulaşmıyor | `providers/provider.go:17` | İlk adapter'dan önce adapter kayıt başına kurulur |
| Üretici 429'u görevi düşürüyor; kural "bekler, hata değildir" diyor | `provider.go:44`, `jobs.go:205` | `RateLimited` türü, deneme harcamadan bekletir |
| Dispatch sürümü, modeli ve askıyı yeniden kontrol etmiyor; emekli sürüm ve askıdaki hesabın işi çalışıyor | `jobs.go:94` | Kurallara göre iptal, bekleme veya hata |
| Başarısız denemenin maliyeti kayıtsız, `attempts`'te kolon yok | `tasks/store.go:194` | `attempts.cost_micros`, kabul edilen denemeye tahmini maliyet |
| `no_route_available` ve `queue_timeout` kodları hiç üretilmiyor; kuyruktaki iş 24 saat bloke tutuyor | `tasks/failure.go:6`, `jobs.go:216` | Kodlar eklenir, 1 saat kuralı |
| Kod hatası sonrası task var ama 500 dönüyor, retry ikinci ücret yazabiliyor; replay durumu yanıltıcı | `rest.go:99` | Oluşan task döner; durum task'tan seçilir |
| Çıktı şemaya göre süzülmüyor; `gs://`, ek alanlar ve `data:text/html` CDN'e geçebiliyor | `delivery/media/media.go:149`, `redact.go:67` | Şemaya göre süz, şema ve tür allowlist |
| Harcama sayımı ve filtreler hacimle büyüyor; kilit altında tarama | `tasks/store.go:125`, `00003:26` | Aylık sayaç ve bileşik indeksler |

## 3. Hata yüzeyi ve küçük hatalar (Faz 2)

| Bulgu | Yer | Ne yapılacak |
| ----- | --- | ------------ |
| ✓ Askıdaki anahtar MCP'de "invalid token", REST'te 403 alıyor | `mcpserver/mcpserver.go:66` | MCP de 403 `account_suspended`; `Bearer` büyük/küçük harf |
| ✓ `api_keys.last_used_at` hiç yazılmıyor; üye çıkarma ekranı buna dayanıyor | `identity/keys/keys.go:90` | Toplu güncelleme |
| Geçersiz ID ve metin Postgres'te 500'e dönüyor; bilinmeyen rota ve 405 düz metin; büyük gövde 400 | `rest.go:164`, `cmd/gateway/main.go:40` | Doğrulama, JSON handler'lar, 413 |
| Durdurulmuş model listede var, tek okuması 503; `state` alanı yok | `catalog/store.go:82` | Okuma serbest, `state` eklenir, yalnızca oluşturma durur |
| Manifest'te etiket varsayılanı döngü kopyasına yazılıyor; strateji ve promosyon doğrulanmıyor; `manifest.schema.json` yok | `catalog/manifest/manifest.go:227` | Düzelt ve doğrula |
| Veritabanında eksik kısıtlar: `default_version`, `replacement`, `live_release` FK; tek canlı release; negatif tutarlar | `00001_init.sql` | Migration |
| `dev-seed` ledger satırı yazmadan bakiye veriyor | `cmd/migrate/devseed.go:55` | Ledger'dan geçer |
| `X-Request-Id` loglanmıyor, MCP göndermiyor | `rest.go:51` | Logger ve MCP |

## 4. Admin (Faz 0–1)

| Bulgu | Yer | Ne yapılacak |
| ----- | --- | ------------ |
| ✓ Kademe maliyeti uyduruluyor (maliyet × fiyat oranı); marj her kademede aynı | `apps/admin/src/mock-api/catalog.ts:58` | Route'ta kademe başına maliyet |
| ✓ UI'dan eklenen provider açılamıyor; yalnızca `paused` için buton var | `apps/admin/src/features/providers/providers-view.tsx:142` | Anahtar varsa "Aç"; kapatma da eklenir |
| ✓ Marj uyarısı kodda %15, kural %20 ayar; hiçbir kayıt gerekçe veya `pricing.below_cost` istemiyor | `apps/admin/src/lib/catalog.ts:10` | Ayardan okunur, sunucuda zorlanır, app release'lerine de uygulanır |
| Eşzamanlı düzenleme kontrolü yok; ekran "birleştiriyoruz" diyor, tam değer yazmalar birbirini eziyor | `details-tab.tsx:204` | `version` kolonu, 409 `stale`, metin düzeltmesi |
| Elle yükleme hep `grant` (90 gün); eksiye düşürme hep reddediliyor; 1.000 $ kuralı yalnızca istemcide | `mock-api/handlers/customers.ts:94` | `kind`, `confirmNegative`, sunucu rol kontrolü |
| Model kapatılamıyor: son route durdurulamıyor, varsayılan deprecate edilemiyor | `handlers/models.ts:403` | Karara göre izin verilir; sunset varsa son route `draining` |
| Test kapısı yok: uç, sonuç kaydı, `no_test` hatası, "test edilmedi" route durumu | `packages/admin-api/src/models.ts:272` | Test tablosu, route ve şema parmak izine bağlı |
| Promote provider durumunu görmüyor; kapalı üreticideki route "aktif" sayılıyor | `mock-api/catalog.ts:87` | Ortak "kullanılabilir route" kontrolü |
| Liste metrikleri (`requests24h`, `revenue30d`, sağlık) karşılayacak indeks ve tablo yok; `incidents7d`, `balance` tanımsız | `models.ts:143`, `providers.ts:48` | Saatlik özet tablolar; metrikler değişiklik yanıtlarından çıkar |
| `AdminTask` satırı app çalışmasını anlatmıyor; app parent ve child ayrımı yok, `hold`, `stage`, `metadata` alanı yok | `requests.ts:20`, `seed/requests.ts:255` | Parent ve child gösterimi |
| Müşteri = workspace + tek sahip; `autoReload` kolonu yok, ledger ve kullanım sayfalanmıyor, `held` görünmüyor | `customers.ts:23` | Satır workspace; sahip alt nesne; Members sekmesi |
| Audit eksikleri: ilk canlıda otomatik default, provider check, 200 karakter üstü fiyat, model sayfası yalnızca `model` hedefi | `handlers/models.ts:381`, `mock-api/audit.ts:30` | Tam kapsam; sistem aktörü (devre kesici) |
| İzin açıkları: `createModel public` yalnızca `catalog.edit`; varsayılan görünürlük mock `public`, DB `private`; canlı route eklemek `catalog.edit` | `handlers/models.ts:176` | Kurallara ve DB'ye hizalanır |
| Yalan arayüz: curl örneği yanlış yol ve biçim; "konsolda aç" publisher'sız; `private` var olmayan allowlist vaat ediyor; limit diyaloğu 1.000.000 yazıyor, sunucu 100.000 | `schema-tab.tsx:133`, `model-detail.tsx:99`, `labels.ts:30`, `limits-dialog.tsx:34` | Düzelt |
| İzinler dört yerde, kurallar UI ve mock'ta tekrar ediyor | `auth.ts:6`, `lib/permissions.ts:5`, `seed/operators.ts:14` | Tek kaynak |
| Mock gerçekçi değil: overview uydurma, `checkProvider` hep başarılı, yarışlar görünmüyor, başarısız işlem sonrası ekran yenilenmiyor | `handlers/overview.ts`, `handlers/providers.ts`, `use-model-action.ts:39` | Mock Go API ile aynı testlerden geçer; hata yolları |
| Sözleşmede yeri olmayan kararlar: ayarlar, 9 limitin 6'sı, duyurular, `model_access`, şablonlar, draft silme, iade, itiraz, üyeler, ret bayrakları, operatör 2FA, kullanıcı askısı | `packages/admin-api/src/*` | Faz 0'da sözleşmeye; hangisi hangi fazda açıkça yazılır |
| Adapter listesi kurallarla uyuşmuyor (`google`, `kling` yok, `fake` etiketsiz); `credential.source`, `rotatedAt` kolonu yok; port'ta check ve balance yok | `providers.ts:18`, `provider.go:77` | Hizalanır |

## 5. Müşteri konsolu (Faz 3)

| Bulgu | Yer | Ne yapılacak |
| ----- | --- | ------------ |
| ✓ "Credits never expire" | `apps/console/src/features/billing/components/billing-dialogs.tsx:18` | Metin ve parti bazlı bitiş tarihi |
| Bonus basamakları canlı teklif gibi; bonus kurala göre kapalı | `billing/components/bonus-ladder.tsx:12`, `mocks/workspace.ts:44` | Ayardan; kapalıysa gizli |
| "Pay $50" komisyon, vergi ve borcu göstermiyor | `dialogs/add-funds-form.tsx:75` | Sunucudan tutar özeti |
| Quickstart örneği çalışmıyor: `modelvend/lumen-1` yok | `components/code/snippets.ts:12` | Gerçek katalog modelinden üretilir |
| "Our in-house model", fal/Replicate/3D gibi seçilmeyenler; boş yazar Modelvend'e yazılıyor | `mocks/models.ts:11`, `lib/model.ts:11` | Sahte içerik temizliği |
| Playground gerçek task'ı anlatamıyor: `queued`, `failed`, iptal yok; API hata kodları işlenmiyor; CSP çıktıyı engelleyecek; `loading.tsx` yok | `models/lib/playground.ts:49`, `next.config.ts:17` | `redact.Task` üzerine yeniden; her hata kodu UI'a |
| Playground alanları şema doğrulamasından geçmez (`aspect`/`aspect_ratio`, `count`/`num_images`, string süre) | `models/lib/playground.ts:134` | Şemadan form |
| Bakiye anlamı farklı: bloke hesaba katılmıyor | `playground/playground.tsx:96`, `billing.go:45` | Sunucudan `balance` ve `available`; 402 işlenir |
| Usage HTTP kodu gösteriyor, API kaydetmiyor; 402 satırı var olamaz; "30 gün saklanır" kuralla çelişiyor | `types/usage.ts:18`, `mocks/usage.ts:110` | Task bazlı kullanım (bölüm 11) |
| Metin modalitesi tipte yok; yanlış örneğe sessizce düşüyor | `types/model.ts:1`, `snippets.ts:22` | Eklenir |
| Anahtar: son 4 hane gösteriliyor ama yalnız ilk 12 var; iptal edilen kayboluyor; onay yok; scope ve limit UI yok | `api-keys-table.tsx:38`, `keys.go:21` | Hizalanır |
| Bütçe, "alerts coming soon", "never invoiced", "spending controls" kararsız vaatler | `billing/components/balance-card.tsx:39`, `spend-overview.tsx:61` | Bütçe kalkar; tavan yalnızca varsa |
| Canvas "early access", "new" rozeti | `canvas/page.tsx:19`, `nav-config.ts:19` | Nötr metin veya gizli |
| Elle para mantığı tekrarlı, promosyon girdiye de uygulanıyor | `playground.ts:304`, `pricing-table.tsx:71`, `lib/pricing.ts:23` | Sunucudan fiyat teklifi |
| Yalnızca slug'la adres; aynı slug çakışır; `@version` hiç yok | `models/lib/links.ts:1` | `/models/[publisher]/[slug]`, sürüm seçici |
| Providers, Performance, Uptime uydurma sayılar | `detail/model-detail.tsx:76` | Bölüm 11 |
| Rol ve çok workspace'e yer yok | `types/workspace.ts:39`, `workspace-switcher.tsx:7` | Oturum biçimi, rol kapıları |
| README yanlış: mock import, olmayan bileşenler; favori yıldızı kayboluyor; "Model card" kök dokümana gidiyor | `apps/console/README.md:7`, `model-header.tsx:53` | Düzelt |
| Örnek kodlarda hata kontrolü yok, `Idempotency-Key` yok | `components/code/snippets.ts` | Örnekler düzeltilir |

## 6. Doğrulanamayanlar

- Çalışma zamanı: yukarıdaki hiçbir şey canlı denenmedi.
- Sözleşme uyumu: `api/*.yaml` boş, referans Go kodu ve Türkçe dokümanlar.
- Üçüncü taraf MCP istemcilerinin kurulum sözdizimi.
- Operatör ve audit şeması: dokümanlar `postpane`'e atıf yapıyor, bu repoda yok.
- Üretici davranışı: adapter yok; 429 ve şema dışı çıktı senaryoları port sözleşmesine dayanıyor.
