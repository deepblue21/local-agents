# Local_Agents — Tasarım & Ürün Yol Haritası

Bu doküman dört işi tek planda toplar: (1) İndirilenler'deki tasarım dosyasının
incelenmesi, (2) tasarıma uygun arayüz yönü, (3) uygulamayı "düzgün hale getirme"
adımları, (4) yeni uygulama ikonu. Sonunda fazlara bölünmüş, önceliklendirilmiş bir
plan var.

İncelenen kaynaklar: `android/` (Kotlin/Compose), `server/` (FastAPI), `runner/`,
`docs/`, ekran görüntüsü `docs/qa-pair-screen.png` ve İndirilenler'deki tasarım paketi
*"Local Agents UI Tasarımı (1).zip"* (5 bölümlük tasarım sistemi dokümanı).

---

## 1. Özet

İyi haber: tasarım dosyası ile mevcut uygulama **aynı dilde** konuşuyor. Palet birebir
aynı (`#090B0F` zemin, `#38D6A3` emerald aksan), tipografi niyeti aynı (Inter +
JetBrains Mono), estetik "durum-önce operasyonel konsol". Yani sıfırdan yeniden tasarım
gerekmiyor — **tasarımın ileri olduğu birkaç noktada uygulamayı ona yetiştirmek** ve
birkaç mühendislik/ürün boşluğunu kapatmak yeterli.

En kritik üç boşluk:

1. **Launcher ikonu yok.** `AndroidManifest.xml`'de `android:icon` tanımlı değil; uygulama
   varsayılan Android ikonuyla çıkıyor. → Bu yol haritasıyla birlikte **çözüldü**
   (`design/icon/`, bkz. Bölüm 5).
2. **Tasarımdaki bazı ekran/durumlar uygulamada yok** (iskelet-yükleme, yeniden-bağlanma
   sayacı, bağlam penceresi dolu durumu, zenginleştirilmiş araç kartları).
3. **Birkaç "düzgünleştirme" maddesi** (cleartext trafik kapsamı, 984 satırlık tek UI
   dosyası, sabit metinler, marka fontlarının paketlenmemesi).

---

## 2. Tasarım dosyası ↔ mevcut uygulama (boşluk analizi)

Tasarım dosyası 5 bölüm: Tasarım Sistemi · Çekirdek Ekranlar (Eşleştirme, Oturumlar,
Çalışma Monitörü, Modeller, Ayarlar) · Durumlar · Araç Zaman Çizelgesi Stilleri ·
Uygulama İkonu.

| # | Tasarımın istediği | Uygulamada şu an | Aksiyon | Öncelik |
|---|--------------------|------------------|---------|---------|
| G1 | Marka işareti: **Sinyal Düğümü** (nabız halkaları + glow'lu nokta) | `BrandMark()` Terminal `›_` ikonu kullanıyor | İkonu + uygulama içi marka işaretini sinyal düğümüne çevir | P0 |
| G2 | Tam **uygulama ikonu** seti (adaptive, monokrom, 512) | Launcher ikonu yok | Teslim edildi — manifeste bağla (Bölüm 5) | P0 |
| G3 | Eşleştirme kodu **gruplu**: `7K2P · 9XQ4 · MZ8R` | Düz tek alan | Girişi 4'lü bloklara formatla | P1 |
| G4 | Host önizleme **canlı**: "DESKTOP-EV / Ollama · çevrimiçi · qwen3.6 hazır" | `PairHostPreview` statik, nokta hep `Muted`, "eşleştirme sırasında doğrulanır" | Host adı + sağlayıcı + canlı durum noktası bağla | P1 |
| G5 | Oturum satırında **araç sayısı** ("4 araç") | `SessionRow` yalnız zaman·model·sağlayıcı | Aktif/biten araç sayısını ekle | P2 |
| G6 | Araç kartı: **süre (ms) + argüman/sonuç ayrımı**, kompakt/genişletilmiş 2 mod | `ToolTimeline` yalnız ad+detay, ms yok, arg bloğu yok | Kartı ms + ARGÜMAN/SONUÇ ile zenginleştir, 2 mod | P1 |
| G7 | **İskelet-yükleme** (shimmer) | `LoadingScreen` yalnız spinner | Liste/ekranlara shimmer iskelet ekle | P2 |
| G8 | **Yeniden bağlanma sayacı**: "Yeniden bağlanılıyor… (3/5)" | `OfflineBanner` var ama sayaç yok | Deneme sayacı + otomatik sürme ipucu | P1 |
| G9 | **Bağlam penceresi dolu** durumu: "8.192 token · 100% · Özetle & sürdür" | Tamamlandı: `session_contexts`, token tahmini, `/context/compress`, Android context bar | Gerekirse tokenizer kesinliği artır | P2 |
| G10 | Tipografi: paketli **Inter + JetBrains Mono** | ✅ `res/font/`'a paketlendi ve `Type.kt`'te bağlandı (Inter 4 ağırlık + JetBrains Mono 2 ağırlık; Türkçe glifler doğrulandı) | Tamamlandı | P2 |
| G11 | Monitör durum metni "**düşünüyor…**" | "çalışıyor… / Yanıt hazırlanıyor…" | Metin uyumu (küçük) | P3 |

Not: G9 ve G6 için gereken sunucu desteği eklendi. Kalan tasarım işleri ağırlıkla
saf Android/Compose işidir.

---

## 3. Uygulamayı "düzgün hale getirme" (mühendislik & ürün)

Tasarım dışında, kod tabanını incelerken görülen, sürüm öncesi kapatılması gereken
maddeler:

- **H1 · Cleartext trafik kapsamı (P1, güvenlik).** Tamamlandı: manifestte global
  `usesCleartextTraffic` yok; `network-security-config` cleartext'i yalnız
  emulator/loopback ve bu Tailscale hostuyla sınırlar. JVM testle kilitlendi.
- **H2 · Tek dosyada 984 satır UI (P2, sürdürülebilirlik).** `LocalAgentsApp.kt`'yi
  ekran başına dosyalara böl (`ui/pair/`, `ui/sessions/`, `ui/monitor/`, `ui/models/`,
  `ui/settings/`) + ortak bileşenler `ui/components/`.
- **H3 · Sabit metinler (P2, i18n).** Composable içindeki Türkçe literaller
  `strings.xml`'e taşınmalı. Tasarım TR-öncelikli; yapı lokalize edilebilir kalmalı.
- **H4 · Tasarım token'ları tek kaynak (P3).** `Theme.kt` renkleri tasarım sistemiyle
  birebir — iyi durumda; token'ları tek yerde tutup belge ile eşitle.
- **H5 · UI testleri (P2).** Compose UI testleri StatusChip, agent activity ve context
  panel için eklendi. Connected test koşumu cihaz/emülatör gerektirir.
- **H6 · Sürüm hazırlığı (P2).** `versionName 0.1.9`; AGP compileSdk uyarısı proje
  ayarıyla susturuldu. Mağaza metadatası, imzalama ve gizlilik notları hâlâ release
  teslimatı öncesi gerekir.

---

## 4. Ön araştırma bulguları (yön)

Güncel (2025–2026) pratiklere dayanan, planı şekillendiren tespitler:

- **Adaptive ikon standardı.** 108dp tuval, 66dp güvenli alan; foreground + background
  (vektör tercih) + Android 13+ için **monokrom** katman (duvar kâğıdına uyan temalı
  ikon); bildirim ikonu tek renk siluet. → İkon bu standarda göre üretildi.
- **Material 3 Expressive (Android 16, 2025 kararlı).** Daha yaylı (springy) hareket,
  yeni bileşenler (button group, split button, toolbar, yükleme göstergeleri, FAB),
  dinamik tema. → Faz 3'te seçici benimse; operasyonel konsol sadeliğini bozma.
- **Ajan-gözlem (observability) arayüz deseni.** İyi örneklerde her çalışma bir
  **trace**: girdi → planlama → model çağrıları → araç çağrıları → ara sonuçlar → final,
  her adımda **süre + token + maliyet**; ayrıca **push bildirim** ile uygulama kapalıyken
  bile takip. → Yol haritasına "token/maliyet yüzeyi" ve "çalışma bitti push'u" olarak
  eklendi (mimariye de uygun: telefon kopsa da çalışma host'ta sürüyor).

---

## 5. Uygulama ikonu (durum: ✅ teslim edildi)

Konsept tasarım dosyasının "Sinyal Düğümü"ne sadık, prodüksiyon kalitesinde elevate
edildi: yakın-siyah radyal degrade zemin, eş merkezli emerald sinyal halkaları, glow'lu
parlak çekirdek + speküler vurgu. Squircle ve yuvarlak maskede, 48px'e kadar okunur;
Android 13+ temalı ikon ve bildirim için beyaz monokrom varyant dahil.

Tüm dosyalar ve **3 adımlık kurulum** (res kopyala → manifeste `android:icon` +
`android:roundIcon` ekle → derle) için: `design/icon/README.md`.
Önizlemeler: `design/icon/previews/showcase.png`.

---

## 6. Yol haritası (fazlar)

Çaba: S ≈ <0.5 gün, M ≈ 0.5–2 gün, L ≈ >2 gün (sunucu dahil).

### Faz 0 — Hızlı kazanımlar (yarım gün)
- **G2** İkonu manifeste bağla, derle, launcher'da doğrula. (S)
- **G1** Uygulama içi `BrandMark()`'ı sinyal düğümüne güncelle (vektörü hazır). (S)
- **G11** Monitör durum metnini "düşünüyor…" ile hizala. (S)

### Faz 1 — Tasarım paritesi: eşleştirme & monitör (P1)
- **G3** Eşleştirme kodunu 4'lü bloklara formatla. (S)
- **G4** Host önizlemeye canlı durum + sağlayıcı/model bilgisini bağla. (M, hafif sunucu)
- **G6** Araç kartlarını süre (ms) + ARGÜMAN/SONUÇ ile zenginleştir; kompakt/genişletilmiş
  iki moda ayır. (M)
- **G8** Çevrimdışı şeride yeniden-bağlanma sayacı (3/5) ekle. (S)

### Faz 2 — Durumlar & dayanıklılık (P2)
- **G7** İskelet-yükleme (shimmer) ekranları. (M)
- **G9** Bağlam penceresi dolu durumu + "Özetle & sürdür" (sunucuda `compress`). (L)
- **G5** Oturum satırına araç sayısı. (S)
- **H5** Compose UI testleri. (M)

### Faz 3 — Marka & cila (P2/P3)
- **G10** Inter + JetBrains Mono fontlarını paketle. (S)
- **H2/H3/H4** UI dosya bölme, string çıkarımı, token tekilleştirme. (M)
- **M3 Expressive** seçici hareket/bileşen iyileştirmeleri. (M)

### Faz 4 — Sürüm hazırlığı (P1 güvenlik, P2 mağaza)
- **H1** Cleartext trafiği `network-security-config` ile sınırla. (S, güvenlik)
- **H6** Mağaza metadatası, ekran görüntüleri, imzalama, gizlilik notları. (M)
- **Push** "çalışma tamamlandı/başarısız" bildirimi (monokrom ikon hazır). (M)

---

## 7. Önerilen ilk adım

Faz 0 + Faz 1: ikon bağlanır, marka işareti birleşir ve eşleştirme/monitör ekranları
tasarımla bire bir hizalanır — kullanıcının ilk gördüğü iki ekran. Yaklaşık 1.5–2 gün.

---

## 8. İlerleme ve önerilen sonraki fazlar (Haziran 2026)

Tamamlananlar:

- **Faz 0** — Uygulama ikonu (`design/icon/`) projeye bağlandı; uygulama içi marka işareti
  Terminal'den **Sinyal Düğümü**'ne çevrildi; monitör metni "düşünüyor…".
- **Faz 1** — G3 gruplu eşleştirme kodu, G4 canlı host önizlemesi (`/health` probe +
  qwen3.6/web/Ollama hazır bilgisi), G6 zengin araç kartları (süre ms + ARGÜMAN/SONUÇ +
  kompakt/genişletilmiş), G8 yeniden-bağlanma sayacı.
- **Faz 2** — G7 iskelet-yükleme (shimmer) listelerde; G5 oturum satırında kalıcı
  araç sayısı (`tool_count`); G9 context bar + `session_contexts` tabanlı
  "Özetle & sürdür" akışı.
- **H2** — `LocalAgentsApp.kt` (1150 satır) aynı pakette üçe bölündü:
  `LocalAgentsApp.kt` (kabuk/nav/üst barlar), `UiComponents.kt` (paylaşılan), `Screens.kt` (ekranlar).
- **H1/H5/G10** — Cleartext kapsamı `network-security-config` ile sınırlandı ve JVM
  testle kilitlendi; Compose UI test kapsamı context panelle genişledi; mono UI
  `AppMonoFamily` merkezinden geçiyor.
- **Bildirim altyapısı** — Android 13+ notification izni, çalışma bildirim kanalı ve
  `run.completed`/`run.failed` eventlerinde yerel bildirim eklendi.
- **Ana ekran widget'ları** — 1x1 durum, 2x1 bağlantı, 2x2 çalışma özeti ve 4x2
  kontrol paneli eklendi. Boyut büyüdükçe işlev artar: yenileme, yeni sohbet,
  çalışmalar ekranına geçiş ve aktif run için duraklat/devam/durdur komutları.
- **Widget geliştirme — Faz 1** — 2x2/4x2 çalışma kartına canlılık eklendi:
  geçen süre + araç sayısı meta satırı ve etkin çalışmada indeterminate ilerleme
  çubuğu. 4x2'de boştayken run-action slotu "Tekrar" (son görevi yeniden başlatma,
  uygulamayı açmadan; `createSession`/`createRun`) butonuna dönüşür. Aktif çalışma
  varken AlarmManager ile ~45 sn'lik hafif otomatik yenileme (boşta iptal); JVM
  testleri elapsed/meta/zaman-damgası ayrıştırma için genişletildi.
- **Widget geliştirme — Faz 2** — iki yeni boyut: **2x3 akış** (kaydırılabilir son
  çalışmalar listesi; `RemoteViewsService`/`RemoteViewsFactory`, satır tıkı ilgili
  oturumu açar) ve **4x1 şerit** (geniş durum + oturum sayısı + hızlı "Yeni"). `recentRuns()`
  veri kaynağı, satır-dot durum renkleri, manifest servis/receiver kayıtları ve `FEED`
  için `notifyAppWidgetViewDataChanged` ile liste tazeleme eklendi.
- **Widget geliştirme — Faz 3** — **per-widget yapılandırma** (2x2/4x2/2x3 eklenirken
  açılan `android:configure` ekranı; dokununca açılacak hedef (Oturumlar/Çalışmalar/Yeni
  görev) + görünüm modu (Detaylı/Kompakt: kompaktta 2x2/4x2 istem+meta gizlenir) —
  SharedPreferences'ta saklanır, `onDeleted`'de temizlenir). Ayrıca feed satırına
  dokununca doğrudan ilgili oturum açılır. **Material You**:
  `values-v31/colors.xml` ile Android 12+ dinamik sistem renkleri. **Erişilebilirlik**:
  yenile butonlarına `contentDescription`. JVM testi tap-hedef doğrulamasını kapsar.
- **Faz 3 / H3 i18n ilk geçişi** — shell/topbar/nav, ilk kurulum, eşleştirme,
  oturumlar, çalışma monitörü, çalışmalar, modeller ve ayarlar ekranlarındaki ana
  kullanıcı metinleri `strings.xml` kaynaklarına taşındı.
- **Faz 3 / G10 fontlar** — Gerçek **Inter** (4 ağırlık) + **JetBrains Mono** (2 ağırlık)
  `res/font/`'a paketlendi ve `Type.kt`'te bağlandı; Inter `.otf→.ttf` (cu2qu) çevrildi,
  altı dosyada Türkçe glif kapsamı (ç ğ ı İ ö ş ü) `fontTools` ile doğrulandı. Sistem
  fontu fallback'i kaldırıldı.
- **Yayın öncesi API sertleştirme** — insecure admin token guard, auth endpoint rate-limit,
  public OpenAPI dokümanlarını kapatma ve browser security headers eklendi.
- **Eşleştirme/oturum dayanıklılığı** — pairing TTL geliştirme ortamında 240 dakikaya
  çıkarıldı; Android expired/revoked refresh token gördüğünde stale credential'ları
  temizleyip son sunucu adresi prefilled şekilde pairing ekranına döner.

Kalan büyük dış-servis parçası: app tamamen kapalıyken server-initiated push için
Firebase/FCM project credentials ve companion-side push token akışı.

Önerilen sonraki fazlar:

- **Faz 3 — Marka & i18n cilası (saf istemci, düşük risk).** H3: composable'lardaki
  kalan düşük öncelikli format/helper metinlerini ve widget durum metinlerini kademeli
  olarak `strings.xml`'e taşı (TR-öncelikli ama lokalize edilebilir).
  (G10 fontları tamamlandı — Inter + JetBrains Mono paketlendi.)
  İsteğe bağlı: Material 3 Expressive seçici hareket/bileşen dokunuşları.
- **Faz 4 — Sunucu-destekli tasarım paritesi.** FCM tabanlı gerçek
  **push bildirimi** (telefon kapalıyken bile takip) için Firebase credentials ekle.
- **Faz 5 — Sürüm hazırlığı.** H1: `usesCleartextTraffic`'i `network-security-config` ile
  yalnız yerel adreslere sınırla (tamamlandı). Mağaza metadatası, ekran görüntüleri
  (tasarım ekranları kullanılabilir), imzalama, gizlilik notları.

## 9. Kaynaklar

- Tasarım paketi: `~/Downloads/Local Agents UI Tasarımı (1).zip` (5 bölümlük tasarım sistemi)
- Proje: `android/`, `server/`, `docs/ARCHITECTURE.md`, `docs/SECURITY_AUDIT.md`, `docs/qa-pair-screen.png`
- [Android adaptive icons (developer.android.com)](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)
- [Adaptive/themed icon implementation](https://developer.android.com/develop/ui/views/launch/icon_design_adaptive)
- [Material 3 Expressive](https://9to5google.com/guides/material-3-expressive/)
- [AI agent observability (Sentry)](https://blog.sentry.io/ai-agent-observability-developers-guide-to-agent-monitoring/)
