# Local_Agents — Web Konsolu

Companion, Android uygulamasıyla **aynı özelliklere sahip** bir tarayıcı konsolunu
kendi üzerinden sunar. Ayrı bir sunucu, ayrı bir derleme adımı veya Node çalışma zamanı
yoktur: konsol `server/local_agents/web/` altındaki statik dosyalardan ibarettir ve
FastAPI tarafından servis edilir.

- Konsol: `http://<companion>/app` (kök `/` de buraya yönlenir)
- Yönetim: `http://<companion>/admin`

---

## 1. Kurulum

Ek bir adım yok. Companion çalıştığında konsol da yayındadır.

```powershell
docker compose up -d api
# veya host üzerinde
scripts\dev-server.ps1
```

Ardından `http://127.0.0.1:8791/app` adresini aç.

**Eşleştirme:** `/admin` sayfasında yönetim anahtarını gir, tek kullanımlık kod üret,
kodu konsoldaki alana yapıştır. Kod tek kullanımlıktır; büyük/küçük harf ve `·`
ayraçları önemsizdir.

Konsolu tamamen kapatmak için:

```env
LOCAL_AGENTS_WEB_CONSOLE_ENABLED=0
```

Bu durumda `/app`, `/sw.js` ve `/manifest.webmanifest` `404` döner; API ve `/admin`
çalışmaya devam eder, yani Android eşleştirmesi etkilenmez.

---

## 2. Özellikler (Android ile eşleştirme tablosu)

| Özellik | Android | Web |
|---|---|---|
| Eşleştirme + canlı host önizleme | ✅ | ✅ |
| Oturum listesi, yeni sohbet | ✅ | ✅ |
| Oturumu yeniden adlandır / sil | ✅ | ✅ |
| Canlı akış (SSE) + `Last-Event-ID` ile yeniden bağlanma | ✅ | ✅ |
| Araç zaman çizelgesi (argüman / sonuç / süre) | ✅ | ✅ |
| Web kaynakları (citation) listesi | ✅ | ✅ |
| Duraklat / sürdür / yönlendir / durdur | ✅ | ✅ |
| Bağlam kullanımı + "özetle & sürdür" | ✅ | ✅ |
| Model seçimi ve yetenek etiketleri | ✅ | ✅ |
| 8 tema | ✅ | ✅ |
| Türkçe / İngilizce | ✅ | ✅ |
| Çalışma bitti bildirimi | yerel bildirim | tarayıcı bildirimi (sekme arka plandayken) |
| Ana ekran widget'ları | ✅ | — (web karşılığı yok) |
| QR / deep link ile eşleşme | ✅ | — (kod elle girilir) |
| Uygulama olarak kurulum | Play / APK | PWA "Uygulama olarak kur" |

Konsol masaüstünde kalıcı bir oturum rayı (sidebar) + içerik düzeni, dar ekranlarda
alt sekme çubuğu kullanır. Aynı sayfa hem telefonda hem masaüstünde çalışır.

---

## 3. Kimlik bilgisi modeli

Android yenileme anahtarını Android Keystore ile şifreler. Tarayıcıda bunun karşılığı
yoktur ve `localStorage` enjekte edilen herhangi bir script tarafından okunabilir.
Konsol bu yüzden farklı bir ayrım kullanır:

| | Nerede tutulur | Script okuyabilir mi |
|---|---|---|
| Yenileme anahtarı | `HttpOnly`, `SameSite=Strict` çerez, `/api/v1/web` kapsamında | **Hayır** |
| Erişim anahtarı | yalnız JS belleği (sayfa yenilenince kaybolur) | Evet, ama 15 dk ömürlü ve kalıcı değil |
| CSRF değeri | normal çerez | Evet — bilerek; başlıkta geri yollanır |

Akış:

1. `POST /api/v1/web/session` — eşleştirme kodunu bozar, çerezleri kurar, erişim
   anahtarını gövdede döner. **Yenileme anahtarı gövdeye hiç konmaz.**
2. `POST /api/v1/web/refresh` — çerezle yeni erişim anahtarı üretir ve yenileme
   anahtarını döndürür (rotasyon). `X-CSRF-Token` başlığı zorunludur.
3. `POST /api/v1/web/logout` — yenileme anahtarını iptal eder, çerezleri siler.

Diğer tüm uçlar Android'deki gibi `Authorization: Bearer` ile korunur; çerez bu
isteklere hiç gönderilmez, dolayısıyla CSRF yüzeyi yalnızca yukarıdaki üç uçtur ve
onlar da çift-gönderim çerezi ile korunur.

`Secure` bayrağı `public_url`'den değil **isteğin gerçekten geldiği şemadan** türetilir.
Companion çoğu kurulumda hem tünel üzerinden HTTPS hem tailnet üzerinden düz HTTP ile
erişilebilir; bayrağı sabitlemek ikinci yolu sessizce bozardı. Gerekirse:

```env
LOCAL_AGENTS_WEB_SESSION_COOKIE_SECURE=1
```

---

## 4. Güvenlik notları

- **CSP.** Sayfalar `script-src 'self'` ile sunulur; `unsafe-inline` yoktur, satır içi
  script veya `onclick=` bulunmaz. API yanıtları `default-src 'none'` taşır.
- **Service worker.** Kendi script yanıtının CSP'si altında çalıştığı için ayrı bir
  politika alır (`connect-src 'self'`). API politikası ile sunulsaydı worker içindeki
  her `fetch` engellenir ve kurulu uygulamada gezinme tamamen kırılırdı.
- **XSS.** Ajan çıktısı dahil sunucudan gelen hiçbir değer markup olarak yazılmaz;
  her şey `textContent` ile veya element özelliği olarak set edilir. `el()` yardımcısı
  `html` anahtarı verildiğinde bilerek istisna fırlatır.
- **Statik dosyalar.** İstek yolu hiçbir zaman dosya sistemine ulaşmaz; içe aktarma
  sırasında oluşturulan birebir ad haritasıyla eşleştirilir, bu yüzden path traversal
  yapısal olarak imkânsızdır.
- **Önbellek.** Service worker yalnızca konsolun kendi statik dosyalarını önbelleğe
  alır. `/api` trafiği daima ağdan gider; hiçbir konuşma içeriği önbelleğe düşmez.

---

## 5. Testler

```bash
cd e2e/web-console
npm ci
npx playwright install --with-deps chromium
LOCAL_AGENTS_PYTHON=../../server/.venv/bin/python npm test
```

Playwright, companion'ı ve `fixtures/stub_ollama.py` içindeki sahte Ollama'yı kendisi
başlatır; GPU veya gerçek model gerekmez. Süit masaüstü ve mobil görünümde koşar ve
eşleştirme, akış, oturum yaşam döngüsü, tema, oturum kalıcılığı, çerez erişilemezliği,
CSP ve XSS davranışını kapsar. CI'da `web-console` işi olarak çalışır.

Sunucu tarafı davranışı `server/tests/test_web_console.py` içinde pinlenmiştir.
