package com.localagents.app.ui.theme

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

/**
 * Tema sistemi. Renk adları (Canvas, Surface, Emerald, …) DEĞİŞMEDİ; artık seçili
 * paletten okunan computed property'ler. Böylece tüm ekranlar tek bir state ile
 * yeniden renklenir — hiçbir composable değiştirmeye gerek yok.
 *
 * Ana tema EmeraldPalette'tir ve değerleri eskisiyle birebir aynıdır (varsayılan).
 * Diğer paletler Nova Agent'ın tema kâşifinden uyarlanmıştır — yalnızca renkler.
 */
data class AppPalette(
    val id: String,
    val label: String,
    val dark: Boolean,
    val canvas: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val night: Color,
    val border: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val muted: Color,
    val accent: Color,
    val accentHi: Color,
    val accentDeep: Color,
    val onAccent: Color,
    val sky: Color,
    val amber: Color,
    val coral: Color,
    val success: Color,
    val violet: Color,
)

// ---- Ana tema (mevcut değerlerle birebir) ----
val EmeraldPalette = AppPalette(
    id = "emerald", label = "Emerald · ana", dark = true,
    canvas = Color(0xFF090B0F), surface = Color(0xFF11151B), surfaceRaised = Color(0xFF161C24),
    night = Color(0xFF0B0E13), border = Color(0xFF2A3540),
    textPrimary = Color(0xFFEDF2F7), textSecondary = Color(0xFF9AA7B5), muted = Color(0xFF6B7785),
    accent = Color(0xFF38D6A3), accentHi = Color(0xFF7CF2CC), accentDeep = Color(0xFF16B98A), onAccent = Color(0xFF06130E),
    sky = Color(0xFF4CB4FF), amber = Color(0xFFF0B429), coral = Color(0xFFF2555A), success = Color(0xFF3FB950), violet = Color(0xFFA78BFA),
)

// ---- Nova: Cyan (koyu) ----
val CyanPalette = AppPalette(
    id = "cyan", label = "Cyan", dark = true,
    canvas = Color(0xFF06070B), surface = Color(0xFF0B0D14), surfaceRaised = Color(0xFF12151E),
    night = Color(0xFF04050A), border = Color(0xFF1C2533),
    textPrimary = Color(0xFFE9EDF6), textSecondary = Color(0xFF8B93A7), muted = Color(0xFF5B6276),
    accent = Color(0xFF38E1D6), accentHi = Color(0xFF7FF3EC), accentDeep = Color(0xFF1FB5AC), onAccent = Color(0xFF04121A),
    sky = Color(0xFF2BA0FF), amber = Color(0xFFF0B429), coral = Color(0xFFFF7A6B), success = Color(0xFF45D6A0), violet = Color(0xFF786EFF),
)

// ---- Nova: Ink (sıcak koyu) ----
val InkPalette = AppPalette(
    id = "ink", label = "Ink", dark = true,
    canvas = Color(0xFF1A1714), surface = Color(0xFF221E1A), surfaceRaised = Color(0xFF2A251F),
    night = Color(0xFF14110E), border = Color(0xFF2E2A24),
    textPrimary = Color(0xFFF2EDE4), textSecondary = Color(0xFF9C9285), muted = Color(0xFF6E655A),
    accent = Color(0xFFE78A5C), accentHi = Color(0xFFF0A074), accentDeep = Color(0xFFC25E32), onAccent = Color(0xFF1A1714),
    sky = Color(0xFF6FA3C9), amber = Color(0xFFD9A441), coral = Color(0xFFE0654A), success = Color(0xFF9CB06A), violet = Color(0xFFB08AB0),
)

// ---- Nova: Terminal (fosfor yeşili, koyu) ----
val TerminalPalette = AppPalette(
    id = "terminal", label = "Terminal", dark = true,
    canvas = Color(0xFF080C08), surface = Color(0xFF0C120C), surfaceRaised = Color(0xFF102110),
    night = Color(0xFF060A06), border = Color(0xFF1A3A22),
    textPrimary = Color(0xFFBFF5C4), textSecondary = Color(0xFF5C8A5C), muted = Color(0xFF4A6B4A),
    accent = Color(0xFF3DF57E), accentHi = Color(0xFF8CFFB0), accentDeep = Color(0xFF1FA858), onAccent = Color(0xFF04140A),
    sky = Color(0xFF45D6F0), amber = Color(0xFFF5B53D), coral = Color(0xFFF5564E), success = Color(0xFF3DF57E), violet = Color(0xFF9D7DF5),
)

// ---- Nova Atlas: Clay (açık) ----
val ClayPalette = AppPalette(
    id = "clay", label = "Clay", dark = false,
    canvas = Color(0xFFF5F1E8), surface = Color(0xFFFCFAF4), surfaceRaised = Color(0xFFF2ECDF),
    night = Color(0xFFEDE7D8), border = Color(0xFFE4DBCA),
    textPrimary = Color(0xFF221E1A), textSecondary = Color(0xFF6E655A), muted = Color(0xFF9C9285),
    accent = Color(0xFFC9402A), accentHi = Color(0xFFE15A3C), accentDeep = Color(0xFFA8331F), onAccent = Color(0xFFFDF8F0),
    sky = Color(0xFF2B6CA0), amber = Color(0xFFB8860B), coral = Color(0xFFBE3A22), success = Color(0xFF4E5C36), violet = Color(0xFF7A3B52),
)

// ---- Nova Atlas: Terracotta (açık) ----
val TerracottaPalette = AppPalette(
    id = "terracotta", label = "Terracotta", dark = false,
    canvas = Color(0xFFF6EFE4), surface = Color(0xFFFDF8EE), surfaceRaised = Color(0xFFF5ECDD),
    night = Color(0xFFEFE6D6), border = Color(0xFFE8DCC8),
    textPrimary = Color(0xFF2A211A), textSecondary = Color(0xFF73655A), muted = Color(0xFF9C8C7E),
    accent = Color(0xFFD2691E), accentHi = Color(0xFFEE8B3D), accentDeep = Color(0xFFB5571A), onAccent = Color(0xFFFFF8EE),
    sky = Color(0xFF2B6CA0), amber = Color(0xFFB5771A), coral = Color(0xFFB5471F), success = Color(0xFF5E6B36), violet = Color(0xFF7A3B52),
)

// ---- Nova Atlas: Olive (açık) ----
val OlivePalette = AppPalette(
    id = "olive", label = "Olive", dark = false,
    canvas = Color(0xFFF2F1E6), surface = Color(0xFFFAFAF1), surfaceRaised = Color(0xFFE6E9D4),
    night = Color(0xFFE2E4CE), border = Color(0xFFDEDFC9),
    textPrimary = Color(0xFF22241A), textSecondary = Color(0xFF666B57), muted = Color(0xFF9AA086),
    accent = Color(0xFF5C6B3F), accentHi = Color(0xFF7C8C54), accentDeep = Color(0xFF4B5832), onAccent = Color(0xFFF7F8EE),
    sky = Color(0xFF3A6B8C), amber = Color(0xFFB8860B), coral = Color(0xFFB5472F), success = Color(0xFF4B5832), violet = Color(0xFF7A3B52),
)

// ---- Nova Atlas: Plum (açık) ----
val PlumPalette = AppPalette(
    id = "plum", label = "Plum", dark = false,
    canvas = Color(0xFFF4EFEC), surface = Color(0xFFFCF7F4), surfaceRaised = Color(0xFFF0DEE5),
    night = Color(0xFFEBDDE2), border = Color(0xFFE6D8DE),
    textPrimary = Color(0xFF241A20), textSecondary = Color(0xFF6E5C66), muted = Color(0xFF9C8A94),
    accent = Color(0xFF7A3B52), accentHi = Color(0xFFA1556F), accentDeep = Color(0xFF622E42), onAccent = Color(0xFFFBF1F5),
    sky = Color(0xFF3A6B8C), amber = Color(0xFFB8860B), coral = Color(0xFFB0334A), success = Color(0xFF5C6B3F), violet = Color(0xFF7A3B52),
)

/** Seçilebilir temalar. İlk öğe ana/varsayılan tema. */
val AppThemes = listOf(
    EmeraldPalette, CyanPalette, InkPalette, TerminalPalette,
    ClayPalette, TerracottaPalette, OlivePalette, PlumPalette,
)

private val paletteState = mutableStateOf(EmeraldPalette)

/** O an seçili palet. */
val CurrentPalette: AppPalette get() = paletteState.value

/** Temayı id ile uygula; bilinmiyorsa ana temaya düşer. */
fun applyTheme(id: String) {
    paletteState.value = AppThemes.firstOrNull { it.id == id } ?: EmeraldPalette
}

// ---- Renk adları (eskisiyle aynı) — seçili paletten okunur ----
val Canvas: Color get() = paletteState.value.canvas
val Surface: Color get() = paletteState.value.surface
val SurfaceRaised: Color get() = paletteState.value.surfaceRaised
val Night: Color get() = paletteState.value.night
val Border: Color get() = paletteState.value.border
val TextPrimary: Color get() = paletteState.value.textPrimary
val TextSecondary: Color get() = paletteState.value.textSecondary
val Muted: Color get() = paletteState.value.muted
val Emerald: Color get() = paletteState.value.accent
val EmeraldHi: Color get() = paletteState.value.accentHi
val EmeraldDeep: Color get() = paletteState.value.accentDeep
val OnAccent: Color get() = paletteState.value.onAccent
val Sky: Color get() = paletteState.value.sky
val Amber: Color get() = paletteState.value.amber
val Coral: Color get() = paletteState.value.coral
val Success: Color get() = paletteState.value.success
val Violet: Color get() = paletteState.value.violet

@Composable
fun LocalAgentsTheme(content: @Composable () -> Unit) {
    val p = paletteState.value
    val scheme = if (p.dark) {
        darkColorScheme(
            primary = p.accent, secondary = p.sky, tertiary = p.amber,
            background = p.canvas, surface = p.surface, surfaceVariant = p.surfaceRaised,
            error = p.coral, onPrimary = p.onAccent, onBackground = p.textPrimary, onSurface = p.textPrimary,
        )
    } else {
        lightColorScheme(
            primary = p.accent, secondary = p.sky, tertiary = p.amber,
            background = p.canvas, surface = p.surface, surfaceVariant = p.surfaceRaised,
            error = p.coral, onPrimary = p.onAccent, onBackground = p.textPrimary, onSurface = p.textPrimary,
        )
    }
    MaterialTheme(colorScheme = scheme, typography = AppTypography) {
        androidx.compose.material3.Surface(
            modifier = Modifier.fillMaxSize(),
            color = p.canvas,
            contentColor = p.textPrimary,
        ) {
            CompositionLocalProvider(
                LocalTextStyle provides LocalTextStyle.current.copy(fontFamily = AppFontFamily),
                content = content,
            )
        }
    }
}
