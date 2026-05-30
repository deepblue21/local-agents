# Desktop wrapper (PyWebView)

Web uygulamasını masaüstünde native pencere olarak çalıştıran ince bir shell.
FastAPI backend'i aynı Python process'i içinde arka planda başlatır; pencereyi
WebView2 (Windows) / WebKitGTK (Linux) ile açar; sistem tray simgesi ekler;
auto-start ayarını yönetir.

## Dosyalar

| Dosya                       | Görev                                                        |
|-----------------------------|--------------------------------------------------------------|
| `launcher.py`               | Giriş noktası — backend + tray + webview pencere lifecycle.  |
| `backend_runner.py`         | FastAPI'yi daemon thread'de çalıştırır, port çakışmasını çözer.|
| `tray.py`                   | pystray ikonu — Show / Quit / Start-on-boot.                 |
| `autostart.py`              | Windows registry + Linux `~/.config/autostart/*.desktop`.     |
| `local-ai-dashboard.spec`   | PyInstaller spec.                                            |
| `build.py`                  | `python desktop/build.py` ile tek komutluk build.            |
| `requirements.txt`          | Sadece desktop tarafındaki ekstra paketler.                   |

## Geliştirme modu

```bash
cd local-ai-dashboard

# Bağımlılıklar
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
pip install -r desktop/requirements.txt

# Backend için .env (Anthropic anahtarı vb.)
cp backend/.env.example backend/.env

# Çalıştır
python -m desktop.launcher
```

İlk açılışta yan servisler (Ollama, Qdrant) localhost'ta yoksa, ilgili
ekranlar mock fallback'le çalışır — backend yine ayağa kalkar, sadece
o özellikler gri görünür.

## Windows build

```powershell
# Geliştirme makinesinde
python desktop\build.py
# → dist\local-ai-dashboard\local-ai-dashboard.exe
```

WebView2 runtime kullanıcının makinesinde olmayabilir (Windows 11'de var,
10'da değil). İki seçenek:

1. **Bootstrapper paketle:** Microsoft'un `MicrosoftEdgeWebview2Setup.exe`
   ücretsiz redistributable dosyasını installer'a koyun ve eksikse çalıştırın.
2. **Installer kullan:** [Inno Setup](https://jrsoftware.org/isinfo.php) ile
   `dist/local-ai-dashboard/` klasörünü tek bir `.exe` installer'a sarın.
   Örnek `setup.iss`:

```iss
[Setup]
AppName=Local AI Dashboard
AppVersion=0.1.0
DefaultDirName={autopf}\LocalAIDashboard
DefaultGroupName=Local AI Dashboard
OutputDir=installers
OutputBaseFilename=local-ai-dashboard-setup
Compression=lzma2
SolidCompression=yes

[Files]
Source: "..\dist\local-ai-dashboard\*"; DestDir: "{app}"; Flags: recursesubdirs

[Icons]
Name: "{group}\Local AI Dashboard"; Filename: "{app}\local-ai-dashboard.exe"
Name: "{commondesktop}\Local AI Dashboard"; Filename: "{app}\local-ai-dashboard.exe"

[Run]
Filename: "{app}\local-ai-dashboard.exe"; Description: "Launch now"; Flags: nowait postinstall skipifsilent
```

## Linux build

```bash
# Hedef Linux makinesinde (cross-build önerilmez)
python desktop/build.py
# → dist/local-ai-dashboard/local-ai-dashboard
```

`.AppImage` çıkarmak için `appimagetool` kullanın ya da `.deb` paketleyin
(`fpm -s dir -t deb -n local-ai-dashboard --version 0.1.0 dist/local-ai-dashboard/=/opt/local-ai-dashboard`).

## Pencere kapatma davranışı

Pencerenin **[X]** düğmesi uygulamayı kapatmaz — sadece pencereyi gizler;
tray simgesi açık kalır. Tamamen kapatmak için tray'den **Quit**. Bu
davranış Linux ve Windows'ta tutarlı.

## Auto-start

Tray menüsündeki **Start on boot** seçeneği:

- Windows'ta `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` altına
  `LocalAIDashboard` değeri ekler/siler.
- Linux'ta `~/.config/autostart/LocalAIDashboard.desktop` dosyasını
  oluşturur/siler.

Kullanıcı tercihiyle çalışır; sistem genelinde değişiklik yapmaz.

## Yeni görseller geldiğinde

`frontend/index.html` ve `frontend/src/*.jsx` dosyalarını değiştirmek
yeterli. Shell'in (PyWebView penceresi, tray, auto-start) tek bildiği şey
"`http://127.0.0.1:7878`'i pencerede aç" — frontend ne kadar değişirse
değişsin masaüstü tarafı aynen çalışır.

## Yapılmadı, sonra eklenebilir

- **Auto-updater** — Bir GitHub Release'den manifest okuyup `dist/` üstünde
  swap eden imzalı update.
- **Crash reporter** — Sentry / kendi log gönderimi.
- **Code signing** — Windows için EV cert, Linux için GPG ile `.deb` imzası.
- **macOS desteği** — `pywebview` macOS'ta çalışır ama notarization adımı
  ekstra iş; talep olunca eklenir.
