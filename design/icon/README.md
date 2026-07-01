# Local_Agents — Uygulama İkonu

Konsept: **Sinyal Düğümü** (design dosyası "05 — UYGULAMA İKONU"'na sadık). Yakın-siyah
zemin üzerinde, eş merkezli sinyal halkaları ve glow'lu emerald (#38D6A3) çekirdek.
"Yerel ajandan canlı sinyal" fikrini taşır; her maskede (squircle/circle) ve 48px'e
kadar okunur.

## Ne teslim edildi

| Katman | Dosya | Not |
|--------|-------|-----|
| Adaptive icon | `android_res/mipmap-anydpi-v26/ic_launcher.xml` + `ic_launcher_round.xml` | API 26+ (minSdk 26 olduğundan tüm cihazlar) |
| Zemin | `android_res/drawable/ic_launcher_background.xml` | Radyal degrade vektör |
| Ön plan | `android_res/drawable/ic_launcher_foreground.xml` | Halkalar + degrade çekirdek vektör |
| Monokrom | `android_res/drawable/ic_launcher_monochrome.xml` | Android 13+ temalı ikon + bildirim |
| Yoğunluk PNG | `android_res/mipmap-*dpi/ic_launcher(.|_round).png` | Yedek (mdpi→xxxhdpi) |
| Play Store | `android_res/ic_launcher-playstore.png` | 512×512 |
| Önizlemeler | `previews/` | showcase, hero, varyantlar |
| Kaynak | `src/gen_master.py`, `src/gen_android.py` | Yeniden üretmek/düzenlemek için |

## Kurulum (3 adım)

1. `android_res/` altındaki `drawable/` ve `mipmap-*` klasörlerini şuraya kopyala:
   `android/app/src/main/res/` (mevcut `values/` ile birleşir).

2. `AndroidManifest.xml` → `<application>` etiketine ekle:

   ```xml
   android:icon="@mipmap/ic_launcher"
   android:roundIcon="@mipmap/ic_launcher_round"
   ```

   (Şu an manifest'te `android:icon` **tanımlı değil** — uygulama varsayılan Android
   ikonunu kullanıyor.)

3. `android\gradlew.bat assembleDebug` ile derle; launcher'da yeni ikon görünür.

## İsteğe bağlı: bildirim ikonu

`ic_launcher_monochrome.xml` beyaz siluet olduğundan bildirim ikonu olarak da
kullanılabilir; istersen `drawable/ic_stat_agent.xml` adıyla kopyalayıp
çalışma tamamlandı/başarısız bildirimlerinde kullan.

## Düzenleme

Renk/oran değişikliği için `src/gen_master.py` (önizleme PNG) ve `src/gen_android.py`
(vektör XML) dosyalarını düzenleyip yeniden çalıştır:

```bash
pip install cairosvg --break-system-packages
python3 src/gen_master.py && python3 src/gen_android.py
```
