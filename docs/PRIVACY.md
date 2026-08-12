# Local_Agents — Gizlilik Politikası / Privacy Policy

**Son güncelleme / Last updated:** 2026-08-11

Bu metin, Google Play Veri Güvenliği formu için gereken gizlilik politikası
kaynağıdır. Yayınlarken bir URL'de barındır (örneğin GitHub Pages) ve Play Console'a
o adresi gir.

---

## Türkçe

### Kısaca

Local_Agents veri **toplamaz**. Uygulama, kullanıcının kendi bilgisayarında çalışan
companion sunucusunun uzaktan kumandasıdır. Tüm sohbetler, çalışma geçmişi ve dosyalar
kullanıcının kendi donanımında kalır. Geliştiriciye giden hiçbir veri yoktur.

### Toplanan veriler

**Hiçbiri.** Uygulamada analitik SDK'sı, reklam SDK'sı, çökme raporlama servisi veya
üçüncü taraf izleyici yoktur. Geliştiricinin işlettiği bir sunucu yoktur.

### Verinin nerede durduğu

- **Sohbetler, komutlar, ajan çıktısı, araç sonuçları:** kullanıcının kendi
  bilgisayarındaki companion veritabanında (SQLite).
- **Dosyalar:** yalnızca kullanıcının açıkça tanımladığı runner klasörlerinde. Uygulama
  telefondaki dosyalara erişmez.
- **Model sağlayıcı anahtarları:** yalnızca bilgisayarda. Telefona hiç gönderilmez.
- **Cihazdaki veri:** companion adresi ve kimlik anahtarları. Yenileme anahtarı Android
  Keystore'daki AES-GCM anahtarıyla şifrelenir.

### Ağ trafiği

Uygulama yalnızca kullanıcının girdiği companion adresine bağlanır. Başka hiçbir uç
noktaya bağlanmaz. Bağlantı, kullanıcının seçtiği taşıma katmanı üzerinden gider
(HTTPS tüneli, Tailscale veya yerel ağ).

Companion tarafında web araştırma araçları etkinleştirilmişse, o istekler
**bilgisayardan** kullanıcının seçtiği arama sağlayıcısına gider; telefondan değil.

### İzinler

- `INTERNET` — companion sunucusuna bağlanmak için.
- `POST_NOTIFICATIONS` (Android 13+) — çalışma tamamlandı/başarısız bildirimi.

### Verinin silinmesi

- Bir sohbeti ve tüm mesaj/çalışma/olay kayıtlarını uygulama içinden **silebilirsin**
  (oturum satırındaki sil eylemi).
- "Eşleştirmeyi kaldır" cihazdaki kimlik anahtarlarını siler.
- Uygulamayı kaldırmak cihazdaki tüm uygulama verisini siler.
- Companion tarafındaki geçmiş kullanıcının kendi bilgisayarındadır; companion
  veritabanı dosyası silindiğinde tamamen kaybolur.

### Çocuklar

Uygulama çocuklara yönelik değildir ve çocuklardan veri toplamaz.

### İletişim

Sorular için proje deposundaki iletişim kanalını kullan.

---

## English

### In short

Local_Agents collects **no data**. The app is a remote control for a companion server
that runs on the user's own computer. All conversations, run history, and files stay on
the user's own hardware. Nothing is sent to the developer.

### Data collected

**None.** The app contains no analytics SDK, no advertising SDK, no crash reporting
service, and no third-party trackers. The developer operates no server.

### Where data lives

- **Conversations, prompts, agent output, tool results:** in the companion database
  (SQLite) on the user's own computer.
- **Files:** only in the runner folders the user explicitly configured. The app does
  not access files on the phone.
- **Model provider keys:** on the computer only. They are never sent to the phone.
- **On-device data:** the companion address and authentication tokens. The refresh
  token is encrypted with an AES-GCM key held in the Android Keystore.

### Network traffic

The app connects only to the companion address the user entered. It contacts no other
endpoint. The connection uses whatever transport the user chose (an HTTPS tunnel,
Tailscale, or the local network).

If web research tools are enabled on the companion, those requests are made **from the
computer** to the search provider the user selected — never from the phone.

### Permissions

- `INTERNET` — to reach the companion server.
- `POST_NOTIFICATIONS` (Android 13+) — run completed/failed notifications.

### Deleting data

- A conversation and all of its messages, runs, and events can be **deleted from inside
  the app** (the delete action on a session row).
- "Unpair" removes the authentication tokens from the device.
- Uninstalling removes all app data from the device.
- History on the companion side lives on the user's own computer and is gone once the
  companion database file is deleted.

### Children

The app is not directed at children and collects no data from them.

### Contact

Use the contact channel in the project repository for questions.
