# Tipografi — Inter + JetBrains Mono

Tasarım fontları: **Inter** (arayüz) + **JetBrains Mono** (mono / araç akışı / etiketler).

## Şu anki durum

Tipografi `android/app/src/main/java/com/localagents/app/ui/theme/Type.kt` içinde
merkezîleştirildi (`AppFontFamily`, `AppMonoFamily`, `AppTypography`) ve `LocalAgentsTheme`
bunları uygular. Ekranlardaki mono metinler `AppMonoFamily` üzerinden geçer.

**Durum (Haziran 2026): tamamlandı.** Gerçek fontlar `res/font/` içinde paketlendi ve
`Type.kt`'te bağlandı; sistem fontuna **düşülmüyor**:
`inter_regular/medium/semibold/bold.ttf` (Inter, OFL) ve
`jetbrains_mono_regular/medium.ttf` (JetBrains Mono, OFL). Inter yukarı akışta CFF/`.otf`
olarak dağıtıldığından, TrueType uyumu için `cu2qu` ile `.ttf`'e çevrildi (Google Fonts'un
da kullandığı yöntem); altı dosyanın da Türkçe gliflerini (ç ğ ı İ ö ş ü) içerdiği
`fontTools` ile doğrulandı.

Aşağıdaki adımlar fontları sıfırdan yeniden üretmek/değiştirmek isteyenler için referanstır.

## Seçenek A — Paketli .ttf (önerilen, %100 güvenilir)

1. Fontları indir:
   - Inter: https://fonts.google.com/specimen/Inter (Regular, Medium, SemiBold, Bold)
   - JetBrains Mono: https://www.jetbrains.com/lp/mono/ veya https://fonts.google.com/specimen/JetBrains+Mono (Regular, Medium)
2. `.ttf` dosyalarını şu adlarla `android/app/src/main/res/font/` içine koy (küçük harf, alt çizgi):
   `inter_regular.ttf, inter_medium.ttf, inter_semibold.ttf, inter_bold.ttf,
   jetbrains_mono_regular.ttf, jetbrains_mono_medium.ttf`
3. `Type.kt`'te iki satırı değiştir:
   ```kotlin
   import androidx.compose.ui.text.font.Font
   import androidx.compose.ui.text.font.FontWeight
   import com.localagents.app.R

   val AppFontFamily = FontFamily(
       Font(R.font.inter_regular, FontWeight.Normal),
       Font(R.font.inter_medium, FontWeight.Medium),
       Font(R.font.inter_semibold, FontWeight.SemiBold),
       Font(R.font.inter_bold, FontWeight.Bold),
   )
   val AppMonoFamily = FontFamily(
       Font(R.font.jetbrains_mono_regular, FontWeight.Normal),
       Font(R.font.jetbrains_mono_medium, FontWeight.Medium),
   )
   ```
4. UI dosyaları zaten `AppMonoFamily` kullanır; font dosyalarını ekleyip `Type.kt`
   içindeki aileleri bağlamak yeterlidir.

## Seçenek B — Downloadable Fonts (Google Fonts sağlayıcısı)

1. `app/build.gradle.kts`'e ekle: `implementation("androidx.compose.ui:ui-text-google-fonts")`
2. Sertifikaları **elle yazma**: Android Studio'da `res > New > Font Resource File` ile bir
   "downloadable font" ekle; AS, doğru `res/values/font_certs.xml`'i otomatik üretir.
3. `Type.kt`'te `GoogleFont.Provider` + `GoogleFont("Inter")` / `GoogleFont("JetBrains Mono")`
   ile aileleri tanımla. Not: indirme başarısız olursa sistem fontuna düşer; mono metinde
   bu sans'a düşeceğinden, konsol hizası için Seçenek A (paketli) daha güvenli.

Dosyaları eklersen söyle — `Type.kt`'i ben de bağlayabilirim.
