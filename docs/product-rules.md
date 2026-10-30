# Modelvend ürün kuralları: üyeler, limitler, kredi, fiyat ve model ekleme

> Durum: 30 Ekim 2026. Bölüm 1'deki kararları Anıl verdi. Edge case kuralları (bölüm 2–8) varsayılan öneridir: itiraz edilmezse kod bunlara göre yazılır. Oranlar ve eşikler admin ayarıdır.
> architecture.md ile çelişen yerde bu belge geçerlidir (bölüm 9).

## 1. Kararlar

| Konu                | Karar                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| İlk hedef           | Beta yok. Önce dev ortamında kendimiz test ederiz, prod kümesi gelince prod açılır                                                   |
| Hesap yapısı        | Bir kullanıcı birden çok workspace'e üye olabilir. Kayıtta kişisel workspace açılır. Bakiye, anahtar ve fatura workspace'e aittir    |
| Roller              | Sabit dört rol: Owner, Admin, Developer, Billing                                                                                     |
| Üye çıkarılınca     | Açtığı API anahtarları otomatik iptal edilir                                                                                         |
| Fiyatlandırma       | Yalnızca kullanım kadar öde; abonelik yok                                                                                            |
| Plan                | Plan veya kademe yok. Limitler ve kuyruk admin'den ayarlanır; genel varsayılan ve hesaba özel değer. Yüksek limit talebi e-postayla gelir, operatör atar |
| Limit aşımı         | Eşzamanlılık aşılınca task kuyrukta bekler. Bekleyen sayısı da dolunca 429                                                           |
| Hoş geldin kredisi  | Admin ayarı, başlangıçta 0                                                                                                           |
| Kredi süresi        | Satın alınan 1 yıl, hediye ve bonus 90 gün                                                                                           |
| İade                | 14 gün içinde, kullanılmamış kısım                                                                                                   |
| Bonus               | Admin'den ayarlanır, başlangıçta kapalı                                                                                              |
| Kart komisyonu      | Ödemeye ayrı eklenir                                                                                                                 |
| Maliyet bakiyeyi aşarsa | Task başında tam bloke. Nadiren oluşan fark eksiye yazılır; eksiyken yeni task açılmaz, sonraki yükleme önce borcu kapatır       |
| Müşteri             | Bireysel ve şirket                                                                                                                   |
| Model ekleme        | Üretici başına Go adapter'ı, model verisi veritabanında, repoda YAML şablonlar, admin'de sihirbaz                                    |
| Canlıya alma        | Test zorunlu, `catalog.publish` yetkisi gerekir. Aynı kişi yapabilir                                                                 |
| Fiyat belirleme     | Elle; asgari marj altı gerekçe, negatif marj `pricing.below_cost` yetkisi ister                                                      |
| Fiyat değişimi      | Anlık veya ileri tarihli. Her değişiklikte kimin etkileneceği ve duyuru (e-posta, site duyurusu, hiçbiri) seçilir                    |
| Kampanya            | Tarih aralıklı model promosyonu ve kişiye özel fiyat listesi. Kupon kodu yok                                                         |

### Neden plan yok

[Anthropic](https://platform.claude.com/docs/en/api/rate-limits), [OpenAI](https://mixed-news.com/en/?p=35944), [fal](https://fal.ai/docs/documentation/model-apis/concurrency-limits) ve [Runway](https://docs.dev.runwayml.com/usage/tiers/) ödemeyle ya da kullanımla artan kademe kullanıyor; [Replicate](https://replicate.com/docs/topics/predictions/rate-limits) ise herkese sabit limit veriyor. Modelvend Replicate yolunu seçti. Bunun karşılığı olarak yeni hesabın verebileceği zarar bölüm 3'teki kurallarla sınırlanır.

### Model ekleme nasıl çalışır

Rakiplerde ortak desen: protokol kodda, model veride, canlıya almadan önce test ([OpenRouter](https://openrouter.ai/docs/guides/providers/integration.md), [LiteLLM](https://docs.litellm.ai/docs/provider_registration/add_model_pricing)). Kendi çalıştırdıkları modelleri ise koddan paketliyorlar ([Cog](https://github.com/replicate/cog/blob/main/docs/python.md), [fal](https://fal.ai/docs/serverless/development/handle-inputs-and-outputs), [Truss](https://docs.baseten.co/development/model/build-your-first-model)).

1. **Adapter (Go, üretici başına bir kez):** `providers/google`, `openai`, `elevenlabs`, `kling`.
2. **Şablon (YAML, upstream başına):** `catalog/templates/<üretici>/<model>.yaml`. Şema, `mapping`, maliyet, örnek girdi. Deploy ile gelir, müşteriye görünmez.
3. **Sihirbaz (admin):** Üretici seç > şablon seç (ya da boş başla) > ad, slug, açıklama, görsel > alanları düzenle veya JSON'a geç > kademeler ve fiyat > kaydet (draft).
4. **Test:** "Test et" gerçek istek atar; sonuç, süre ve maliyet görünür.
5. **Yayın:** Staging'de deneme, sonra canlı ve default.

## 2. Üyeler ve workspace'ler

### Rol matrisi

| Yetki                                  | Owner | Admin | Developer | Billing |
| -------------------------------------- | ----- | ----- | --------- | ------- |
| Workspace silme, sahiplik devri        | ✓     |       |           |         |
| Üye davet etme, çıkarma, rol değiştirme | ✓     | ✓     |           |         |
| Anahtar açma ve iptal                  | ✓     | ✓     | ✓         |         |
| Anahtar listesini görme (yalnızca prefix) | ✓     | ✓     | ✓         | ✓       |
| Playground ve task geçmişi             | ✓     | ✓     | ✓         |         |
| Webhook ve workspace ayarları          | ✓     | ✓     |           |         |
| Kart, yükleme, fatura, auto-reload     | ✓     | ✓     |           | ✓       |
| Kullanım ve harcama                    | ✓     | ✓     | ✓         | ✓       |

Admin, Owner'ı çıkaramaz ve rolünü değiştiremez. Developer yalnızca kendi açtığı anahtarları iptal eder.

### Edge case'ler

| Durum                                       | Kural                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Son Owner ayrılmak istiyor                  | Engellenir; önce devir ya da workspace silme                                                                                           |
| Sahiplik devri                              | Yalnızca doğrulanmış mevcut üyeye; eski Owner Admin olur                                                                               |
| Davet                                       | 7 gün geçerli, tek kullanımlık, davet edilen e-posta ile eşleşmeli. Kabul edilmeden iptal edilebilir. Üye zaten varsa hata             |
| Üye çıkarıldı veya ayrıldı                  | O workspace'teki erişimi hemen biter; açtığı anahtarlar iptal edilir; onunla açılmış, çalışan task'lar biter ve ücretlendirilir; kayıtlar kalır |
| Çıkarma ekranı                              | İptal olacak anahtarlar ve son kullanımları önceden gösterilir (üretim kesilmesin diye)                                                |
| Anahtarı açan silinmiş                      | Anahtar zaten iptaldir; kayıtta "silinmiş üye" görünür                                                                                 |
| Workspace silme                             | Çalışan task varsa engellenir. Anahtarlar iptal edilir. 30 gün geri alınabilir, sonra kapanır. Kalan kredi iade edilmez (14 gün kuralı hariç); uyarılır. Finans kayıtları saklanır |
| Eksi bakiyeli workspace silme               | Engellenir                                                                                                                             |
| Kullanıcı hesabını silme                    | Tek Owner olduğu workspace varsa engellenir. Kişisel veri anonimleştirilir, fatura kayıtları yasal süre tutulur                        |
| Aynı e-posta ile Google ve şifre            | Doğrulanmış e-postada hesaplar birleşir. Doğrulanmamış şifre kaydı hesap ele geçirmeye karşı iptal edilir                              |
| E-posta değişimi                            | Yeni adres doğrulanana kadar eskisi geçerli; eski adrese bildirim gider                                                                |
| Şifre sıfırlama                             | Kullanıcının tüm oturumları kapanır; API anahtarları etkilenmez                                                                        |
| Doğrulanmamış e-posta                       | Konsola girebilir; anahtar açamaz, yükleme yapamaz, hediye kredi alamaz                                                                |
| Workspace askıya alındı                     | Anahtarlar 403 `account_suspended`. Kuyruktaki task'lar iptal edilir, bloke kalkar. Çalışanlar biter. Konsol salt okunur, yükleme kapalı |
| Kullanıcı askıya alındı (kötüye kullanım)   | Girişi kapanır; yalnızca kendi workspace'lerini etkiler, üye olduğu diğerlerinde üyeliği donar                                         |

## 3. Limitler

Tablodaki her limitin iki katmanı var: **genel varsayılan** (admin ayarlar ekranı) ve **hesaba özel değer** (admin müşteri kartı). Hesaba özel değer varsa o geçerlidir, yoksa genel varsayılan. İkisi de deploy gerektirmez, operatör istediği an değiştirir.

| Limit                          | Varsayılan              | Not                                                       |
| ------------------------------ | ----------------------- | --------------------------------------------------------- |
| Dakikada istek                 | 120                     |                                                           |
| Eşzamanlı çalışan task         | 10                      |                                                           |
| Kuyrukta bekleyen task         | 50                      | Dolunca 429 `queue_full`                                  |
| Kuyrukta en uzun bekleme       | 1 saat                  | Aşılınca `failed: queue_timeout`, ücret yok               |
| Günlük harcama limiti          | Yok                     | Dolunca 402 `daily_spend_limit_reached`; 00:00 UTC'de sıfırlanır |
| Aylık harcama tavanı           | Yok                     | Müşteri kendisine daha düşük bir değer de koyabilir       |
| Alt hesap sayısı               | 10                      |                                                           |
| Tek yükleme                    | 5 $ – 10.000 $          | Konsoldaki mevcut sınır                                   |
| İlk 7 gün yükleme tavanı       | Günlük 500 $            | Plan olmadığı için çalıntı karta karşı ana koruma         |

- **Daha yüksek limit talebi:** Müşteri e-postayla ister, operatör müşteri kartından o hesaba özel değeri girer. Uygulama içinde talep formu yok. Değişiklik gerekçesiyle audit'e yazılır.
- **Harcama limitlerinin sayımı:** Başarılı task'ların fiyatı ile bitmemiş task'ların blokesi toplanır. Bu nedenle limiti aşacak task baştan reddedilir, çalışan task kesilmez.
- **Hesaba özel değer** workspace'e bağlanır, çünkü bakiye ve anahtarlar workspace'e aittir. Bir kullanıcının birden çok workspace'i varsa her biri ayrı ayarlanır.
- Kuyrukta adalet: workspace'ler kendi eşzamanlılık hakkıyla sıraya girer, biri diğerini boğmaz.
- Üretici limitimiz dolunca task aynı kuyrukta bekler. Müşteri limitinden bağımsızdır ve hata değildir.
- Limit düşürülürse çalışanlara dokunulmaz, yeni task'lara uygulanır. Düşürme gerekçe ister ve audit'e yazılır.

## 4. Kredi ve yükleme

### Yapı

Bakiye tek sayı olamaz, çünkü kredilerin süresi farklı. Eklenecek tablo: `credit_lots` (tür, tutar, kalan, bitiş tarihi, kaynak ledger satırı). `workspaces.balance_micros` önbellek olarak kalır. Ledger'a `expire` ve `fee` türleri eklenir. Harcama en erken dolan partiden başlar.

### Edge case'ler

| Durum                                   | Kural                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Kredi bloke altındayken süresi doldu    | Task bitene kadar dolmaz; kalanı sonra düşülür                                                                 |
| Bitiş bildirimi                         | 30 ve 7 gün önce e-posta (yalnızca satın alınan krediler için)                                                 |
| Eksi bakiyeyken yükleme                 | Önce borç kapanır, kalanı bakiyeye eklenir. Müşteri ödeme öncesi görür                                         |
| Bakiye blokeye yetmiyor                 | 402 `insufficient_credits`; task yazılmaz                                                                      |
| Ödeme kaydı                             | Bakiye yalnızca Stripe webhook'u ile eklenir, dönüş sayfasıyla değil. Olay kimliğiyle idempotent               |
| Çift tıklama, yeniden deneme            | Checkout idempotency anahtarı kullanır; tek ödeme                                                              |
| Auto-reload aynı anda iki kez tetiklendi | Workspace başına tek bekleyen yükleme                                                                         |
| Auto-reload kartı reddedildi            | Bir kez yeniden denenir, sonra kapanır, Owner ve Billing'e e-posta gider                                       |
| Auto-reload 3D Secure istiyor           | Başarısız sayılır; e-postada ödeme bağlantısı gider                                                            |
| Auto-reload kaçağı                      | 24 saatte en fazla 5 yükleme, sonra kapanır ve uyarı gider                                                     |
| Bakiye düşükken task bekliyor           | Auto-reload arka planda çalışır; yetmeyen task beklemez, 402 alır                                              |
| Kart silindi, auto-reload açık          | Uyarı ile auto-reload kapanır                                                                                  |
| İade                                    | Yalnız ödemeden itibaren 14 gün, partinin kalan kısmı. Komisyon iade edilmez. O ödemenin bonusu silinir; bonus harcandıysa tutar iadeden düşülür |
| Kart itirazı (chargeback)               | Workspace askıya alınır, kalan kredi dondurulur, tutar düşülür. İtiraz kazanılırsa geri eklenir                |
| Operatör kredi düzeltmesi               | Gerekçe zorunlu, audit'e yazılır. Negatif düzeltme bakiyeyi eksiye düşürecekse ayrıca onay ister               |
| Hoş geldin kredisi                      | Yalnızca doğrulanmış e-posta; kullanıcı başına bir kez                                                         |
| Workspace'ler arası aktarım             | Yok; yalnızca ana hesap > alt hesap (prepaid)                                                                  |
| Alt hesaba aktarım                      | Kredi kalan süresiyle geçer. Alt hesap kapanınca kalan ana hesaba döner                                        |
| Para birimi                             | Yalnızca USD. Kur farkı müşterinin bankasına aittir                                                            |
| Vergi                                   | Stripe Tax ile fiyatın üzerine; prod öncesi mali müşavir teyidi                                                |
| Test anahtarı                           | Canlı gibi ücretlendirilir (dokümandaki mevcut kural)                                                          |

## 5. Task ve ücretlendirme

| Durum                                        | Kural                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Fiyat ne zaman sabitlenir                    | Task oluşturulurken: bloke ve tahsilat aynı fiyat revizyonunu kullanır                                    |
| Bloke nasıl hesaplanır                       | Girdiden en yüksek tutar (süre, adet, kademe)                                                             |
| Gerçek çıktı tahminden az (4 yerine 3 görsel) | Üretilen birim ücretlendirilir, fark serbest kalır                                                        |
| Gerçek çıktı tahminden fazla                 | Fark eksiye yazılır; admin'e uyarı                                                                        |
| Üretici hata verdi, işi almadan              | Fallback; hepsi başarısızsa `failed`, ücret yok                                                           |
| Üretici işi aldı, sonuç vermedi              | Timeout'ta üretici iptal edilir, `failed`, ücret yok. Üretici yine de ücret aldıysa maliyet bizde, raporda görünür |
| Üretici içerik reddi                         | `content_policy`, ücret yok. Workspace başına ret sayısı izlenir, eşik aşılınca admin'e bayrak             |
| Müşteri iptali                               | Çıktı oluşmadıysa ücret yok; üretici maliyeti bizde. Sık iptal admin raporunda                            |
| Çıktı üretildi, depoya kopyalanamadı         | Yeniden denenir; üretici URL'si dolduysa `failed`, ücret yok                                              |
| Worker düştü                                 | Job yeniden çalışır; `upstream_id` varsa yeniden göndermez, poll eder (çift üretim yok)                   |
| Kuyrukta beklerken model durduruldu          | Bekler; model emekli olursa `failed: model_unavailable`, ücret yok                                        |
| Tüm route'lar kapalı veya üretici durduruldu | `failed: no_route_available`, ücret yok; admin'e alarm                                                    |
| Çıktı süresi doldu (30 gün)                  | Dosya silinir, URL 410 döner; task ve kullanım kaydı kalır                                                |
| Webhook başarısız                            | 24 saat üstel bekleme; sonra durur, konsolda görünür. Sürekli başarısızlıkta Owner'a e-posta              |

## 6. Fiyat değişimi ve kampanya

### Fiyat değişimi ekranı

Operatör bir sürümün fiyatını değiştirirken şunları seçer:

1. **Ne zaman:** şimdi ya da ileri tarih.
2. **Kim etkilenir:** varsayılan herkes. İşaretlenince korunur:
   - [ ] Özel fiyatı veya kampanyası olanlar
   - [ ] Şu tarihten önce kayıt olanlar
   - [ ] Seçili müşteriler
3. **Koruma ne zaman bitsin:** tarih (isteğe bağlı).
4. **Duyuru:** e-posta, site duyurusu, ikisi ya da hiçbiri. Yalnızca modeli son 90 günde kullananlara.

Önizleme: etkilenen ve korunan hesap sayısı, yeni marj. Gerekçe audit'e yazılır.

Yapı: `model_versions.pricing` yerine sürüme bağlı `price_revisions` (numaralı, `effective_at`); korunanlar için `price_locks` (workspace, revizyon, bitiş). Task kaydı kullandığı revizyonu taşır.

### Edge case'ler

| Durum                                  | Kural                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Hangi fiyat uygulanır                  | Liste, promosyon, özel fiyat ve korunan fiyattan **müşteri için en düşüğü**. Çarpılmaz                    |
| Liste fiyatı korunan fiyatın altına indi | Yeni düşük fiyat uygulanır: kimse listeden pahalı ödemez                                                  |
| Çalışan task                           | Oluşturulduğu andaki fiyattan biter                                                                       |
| Anlık artış                            | Kullanım şartlarında bu hakkın yazması gerekir; müşteri fiyatı API'den ve konsoldan görür                 |
| Kademe silindi veya birim değişti      | Fiyat revizyonu değil, yeni sürüm gerekir (şemaya bağlı)                                                  |
| Koruma bitti                           | O andan itibaren güncel fiyat; bitişten 7 gün önce isteğe bağlı e-posta                                   |
| Kampanya bitti                         | Kendiliğinden normale döner. İleri tarihli değişimle çakışırsa ikisi de geçerlidir, en düşük kuralı işler |
| Alt hesap                              | Ana hesabın fiyatını kullanır                                                                             |
| Yeni üye                               | Korumalardan yararlanmaz, güncel fiyatı görür                                                             |
| Maliyet değişince marj düştü           | Admin'de uyarı; fiyat kendiliğinden değişmez                                                              |

Site duyurusu için yeni parça: admin'de `announcements`, konsolda banner.

## 7. Model yaşam döngüsü

| Durum                                       | Kural                                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Test ne kadar geçerli                       | Şema, `mapping` ya da üretici değişirse geçersiz olur. Her aktif route için son test başarılı olmalı |
| Test maliyeti                               | İç workspace'e yazılır, müşteri geliri sayılmaz, tutar ekranda görünür                              |
| Canlı sürüme yeni route                     | O route test edilmeden aktif olmaz                                                                  |
| Son aktif route silinmek isteniyor          | Canlı sürümde engellenir; model durdurma önerilir                                                   |
| Şablon güncellendi                          | Mevcut sürümler değişmez; yeni sürüm açarken yenisi önerilir                                        |
| Üretici modeli kapatıyor                    | Route `draining`; yedek yoksa `deprecate` ve sunset akışı                                           |
| Üretici anahtarı geçersiz                   | Sağlık düşer, route atlanır, admin'e alarm                                                          |
| Yanlış şablon, bozuk mapping                | Test yakalar; canlıda yakalanırsa `failed`, ücret yok; route otomatik devre dışı (devre kesici)     |
| Asgari marj                                 | Varsayılan %20, admin ayarı. Kart komisyonu ayrı alındığı için hesaba katılmaz                      |
| Private model                               | Allowlist gerekir (`model_access` tablosu eksik)                                                    |
| Model silme                                 | Yalnızca hiç yayınlanmamış draft silinir; diğerleri `retired` kalır                                 |
| Slug değişimi                               | Değişmez; yeni model açılır, eski sürüm yerine geçen olarak gösterir                                |

Admin'e eklenecek katalog alanları: görsel/örnek galeri, kapasiteler, en büyük çıktı, `disclosure`. Gecikme gibi değerler ölçümden gelir, elle girilmez.

## 8. Operatörler

| Durum                  | Kural                                                                     |
| ---------------------- | ------------------------------------------------------------------------- |
| Son admin              | Devre dışı bırakılamaz, rolü düşürülemez                                  |
| Eşzamanlı düzenleme    | Sürüm numarasıyla kontrol; eskiden gelen kayıt 409 alır                   |
| Audit                  | Yalnızca ekleme; secret ve kart bilgisi yazılmaz                          |
| Yeni izinler           | `pricing.below_cost`, `pricing.edit`, `settings.manage`, `announcements.manage` |
| Müşteri gibi görünme   | Yok; müşteri kartı salt okunur bilgi verir                                |

## 9. Dokümanlarla ve kodla çelişenler

| Yer                                     | Bugün                                 | Olacak                                      |
| --------------------------------------- | ------------------------------------- | ------------------------------------------- |
| architecture.md: canlı sürümün fiyatı   | Dondurulmuş                           | Fiyat revizyonları; şema donuk kalır        |
| architecture.md, `admin-api`: tier      | `free/standard/scale/enterprise`      | Kaldırılır; ayarlar ve hesaba özel istisna  |
| architecture.md: yol haritası, beta     | Faz sırası eski                       | [roadmap.md](roadmap.md) geçerli            |
| `workspaces`, `TIER_LIMITS`             | `tier` kolonu ve sabit tablo          | Kaldırılır                                  |
| `api_keys`                              | Açan kişi yok                         | `created_by` eklenir (otomatik iptal için)  |
| `workspaces.balance_micros`             | Tek bakiye                            | Önbellek; kaynak `credit_lots`              |
| `routes`                                | `mapping` admin'de yok                | Sözleşme ve sihirbaza eklenir               |
| Admin mock'u                            | Tier ekranları, bonus sabit           | Yeni kurallara göre güncellenir             |

## 10. Prod öncesi netleşecekler

Kodu engellemez; varsayılan yazıldı.

| Konu                         | Varsayılan                                      |
| ---------------------------- | ----------------------------------------------- |
| Kart komisyon oranı          | %5, admin ayarı                                 |
| Müşteri iki adımlı doğrulama | İsteğe bağlı; operatörlere zorunlu              |
| Büyük kredi düzeltmesi       | 1.000 $ üstü yalnızca admin rolü                |
| Kullanım şartları            | Anlık fiyat değişimi, iade, kredi süresi, kabul edilebilir kullanım; avukat onayı |
