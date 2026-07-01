package com.localagents.app.ui

import android.os.Build
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.AltRoute
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Autorenew
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.localagents.app.LocalAgentsViewModel
import com.localagents.app.R
import com.localagents.app.data.AgentRun
import com.localagents.app.data.AgentSession
import com.localagents.app.data.ChatMessage
import com.localagents.app.data.HostStatus
import com.localagents.app.data.MainTab
import com.localagents.app.data.ModelOption
import com.localagents.app.data.ToolActivity
import com.localagents.app.ui.theme.AppMonoFamily
import com.localagents.app.ui.theme.Amber
import com.localagents.app.ui.theme.Border
import com.localagents.app.ui.theme.Coral
import com.localagents.app.ui.theme.Emerald
import com.localagents.app.ui.theme.EmeraldDeep
import com.localagents.app.ui.theme.EmeraldHi
import com.localagents.app.ui.theme.Muted
import com.localagents.app.ui.theme.Night
import com.localagents.app.ui.theme.Sky
import com.localagents.app.ui.theme.Success
import com.localagents.app.ui.theme.Surface
import com.localagents.app.ui.theme.SurfaceRaised
import com.localagents.app.ui.theme.TextPrimary
import com.localagents.app.ui.theme.TextSecondary
import com.localagents.app.ui.theme.Violet
import java.time.Duration
import java.time.Instant
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

// Paylaşılan bileşenler: marka işareti, iskelet-yükleme, etiketler, durum şeritleri/çipleri.

@Composable
internal fun BrandMark(size: Int) {
    Box(
        Modifier
            .size(size.dp)
            .clip(RoundedCornerShape((size / 4).dp))
            .background(Night)
            .border(1.dp, Border, RoundedCornerShape((size / 4).dp)),
        contentAlignment = Alignment.Center,
    ) {
        // Signal Node — design dosyası "05 — UYGULAMA İKONU" ile aynı işaret.
        Canvas(Modifier.size((size * 0.66f).dp)) {
            val r = this.size.minDimension / 2f
            val c = center
            // genişleyen sinyal halkaları
            drawCircle(Emerald, radius = r * 0.92f, center = c, style = Stroke(width = r * 0.05f), alpha = 0.16f)
            drawCircle(Emerald, radius = r * 0.68f, center = c, style = Stroke(width = r * 0.06f), alpha = 0.34f)
            drawCircle(Emerald, radius = r * 0.45f, center = c, style = Stroke(width = r * 0.08f), alpha = 0.58f)
            // çekirdek arkası yumuşak glow
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Emerald.copy(alpha = 0.5f), Color.Transparent),
                    center = c,
                    radius = r * 0.5f,
                ),
                radius = r * 0.5f,
                center = c,
            )
            // glow'lu çekirdek
            val coreR = r * 0.22f
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(EmeraldHi, Emerald, EmeraldDeep),
                    center = Offset(c.x - coreR * 0.3f, c.y - coreR * 0.35f),
                    radius = coreR * 1.35f,
                ),
                radius = coreR,
                center = c,
            )
            // speküler vurgu
            drawCircle(
                Color(0xFFEAFFF7),
                radius = coreR * 0.34f,
                center = Offset(c.x - coreR * 0.32f, c.y - coreR * 0.4f),
                alpha = 0.6f,
            )
        }
    }
}

@Composable
private fun rememberShimmerBrush(): Brush {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(1100), repeatMode = RepeatMode.Restart),
        label = "shimmerProgress",
    )
    return Brush.linearGradient(
        colors = listOf(SurfaceRaised, Border, SurfaceRaised),
        start = Offset(progress * 700f - 350f, 0f),
        end = Offset(progress * 700f, 0f),
    )
}

@Composable
private fun SkeletonBox(widthFraction: Float, height: Int, brush: Brush) {
    Box(
        Modifier
            .fillMaxWidth(widthFraction)
            .height(height.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(brush),
    )
}

@Composable
internal fun ListSkeleton(rows: Int, card: Boolean) {
    val brush = rememberShimmerBrush()
    Column(verticalArrangement = Arrangement.spacedBy(if (card) 9.dp else 0.dp)) {
        repeat(rows) {
            if (card) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(11.dp))
                        .background(Surface)
                        .border(1.dp, Border, RoundedCornerShape(11.dp))
                        .padding(13.dp),
                    verticalArrangement = Arrangement.spacedBy(9.dp),
                ) {
                    SkeletonBox(0.4f, 12, brush)
                    SkeletonBox(0.9f, 12, brush)
                    SkeletonBox(0.5f, 10, brush)
                }
            } else {
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    SkeletonBox(0.6f, 14, brush)
                    SkeletonBox(0.35f, 10, brush)
                }
                HorizontalDivider(color = Surface)
            }
        }
    }
}

@Composable
internal fun AgentActivityIndicator(
    modifier: Modifier = Modifier,
    color: Color = Emerald,
    diameter: Dp = 24.dp,
) {
    val activityDescription = stringResource(R.string.a11y_agent_activity)
    val transition = rememberInfiniteTransition(label = "agentActivity")
    val pulse by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(1250), repeatMode = RepeatMode.Restart),
        label = "agentPulse",
    )
    val sweep by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(1550), repeatMode = RepeatMode.Restart),
        label = "agentSweep",
    )
    val breathe by transition.animateFloat(
        initialValue = 0.78f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(680), repeatMode = RepeatMode.Reverse),
        label = "agentBreathe",
    )
    Canvas(
        modifier
            .size(diameter)
            .semantics { contentDescription = activityDescription },
    ) {
        val radius = size.minDimension / 2f
        val c = center
        val stroke = max(1f, radius * 0.08f)
        val pulseRadius = radius * (0.42f + pulse * 0.5f)
        val pulseAlpha = (1f - pulse) * 0.34f

        drawCircle(color, radius = pulseRadius, center = c, style = Stroke(width = stroke), alpha = pulseAlpha)
        drawCircle(color, radius = radius * 0.72f, center = c, style = Stroke(width = stroke * 0.72f), alpha = 0.18f)

        repeat(3) { index ->
            val phase = (sweep + index / 3f) % 1f
            val angle = phase * 2f * PI.toFloat()
            val node = Offset(
                x = c.x + cos(angle) * radius * 0.62f,
                y = c.y + sin(angle) * radius * 0.62f,
            )
            drawCircle(color, radius = radius * (0.055f + phase * 0.035f), center = node, alpha = 0.2f + phase * 0.5f)
        }

        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(color.copy(alpha = 0.42f), Color.Transparent),
                center = c,
                radius = radius * 0.48f,
            ),
            radius = radius * 0.48f,
            center = c,
        )
        drawCircle(color, radius = radius * (0.18f + 0.05f * breathe), center = c, alpha = 0.95f)
        drawCircle(Color.White, radius = radius * 0.055f, center = Offset(c.x - radius * 0.08f, c.y - radius * 0.1f), alpha = 0.58f)
    }
}

@Composable
internal fun AgentActivityRow(
    label: String,
    modifier: Modifier = Modifier,
    color: Color = Emerald,
    indicatorSize: Dp = 22.dp,
) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        AgentActivityIndicator(color = color, diameter = indicatorSize)
        Spacer(Modifier.width(9.dp))
        Text(label, color = TextSecondary, fontSize = 11.sp, fontFamily = AppMonoFamily)
    }
}

@Composable
internal fun FieldLabel(value: String) {
    Text(value, color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = AppMonoFamily)
}

@Composable
internal fun SectionDivider(label: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        HorizontalDivider(Modifier.weight(1f), color = Border)
        Text(label, color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily)
        HorizontalDivider(Modifier.weight(1f), color = Border)
    }
}

@Composable
internal fun OfflineBanner(onRetry: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Coral.copy(alpha = 0.09f)).border(1.dp, Coral.copy(alpha = 0.25f)).padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.WifiOff, null, tint = Coral, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(9.dp))
        Text(stringResource(R.string.offline_banner), color = TextPrimary, fontSize = 11.sp, modifier = Modifier.weight(1f))
        TextButton(onClick = onRetry) { Text(stringResource(R.string.action_refresh), color = Coral, fontSize = 11.sp) }
    }
}

@Composable
internal fun ReconnectBanner(attempt: Int) {
    Row(
        Modifier.fillMaxWidth().background(Amber.copy(alpha = 0.09f)).border(1.dp, Amber.copy(alpha = 0.25f)).padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AgentActivityIndicator(color = Amber, diameter = 16.dp)
        Spacer(Modifier.width(9.dp))
        Text(stringResource(R.string.reconnect_banner, attempt), color = TextPrimary, fontSize = 11.sp, modifier = Modifier.weight(1f))
    }
}

@Composable
internal fun StatusChip(status: String) {
    val color = statusColor(status)
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.1f)).border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(5.dp))
        Text(statusLabel(status), color = color, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = AppMonoFamily)
    }
}

internal fun statusColor(status: String): Color = when (status) {
    "running" -> Emerald
    "paused" -> Amber
    "completed" -> Success
    "failed" -> Coral
    "queued", "cancelled" -> Muted
    else -> TextSecondary
}

internal fun statusLabel(status: String): String = when (status) {
    "queued" -> "sırada"
    "running" -> "çalışıyor"
    "paused" -> "duraklatıldı"
    "completed" -> "tamamlandı"
    "failed" -> "başarısız"
    "cancelled" -> "iptal edildi"
    else -> status
}

internal fun relativeTime(value: String): String {
    if (value.isBlank()) return "şimdi"
    return runCatching {
        val elapsed = Duration.between(Instant.parse(value), Instant.now())
        when {
            elapsed.seconds < 60 -> "şimdi"
            elapsed.toMinutes() < 60 -> "${elapsed.toMinutes()} dk önce"
            elapsed.toHours() < 24 -> "${elapsed.toHours()} sa önce"
            else -> "${elapsed.toDays()} gün önce"
        }
    }.getOrElse { value.take(10) }
}
