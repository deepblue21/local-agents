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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
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
import com.localagents.app.ui.theme.Muted
import com.localagents.app.ui.theme.Night
import com.localagents.app.ui.theme.Sky
import com.localagents.app.ui.theme.Success
import com.localagents.app.ui.theme.Surface
import com.localagents.app.ui.theme.SurfaceRaised
import com.localagents.app.ui.theme.TextPrimary
import com.localagents.app.ui.theme.TextSecondary
import com.localagents.app.ui.theme.Violet

// Uygulama kabuğu: kök yönlendirme, üst barlar ve alt navigasyon.
// Ekranlar Screens.kt, paylaşılan bileşenler UiComponents.kt içinde.

@Composable
fun LocalAgentsApp(vm: LocalAgentsViewModel) {
    when (rootDestination(vm.initialized, vm.settings.accessToken, vm.showSetupGuide)) {
        RootDestination.LOADING -> LoadingScreen()
        RootDestination.SETUP -> SetupGuideScreen(vm)
        RootDestination.PAIR -> PairScreen(vm)
        RootDestination.MAIN -> MainShell(vm)
    }
}

internal enum class RootDestination { LOADING, SETUP, PAIR, MAIN }

internal fun rootDestination(
    initialized: Boolean,
    accessToken: String,
    showSetupGuide: Boolean,
): RootDestination = when {
    !initialized -> RootDestination.LOADING
    showSetupGuide -> RootDestination.SETUP
    accessToken.isBlank() -> RootDestination.PAIR
    else -> RootDestination.MAIN
}

@Composable
internal fun LoadingScreen() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BrandMark(50)
            Spacer(Modifier.height(18.dp))
            AgentActivityIndicator(color = Emerald, diameter = 28.dp)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MainShell(vm: LocalAgentsViewModel) {
    val snackbar = remember { SnackbarHostState() }
    vm.error?.let { message ->
        LaunchedEffect(message) {
            snackbar.showSnackbar(message)
            vm.clearError()
        }
    }
    val showNavigation = vm.tab in setOf(MainTab.SESSIONS, MainTab.RUNS, MainTab.SETTINGS)
    Scaffold(
        topBar = {
            when (vm.tab) {
                MainTab.SESSIONS -> SessionsTopBar(vm)
                MainTab.CHAT -> MonitorTopBar(vm)
                MainTab.MODELS -> ModelsTopBar(vm)
                else -> Unit
            }
        },
        bottomBar = { if (showNavigation) BottomNavigation(vm) },
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (vm.reconnectAttempt > 0) ReconnectBanner(vm.reconnectAttempt)
            else if (!vm.online && !vm.loading) OfflineBanner(vm::refreshAll)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (vm.tab) {
                    MainTab.SESSIONS -> SessionsScreen(vm)
                    MainTab.CHAT -> ChatScreen(vm)
                    MainTab.RUNS -> RunsScreen(vm)
                    MainTab.MODELS -> ModelsScreen(vm)
                    MainTab.SETTINGS -> SettingsScreen(vm)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SessionsTopBar(vm: LocalAgentsViewModel) {
    TopAppBar(
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BrandMark(34)
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(stringResource(R.string.app_name), fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(6.dp).clip(CircleShape).background(if (vm.online) Success else Coral))
                        Spacer(Modifier.width(6.dp))
                        Text(
                            stringResource(if (vm.online) R.string.companion_online else R.string.companion_offline),
                            color = TextSecondary,
                            fontSize = 10.sp,
                            fontFamily = AppMonoFamily,
                        )
                    }
                }
            }
        },
        actions = {
            IconButton(onClick = vm::newSession) {
                Icon(Icons.Filled.Add, stringResource(R.string.action_new_chat), tint = Emerald)
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MonitorTopBar(vm: LocalAgentsViewModel) {
    TopAppBar(
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        navigationIcon = {
            IconButton(onClick = { vm.changeTab(MainTab.SESSIONS) }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.a11y_back_sessions), tint = TextSecondary)
            }
        },
        title = {
            Column(Modifier.widthIn(max = 190.dp)) {
                Text(
                    vm.selectedSession?.title ?: stringResource(R.string.action_new_chat),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    vm.activeRun?.let { stringResource(R.string.run_short_label, it.id.take(6)) }
                        ?: stringResource(R.string.session_short_label, vm.selectedSession?.id?.take(6).orEmpty()),
                    color = TextSecondary,
                    fontSize = 10.sp,
                    fontFamily = AppMonoFamily,
                )
            }
        },
        actions = {
            vm.activeRun?.let { StatusChip(it.status) }
            Spacer(Modifier.width(10.dp))
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ModelsTopBar(vm: LocalAgentsViewModel) {
    TopAppBar(
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        navigationIcon = {
            IconButton(onClick = { vm.changeTab(MainTab.CHAT) }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.a11y_back_work), tint = TextSecondary)
            }
        },
        title = {
            Column {
                Text(stringResource(R.string.models_title), fontWeight = FontWeight.Bold, fontSize = 16.sp)
                Text(
                    stringResource(R.string.models_provider_count, vm.models.map { it.provider }.distinct().size),
                    color = TextSecondary,
                    fontSize = 10.sp,
                    fontFamily = AppMonoFamily,
                )
            }
        },
        actions = {
            IconButton(onClick = vm::refreshAll) {
                Icon(Icons.Filled.Refresh, stringResource(R.string.action_refresh), tint = TextSecondary)
            }
        },
    )
}

@Composable
internal fun BottomNavigation(vm: LocalAgentsViewModel) {
    NavigationBar(containerColor = Night, modifier = Modifier.navigationBarsPadding()) {
        NavItem(vm, MainTab.SESSIONS, Icons.Filled.ChatBubbleOutline, stringResource(R.string.nav_sessions))
        NavItem(vm, MainTab.RUNS, Icons.Filled.History, stringResource(R.string.nav_runs))
        NavItem(vm, MainTab.SETTINGS, Icons.Filled.Settings, stringResource(R.string.nav_settings))
    }
}

@Composable
internal fun androidx.compose.foundation.layout.RowScope.NavItem(
    vm: LocalAgentsViewModel,
    tab: MainTab,
    icon: ImageVector,
    label: String,
) {
    NavigationBarItem(
        selected = vm.tab == tab,
        onClick = { vm.changeTab(tab) },
        icon = { Icon(icon, label) },
        label = { Text(label, fontSize = 10.sp) },
    )
}
