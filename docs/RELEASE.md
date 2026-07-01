# Local_Agents — Sürüm Hazırlığı (Android)

Bu doküman, Android uygulamasını yan-yükleme (APK) veya Google Play (AAB) için
yayına hazırlama adımlarını toplar. Güncel sürüm: **versionName `0.1.9`,
versionCode `10`** (`android/app/build.gradle.kts`).

---

## 1. İmzalama

### Durum
- **Debug/yan-yükleme:** `keystore.properties` yoksa release derlemesi otomatik olarak
  **debug anahtarıyla** imzalanır — hızlı kurulabilir APK için yeterli, mağaza için değil.
- **Yükleme anahtarı:** `android/keystore.properties` bulunduğunda release derlemesi o
  gerçek anahtarla imzalanır. Yapılandırma `build.gradle.kts` içinde hazırdır.

### Yükleme anahtarı üret (bir kez)
```powershell
# android/ dizininde:
mkdir keystores
keytool -genkeypair -v -keystore keystores\local-agents-upload.jks `
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```
Parolayı güvenli sakla; **kaybolursa aynı uygulamayı güncelleyemezsin** (Play App Signing
kullanılmıyorsa). Google Play'de **Play App Signing** önerilir: sen yalnız *upload* anahtarını
tutarsın, imzalama anahtarını Google yönetir.

### keystore.properties oluştur
`android/keystore.properties.example` dosyasını `android/keystore.properties` olarak
kopyala ve doldur:
```properties
storeFile=keystores/local-agents-upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```
Bu dosya ve `*.jks/*.keystore` **`.gitignore`'dadır** — gerçek parolalar git'e girmez.

---

## 2. Derleme komutları

```powershell
# Yan-yükleme APK'sı (küçük, minified, imzalı):
android\gradlew.bat :app:assembleRelease
#  -> app\build\outputs\apk\release\Local_Agents-release.apk

# Google Play için App Bundle (önerilen mağaza formatı):
android\gradlew.bat :app:bundleRelease
#  -> app\build\outputs\bundle\release\app-release.aab
```
Android Studio'da: **Build > Generate App Bundles or APKs > Generate APKs / Generate Bundles**
(aktif build variant `release` iken).

Not: release derlemesi **R8** ile küçültülür (`isMinifyEnabled = true`,
`proguard-rules.pro`). APK ~2.9 MB'a iner.

---

## 3. Mağaza listesi (taslak)

- **Uygulama adı:** Local_Agents
- **Kısa açıklama (≤80 karakter):** PC'nizdeki LLM ajanını telefondan yöneten native kontrol
  konsolu.
- **Tam açıklama:** Local_Agents, kendi PC'nizde çalışan bir LLM ajanının native Android
  kontrolcüsüdür. Görev başlatın; model çıktısını ve araç etkinliğini canlı izleyin;
  çalışmaları duraklatın/sürdürün/durdurun; ağ koparsa kalıcı geçmişe yeniden bağlanın.
  Sağlayıcı anahtarları ve dosyalar PC'de kalır; telefon yalnızca konsoldur. Ana ekran
  widget'ları (durum, akış listesi, kontrol paneli) ile uygulamayı açmadan takip edin.
- **Kategori:** Araçlar / Verimlilik
- **İçerik derecelendirmesi:** Herkes (kullanıcı tarafından üretilen içerik ajan
  çıktısıdır; buna göre anketi doldur).
- **Ekran görüntüleri:** `docs/qa-pair-screen-final-360x760.png`,
  `docs/qa-sessions-screen-360x760.png` başlangıç olarak kullanılabilir; monitör, modeller,
  ayarlar ve widget ekranlarından da eklenmesi önerilir.
- **Uygulama ikonu:** `design/icon/` (adaptive + monokrom, 512px).

---

## 4. İzinler ve Veri Güvenliği (Data safety)

Kullanılan izinler (`AndroidManifest.xml`):
- `INTERNET` — PC companion'a bağlanmak için.
- `POST_NOTIFICATIONS` (Android 13+) — çalışma tamamlandı/başarısız bildirimleri.

Veri güvenliği beyanı için notlar:
- Uygulama **reklam/analitik SDK'sı içermez**; üçüncü taraflara veri göndermez.
- Ağ trafiği yalnızca kullanıcının kendi companion sunucusuna gider (Tailscale/HTTPS).
- Erişim/yenileme token'ları cihazda **şifreli** saklanır (`SecureSettingsStore`).
- Dosya araçları yalnız PC'de tanımlı runner mount'larında çalışır; ağsız/salt-okunur.
- Cleartext trafik `network-security-config` ile yalnız yerel/loopback ve tanımlı host'a
  sınırlıdır.

Gizlilik politikası: Play, veri toplanmasa bile bir gizlilik politikası URL'si ister.
Kısa bir "veri toplamıyoruz / veriler kullanıcının kendi sunucusunda kalır" metni yeterli.

---

## 5. Yayın öncesi kontrol listesi

- [ ] `keystore.properties` gerçek yükleme anahtarıyla dolduruldu (mağaza sürümü için).
- [ ] `versionCode` artırıldı (her mağaza yüklemesinde artmalı), `versionName` güncellendi.
- [ ] `:app:bundleRelease` (Play) veya `:app:assembleRelease` (yan-yükleme) temiz derlendi.
- [ ] Minified (R8) sürüm gerçek cihazda dumanla test edildi (widget'lar, eşleştirme,
      çalışma akışı) — reflection/servis kırılması olmadığı doğrulandı.
- [ ] Mağaza metinleri, ekran görüntüleri, ikon, gizlilik politikası hazır.
- [ ] Data safety formu dolduruldu (yukarıdaki notlara göre).
- [ ] (Play) Play App Signing etkin; upload anahtarı yedeklendi.

---

## 6. Kaynaklar
- `android/app/build.gradle.kts` — imza yapılandırması ve sürüm.
- `android/keystore.properties.example` — imza şablonu.
- `docs/SECURITY_AUDIT.md` — güvenlik incelemesi.
- `design/icon/` — uygulama ikonu setleri.
