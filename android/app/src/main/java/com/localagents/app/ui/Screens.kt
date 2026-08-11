package com.localagents.app.ui

import android.content.Context
import android.os.Build
import androidx.annotation.StringRes
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
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
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
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.platform.LocalContext
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
import com.localagents.app.data.HostProbe
import com.localagents.app.data.HostStatus
import com.localagents.app.data.MainTab
import com.localagents.app.data.ModelOption
import com.localagents.app.data.SessionContext
import com.localagents.app.data.ToolActivity
import com.localagents.app.data.WebSource
import com.localagents.app.ui.theme.Amber
import com.localagents.app.ui.theme.AppMonoFamily
import com.localagents.app.ui.theme.AppPalette
import com.localagents.app.ui.theme.AppThemes
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

// Ekranlar: Eşleştirme · Oturumlar · Çalışma Monitörü · Çalışmalar · Modeller · Ayarlar.

private val ActiveStatuses = setOf("queued", "running", "paused")

@Composable
internal fun SetupGuideScreen(vm: LocalAgentsViewModel) {
    val alreadyPaired = vm.settings.accessToken.isNotBlank()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 22.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BrandMark(46)
            Spacer(Modifier.width(12.dp))
            Column {
                FieldLabel(stringResource(R.string.setup_badge))
                Text(stringResource(R.string.app_name), fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(24.dp))
        Text(stringResource(R.string.setup_title), fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(7.dp))
        Text(
            stringResource(R.string.setup_body),
            color = TextSecondary,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        Spacer(Modifier.height(22.dp))
        SetupStep(
            number = "1",
            title = stringResource(R.string.setup_step_pc_title),
            detail = stringResource(R.string.setup_step_pc_detail),
        )
        SetupStep(
            number = "2",
            title = stringResource(R.string.setup_step_pair_title),
            detail = stringResource(R.string.setup_step_pair_detail),
        )
        SetupStep(
            number = "3",
            title = stringResource(R.string.setup_step_model_title),
            detail = stringResource(R.string.setup_step_model_detail),
            last = true,
        )
        Spacer(Modifier.height(18.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(11.dp))
                .background(Emerald.copy(alpha = 0.07f))
                .border(1.dp, Emerald.copy(alpha = 0.25f), RoundedCornerShape(11.dp))
                .padding(14.dp),
        ) {
            Text(stringResource(R.string.security_boundary_title), color = Emerald, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = AppMonoFamily)
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.security_boundary_body),
                color = TextSecondary,
                fontSize = 12.sp,
                lineHeight = 17.sp,
            )
        }
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = vm::finishSetupGuide,
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(11.dp),
        ) {
            Text(
                stringResource(if (alreadyPaired) R.string.action_back_console else R.string.action_go_pair),
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
            )
        }
        Text(
            stringResource(R.string.setup_reopen_hint),
            color = Muted,
            fontSize = 10.sp,
            lineHeight = 15.sp,
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}

@Composable
private fun SetupStep(number: String, title: String, detail: String, last: Boolean = false) {
    Row(Modifier.fillMaxWidth()) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(30.dp).clip(CircleShape).background(Emerald.copy(alpha = 0.12f)).border(1.dp, Emerald.copy(alpha = 0.35f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(number, color = Emerald, fontWeight = FontWeight.Bold, fontFamily = AppMonoFamily, fontSize = 12.sp)
            }
            if (!last) Box(Modifier.width(1.dp).height(54.dp).background(Border))
        }
        Spacer(Modifier.width(13.dp))
        Column(Modifier.padding(top = 3.dp, bottom = if (last) 0.dp else 15.dp)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text(detail, color = TextSecondary, fontSize = 12.sp, lineHeight = 17.sp)
        }
    }
}

@Composable
internal fun PairScreen(vm: LocalAgentsViewModel) {
    val deviceName = remember { Build.MODEL.ifBlank { "Android" } }
    var qrHintVisible by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 26.dp),
    ) {
        BrandMark(62)
        Spacer(Modifier.height(20.dp))
        Text(stringResource(R.string.pair_title), fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(
            stringResource(R.string.pair_subtitle),
            color = TextSecondary,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        Spacer(Modifier.height(22.dp))
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(Night)
                .border(1.dp, Border, RoundedCornerShape(14.dp))
                .clickable { qrHintVisible = !qrHintVisible }
                .padding(vertical = 24.dp, horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(Icons.Filled.QrCodeScanner, null, tint = Emerald, modifier = Modifier.size(36.dp))
            Spacer(Modifier.height(9.dp))
            Text(stringResource(R.string.pair_qr_title), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(4.dp))
            Text(stringResource(R.string.pair_qr_hint), color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily)
            if (qrHintVisible) {
                Spacer(Modifier.height(12.dp))
                Text(
                    stringResource(R.string.pair_qr_expanded),
                    color = TextSecondary,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                )
            }
        }
        SectionDivider(stringResource(R.string.pair_or_manual))
        FieldLabel(stringResource(R.string.label_server_address))
        OutlinedTextField(
            value = vm.pairUrl,
            onValueChange = vm::updatePairUrl,
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            singleLine = true,
            placeholder = { Text(stringResource(R.string.pair_url_placeholder)) },
            shape = RoundedCornerShape(9.dp),
            textStyle = androidx.compose.ui.text.TextStyle(fontFamily = AppMonoFamily, fontSize = 13.sp),
        )
        Spacer(Modifier.height(12.dp))
        FieldLabel(stringResource(R.string.label_pairing_code))
        OutlinedTextField(
            value = vm.pairCode,
            onValueChange = vm::updatePairCode,
            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
            singleLine = true,
            placeholder = { Text(stringResource(R.string.pair_code_placeholder)) },
            shape = RoundedCornerShape(9.dp),
            textStyle = androidx.compose.ui.text.TextStyle(fontFamily = AppMonoFamily, fontSize = 14.sp, letterSpacing = 2.sp),
        )
        PairHostPreview(vm.pairUrl, vm.hostStatus, vm.hostProbe)
        vm.pendingPairConfirmation?.let { confirmation ->
            PairLinkConfirmationPanel(
                url = confirmation.url,
                codePreview = confirmation.codePreview,
                onConfirm = vm::confirmPairLink,
                onReject = vm::rejectPairLink,
            )
        }
        vm.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = Coral, fontSize = 13.sp)
        }
        Spacer(Modifier.height(18.dp))
        Button(
            onClick = { vm.pair(deviceName) },
            modifier = Modifier.fillMaxWidth().height(50.dp),
            enabled = !vm.pairing &&
                vm.pendingPairConfirmation == null &&
                vm.pairUrl.isNotBlank() &&
                vm.pairCode.isNotBlank(),
            shape = RoundedCornerShape(11.dp),
        ) {
            if (vm.pairing) AgentActivityIndicator(color = MaterialTheme.colorScheme.onPrimary, diameter = 22.dp)
            else Text(stringResource(R.string.action_pair), fontWeight = FontWeight.Bold, fontSize = 15.sp)
        }
        TextButton(onClick = vm::openSetupGuide, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.action_open_setup), color = TextSecondary, fontSize = 12.sp)
        }
    }
}

@Composable
private fun PairLinkConfirmationPanel(
    url: String,
    codePreview: String,
    onConfirm: () -> Unit,
    onReject: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(top = 12.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Amber.copy(alpha = 0.08f))
            .border(1.dp, Amber.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
            .padding(12.dp),
    ) {
        Text(
            stringResource(R.string.pair_link_confirm_title),
            color = Amber,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = AppMonoFamily,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            stringResource(R.string.pair_link_confirm_body),
            color = TextSecondary,
            fontSize = 12.sp,
            lineHeight = 17.sp,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            url.removePrefix("https://").removePrefix("http://"),
            color = TextPrimary,
            fontSize = 11.sp,
            fontFamily = AppMonoFamily,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (codePreview.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(codePreview, color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = onReject,
                modifier = Modifier.weight(1f).height(38.dp),
                shape = RoundedCornerShape(9.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = TextSecondary),
                contentPadding = PaddingValues(horizontal = 8.dp),
            ) { Text(stringResource(R.string.action_reject_pair_link), fontSize = 12.sp) }
            Button(
                onClick = onConfirm,
                modifier = Modifier.weight(1f).height(38.dp),
                shape = RoundedCornerShape(9.dp),
                contentPadding = PaddingValues(horizontal = 8.dp),
            ) { Text(stringResource(R.string.action_confirm_pair_link), fontSize = 12.sp) }
        }
    }
}

@Composable
private fun PairHostPreview(url: String, status: HostStatus, probe: HostProbe) {
    val dotColor = when (status) {
        HostStatus.ONLINE -> Success
        HostStatus.OFFLINE -> Coral
        HostStatus.CHECKING -> Amber
        HostStatus.UNKNOWN -> Muted
    }
    val label = when (status) {
        HostStatus.ONLINE -> hostProbeLabel(probe)
        HostStatus.OFFLINE -> stringResource(R.string.host_offline)
        HostStatus.CHECKING -> stringResource(R.string.host_checking)
        HostStatus.UNKNOWN -> stringResource(R.string.host_unknown)
    }
    Row(
        Modifier
            .fillMaxWidth()
            .padding(top = 14.dp)
            .clip(RoundedCornerShape(9.dp))
            .background(Surface)
            .border(1.dp, Border, RoundedCornerShape(9.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Computer, null, tint = if (status == HostStatus.ONLINE) Emerald else TextSecondary, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Text(
                url.removePrefix("https://").removePrefix("http://")
                    .ifBlank { stringResource(R.string.host_companion_fallback) },
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(label, color = dotColor, fontSize = 10.sp, fontFamily = AppMonoFamily)
        }
        if (status == HostStatus.CHECKING) {
            AgentActivityIndicator(color = Amber, diameter = 16.dp)
        } else {
            Box(Modifier.size(7.dp).clip(CircleShape).background(dotColor))
        }
    }
}

@Composable
private fun hostProbeLabel(probe: HostProbe): String = when {
    probe.defaultModelReady && probe.webEnabled -> stringResource(R.string.host_default_model_web, probe.defaultModel)
    probe.defaultModelReady -> stringResource(R.string.host_default_model_ready, probe.defaultModel)
    probe.ollamaOnline && probe.defaultModel.isNotBlank() -> stringResource(R.string.host_ollama_waiting, probe.defaultModel)
    probe.ollamaOnline -> stringResource(R.string.host_ollama_online)
    else -> stringResource(R.string.host_companion_waiting)
}

@Composable
internal fun SessionsScreen(vm: LocalAgentsViewModel) {
    var renameTarget by remember { mutableStateOf<AgentSession?>(null) }
    var deleteTarget by remember { mutableStateOf<AgentSession?>(null) }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(vertical = 14.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.Bottom) {
                Text(stringResource(R.string.sessions_title), fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text(stringResource(R.string.sessions_count, vm.sessions.size), color = Muted, fontSize = 11.sp, fontFamily = AppMonoFamily)
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(Surface)
                    .border(1.dp, Border, RoundedCornerShape(9.dp))
                    .clickable(onClick = vm::newSession)
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Add, null, tint = Emerald, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.action_new_chat), fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }
        if (vm.sessions.isEmpty()) {
            item {
                if (vm.loading) {
                    ListSkeleton(rows = 6, card = false)
                } else {
                    Column(Modifier.fillMaxWidth().padding(36.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Filled.ChatBubbleOutline, null, tint = Muted, modifier = Modifier.size(34.dp))
                        Spacer(Modifier.height(12.dp))
                        Text(stringResource(R.string.empty_sessions_title), fontWeight = FontWeight.SemiBold)
                        Text(stringResource(R.string.empty_sessions_body), color = TextSecondary, fontSize = 12.sp)
                    }
                }
            }
        }
        items(vm.sessions, key = { it.id }) { session ->
            val latestRun = vm.runs.firstOrNull { it.sessionId == session.id }
            SessionRow(
                session = session,
                run = latestRun,
                onClick = { vm.openSession(session) },
                onRename = { renameTarget = session },
                onDelete = { deleteTarget = session },
            )
        }
    }

    renameTarget?.let { target ->
        SessionRenameDialog(
            session = target,
            onDismiss = { renameTarget = null },
            onConfirm = { title ->
                vm.renameSession(target, title)
                renameTarget = null
            },
        )
    }

    deleteTarget?.let { target ->
        SessionDeleteDialog(
            session = target,
            onDismiss = { deleteTarget = null },
            onConfirm = {
                vm.deleteSession(target)
                deleteTarget = null
            },
        )
    }
}

@Composable
private fun SessionRenameDialog(
    session: AgentSession,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var title by remember(session.id) { mutableStateOf(session.title) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.session_rename_title)) },
        text = {
            OutlinedTextField(
                value = title,
                onValueChange = { if (it.length <= LocalAgentsViewModel.MAX_SESSION_TITLE) title = it },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(title) }, enabled = title.isNotBlank()) {
                Text(stringResource(R.string.action_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
        },
        containerColor = Surface,
    )
}

@Composable
private fun SessionDeleteDialog(
    session: AgentSession,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.session_delete_title)) },
        text = { Text(stringResource(R.string.session_delete_body, session.title), color = TextSecondary) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.action_delete), color = Coral)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
        },
        containerColor = Surface,
    )
}

@Composable
private fun SessionRow(
    session: AgentSession,
    run: AgentRun?,
    onClick: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    val toolSummary = if (session.toolCount > 0) stringResource(R.string.tool_count, session.toolCount) else null
    Column(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(start = 16.dp, end = 6.dp, top = 13.dp, bottom = 13.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(session.title, fontSize = 14.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            run?.let { StatusChip(it.status) }
            IconButton(onClick = onRename, modifier = Modifier.size(34.dp)) {
                Icon(
                    Icons.Filled.Edit,
                    stringResource(R.string.session_rename_title),
                    tint = Muted,
                    modifier = Modifier.size(17.dp),
                )
            }
            IconButton(onClick = onDelete, modifier = Modifier.size(34.dp)) {
                Icon(
                    Icons.Filled.DeleteOutline,
                    stringResource(R.string.session_delete_title),
                    tint = Muted,
                    modifier = Modifier.size(17.dp),
                )
            }
        }
        Text(
            listOfNotNull(relativeTime(session.updatedAt), run?.model, run?.provider, toolSummary).joinToString(" · "),
            color = Muted,
            fontSize = 10.sp,
            fontFamily = AppMonoFamily,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
    HorizontalDivider(color = Surface)
}

@Composable
internal fun ChatScreen(vm: LocalAgentsViewModel) {
    var composer by remember { mutableStateOf("") }
    var steerOpen by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val busy = vm.activeRun?.status in ActiveStatuses
    LaunchedEffect(vm.messages.size, vm.tools.size) {
        val total = vm.messages.size + if (vm.tools.isEmpty()) 0 else 1
        if (total > 0) listState.animateScrollToItem(total - 1)
    }
    Column(Modifier.fillMaxSize()) {
        if (vm.messages.isEmpty() && vm.tools.isEmpty()) {
            EmptyChat(Modifier.weight(1f))
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(13.dp),
            ) {
                if (vm.sessionContext.messageCount > 0 || vm.sessionContext.hasSummary) {
                    item {
                        ContextPanel(
                            context = vm.sessionContext,
                            busy = busy,
                            compressing = vm.compressingContext,
                            onCompress = vm::compressContext,
                        )
                    }
                }
                items(vm.messages, key = { it.id }) { MessageRow(it, vm.selectedModel?.name) }
                if (vm.tools.isNotEmpty()) item { ToolTimeline(vm.tools) }
                if (vm.sources.isNotEmpty()) item { SourceTimeline(vm.sources) }
                if (vm.activeRun?.status == "running" && vm.messages.none { it.role == "assistant" && it.streaming }) {
                    item { WorkingStatus() }
                }
            }
        }
        vm.activeRun?.takeIf { it.status in ActiveStatuses }?.let { run ->
            if (steerOpen) {
                SteerComposer(
                    onClose = { steerOpen = false },
                    onSend = { vm.runCommand("steer", it); steerOpen = false },
                )
            }
            ActiveControls(
                run = run,
                onPause = { vm.runCommand(if (run.status == "paused") "resume" else "pause") },
                onSteer = { steerOpen = !steerOpen },
                onCancel = { vm.runCommand("cancel") },
            )
        }
        Composer(
            value = composer,
            onValueChange = { composer = it },
            model = vm.selectedModel,
            busy = busy,
            onModelClick = { vm.changeTab(MainTab.MODELS) },
            onSend = {
                val value = composer
                composer = ""
                vm.send(value)
            },
        )
    }
}

@Composable
internal fun ContextPanel(
    context: SessionContext,
    busy: Boolean,
    compressing: Boolean,
    onCompress: () -> Unit,
) {
    val strings = LocalContext.current.uiStrings()
    val barColor = when {
        context.usagePercent >= 95 -> Coral
        context.usagePercent >= 80 -> Amber
        else -> Emerald
    }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(11.dp))
            .background(Night)
            .border(1.dp, Border, RoundedCornerShape(11.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                FieldLabel(stringResource(R.string.context_label))
                Spacer(Modifier.height(3.dp))
                Text(contextUsageLabel(strings, context), color = barColor, fontSize = 12.sp, fontFamily = AppMonoFamily)
            }
            OutlinedButton(
                onClick = onCompress,
                enabled = context.canCompress && !busy && !compressing,
                modifier = Modifier.height(36.dp),
                shape = RoundedCornerShape(9.dp),
                contentPadding = PaddingValues(horizontal = 10.dp),
            ) {
                if (compressing) {
                    AgentActivityIndicator(color = Emerald, diameter = 16.dp)
                } else {
                    Icon(Icons.Filled.Autorenew, null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(5.dp))
                    Text(stringResource(R.string.action_compress_context), fontSize = 11.sp)
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(50)).background(SurfaceRaised)) {
            Box(
                Modifier
                    .fillMaxWidth(context.usageRatio.toFloat().coerceIn(0f, 1f))
                    .height(5.dp)
                    .clip(RoundedCornerShape(50))
                    .background(barColor),
            )
        }
        Text(contextMemoryLabel(strings, context), color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily)
    }
}

internal fun interface UiStringResolver {
    fun get(@StringRes id: Int, vararg args: Any): String
}

internal fun Context.uiStrings(): UiStringResolver =
    UiStringResolver { id, args -> getString(id, *args) }

internal fun contextUsageLabel(strings: UiStringResolver, context: SessionContext): String =
    strings.get(
        R.string.context_usage_format,
        compactNumber(context.tokenEstimate),
        compactNumber(context.maxTokens),
        context.usagePercent,
    )

internal fun contextMemoryLabel(strings: UiStringResolver, context: SessionContext): String {
    val base = strings.get(R.string.context_message_count, context.messageCount)
    return if (context.hasSummary) {
        strings.get(R.string.context_summary_active, context.summarizedMessageCount, base)
    } else {
        strings.get(R.string.context_raw_history, base)
    }
}

internal fun compactNumber(value: Int): String =
    value.toString()
        .reversed()
        .chunked(3)
        .joinToString(".")
        .reversed()

@Composable
private fun EmptyChat(modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.Start,
    ) {
        Icon(Icons.Filled.Computer, null, tint = Emerald, modifier = Modifier.size(34.dp))
        Spacer(Modifier.height(14.dp))
        Text(stringResource(R.string.new_task_title), fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(6.dp))
        Text(stringResource(R.string.new_task_body), color = TextSecondary, lineHeight = 20.sp)
    }
}

@Composable
private fun MessageRow(message: ChatMessage, modelName: String?) {
    val isUser = message.role == "user"
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (isUser) Alignment.End else Alignment.Start) {
        Text(
            if (isUser) {
                stringResource(R.string.message_role_user)
            } else {
                stringResource(R.string.message_role_agent, modelName ?: stringResource(R.string.model_fallback))
            },
            color = if (isUser) Sky else Emerald,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            fontFamily = AppMonoFamily,
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 3.dp),
        )
        Box(
            Modifier
                .widthIn(max = 540.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (isUser) SurfaceRaised else Surface)
                .border(1.dp, if (isUser) Sky.copy(alpha = 0.25f) else Border, RoundedCornerShape(12.dp))
                .padding(horizontal = 14.dp, vertical = 11.dp),
        ) {
            if (message.content.isEmpty() && message.streaming) {
                AgentActivityRow(stringResource(R.string.agent_signal_loading), color = Emerald, indicatorSize = 24.dp)
            } else {
                Text(
                    message.content,
                    color = if (message.content.isEmpty()) TextSecondary else TextPrimary,
                    fontSize = 13.5.sp,
                    lineHeight = 20.sp,
                )
            }
        }
    }
}

@Composable
private fun WorkingStatus() {
    AgentActivityRow(stringResource(R.string.agent_working), modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp), indicatorSize = 18.dp)
}

@Composable
private fun ToolTimeline(tools: List<ToolActivity>) {
    var openSeq by remember { mutableStateOf<Long?>(null) }
    Column(Modifier.fillMaxWidth().border(1.dp, Border, RoundedCornerShape(12.dp)).background(Night)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Tune, null, tint = TextSecondary, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(7.dp))
            Text(stringResource(R.string.tool_flow_title), color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = AppMonoFamily)
            Spacer(Modifier.weight(1f))
            Text("${tools.size}", color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily)
        }
        HorizontalDivider(color = SurfaceRaised)
        tools.forEach { tool ->
            val open = openSeq == tool.seq
            val summary = if (tool.status == "running") stringResource(R.string.tool_running) else tool.result.ifBlank { tool.args }
            Column(Modifier.fillMaxWidth().clickable { openSeq = if (open) null else tool.seq }.padding(horizontal = 12.dp, vertical = 10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (tool.status == "running") {
                        AgentActivityIndicator(color = Emerald, diameter = 17.dp)
                    } else {
                        Icon(
                            if (tool.status == "done") Icons.Filled.CheckCircle else Icons.Filled.Cancel,
                            null,
                            tint = if (tool.status == "done") Success else Coral,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                    Spacer(Modifier.width(9.dp))
                    Text(tool.name, fontFamily = AppMonoFamily, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                    Spacer(Modifier.width(8.dp))
                    Text(summary, color = if (tool.status == "failed") Coral else Muted, fontFamily = AppMonoFamily, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    tool.durationMs?.let {
                        Spacer(Modifier.width(8.dp))
                        Text("${it}ms", color = Muted, fontFamily = AppMonoFamily, fontSize = 10.sp)
                    }
                    Icon(if (open) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, null, tint = Muted, modifier = Modifier.size(17.dp))
                }
                if (open) {
                    Spacer(Modifier.height(10.dp))
                    ToolBlock(stringResource(R.string.tool_block_args), tool.args.ifBlank { stringResource(R.string.empty_dash) }, error = false)
                    if (tool.result.isNotBlank()) {
                        Spacer(Modifier.height(8.dp))
                        ToolBlock(stringResource(R.string.tool_block_result), tool.result, error = tool.status == "failed")
                    }
                }
            }
            HorizontalDivider(color = Surface)
        }
    }
}

@Composable
private fun SourceTimeline(sources: List<WebSource>) {
    Column(Modifier.fillMaxWidth().border(1.dp, Border, RoundedCornerShape(12.dp)).background(Night)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(Sky))
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.sources_title), color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = AppMonoFamily)
            Spacer(Modifier.weight(1f))
            Text("${sources.size}", color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily)
        }
        HorizontalDivider(color = SurfaceRaised)
        sources.forEachIndexed { index, source ->
            Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${index + 1}", color = Sky, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = AppMonoFamily)
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text(source.title, color = TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(source.url.removePrefix("https://").removePrefix("http://"), color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(Modifier.size(7.dp).clip(CircleShape).background(if (source.status == "fetched") Success else Sky))
                }
                if (source.snippet.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text(source.snippet, color = TextSecondary, fontSize = 11.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            HorizontalDivider(color = Surface)
        }
    }
}

@Composable
private fun ToolBlock(label: String, value: String, error: Boolean) {
    Column {
        FieldLabel(label)
        Text(
            value,
            color = if (error) Coral else TextSecondary,
            fontSize = 10.sp,
            lineHeight = 15.sp,
            fontFamily = AppMonoFamily,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp)
                .clip(RoundedCornerShape(7.dp))
                .background(Surface)
                .border(1.dp, if (error) Coral.copy(alpha = 0.4f) else Border, RoundedCornerShape(7.dp))
                .padding(9.dp),
        )
    }
}

@Composable
private fun ActiveControls(run: AgentRun, onPause: () -> Unit, onSteer: () -> Unit, onCancel: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Night).border(1.dp, SurfaceRaised).padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        OutlinedButton(onClick = onPause, modifier = Modifier.weight(1f).height(40.dp), shape = RoundedCornerShape(9.dp), contentPadding = PaddingValues(horizontal = 8.dp)) {
            Icon(if (run.status == "paused") Icons.Filled.PlayArrow else Icons.Filled.Pause, null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(stringResource(if (run.status == "paused") R.string.action_resume else R.string.action_pause), fontSize = 12.sp)
        }
        OutlinedButton(
            onClick = onSteer,
            modifier = Modifier.height(40.dp),
            shape = RoundedCornerShape(9.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Violet),
            contentPadding = PaddingValues(horizontal = 12.dp),
        ) {
            Icon(Icons.AutoMirrored.Filled.AltRoute, null, modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(5.dp))
            Text(stringResource(R.string.action_steer), fontSize = 12.sp)
        }
        OutlinedButton(
            onClick = onCancel,
            modifier = Modifier.size(width = 44.dp, height = 40.dp),
            shape = RoundedCornerShape(9.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Coral),
            contentPadding = PaddingValues(0.dp),
        ) { Icon(Icons.Filled.Stop, stringResource(R.string.action_stop), modifier = Modifier.size(18.dp)) }
    }
}

@Composable
private fun SteerComposer(onClose: () -> Unit, onSend: (String) -> Unit) {
    var text by remember { mutableStateOf("") }
    Row(
        Modifier.fillMaxWidth().background(Night).border(1.dp, Border).padding(horizontal = 10.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.AutoMirrored.Filled.AltRoute, null, tint = Violet, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(7.dp))
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            modifier = Modifier.weight(1f),
            placeholder = { Text(stringResource(R.string.steer_placeholder), fontSize = 12.sp) },
            singleLine = true,
            shape = RoundedCornerShape(8.dp),
        )
        IconButton(onClick = { onSend(text) }, enabled = text.isNotBlank()) {
            Icon(Icons.AutoMirrored.Filled.Send, stringResource(R.string.a11y_send_steer), tint = Violet)
        }
        IconButton(onClick = onClose) { Icon(Icons.Filled.Cancel, stringResource(R.string.action_close), tint = Muted) }
    }
}

@Composable
private fun Composer(
    value: String,
    onValueChange: (String) -> Unit,
    model: ModelOption?,
    busy: Boolean,
    onModelClick: () -> Unit,
    onSend: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background).border(1.dp, SurfaceRaised).padding(horizontal = 12.dp, vertical = 10.dp).imePadding(),
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(Modifier.weight(1f)) {
            Row(
                Modifier.clip(RoundedCornerShape(7.dp)).background(Surface).border(1.dp, Border, RoundedCornerShape(7.dp)).clickable(onClick = onModelClick).padding(horizontal = 9.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(if (model == null) Muted else Emerald))
                Spacer(Modifier.width(6.dp))
                Text(model?.name ?: stringResource(R.string.model_select), fontSize = 10.sp, fontFamily = AppMonoFamily)
                model?.capabilities?.takeIf { "tools" in it }?.let {
                    Text(stringResource(R.string.capability_tools), color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily)
                }
                Icon(Icons.Filled.ExpandMore, null, tint = Muted, modifier = Modifier.size(14.dp))
            }
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text(stringResource(if (busy) R.string.composer_busy_placeholder else R.string.composer_prompt_placeholder)) },
                maxLines = 4,
                enabled = !busy,
                shape = RoundedCornerShape(10.dp),
            )
        }
        Spacer(Modifier.width(8.dp))
        FilledIconButton(onClick = onSend, enabled = value.isNotBlank() && model != null && !busy, modifier = Modifier.size(46.dp), shape = RoundedCornerShape(11.dp)) {
            Icon(Icons.AutoMirrored.Filled.Send, stringResource(R.string.action_send))
        }
    }
}

@Composable
internal fun RunsScreen(vm: LocalAgentsViewModel) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.nav_runs), fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text(stringResource(R.string.runs_count, vm.runs.size), color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily)
                }
                IconButton(onClick = vm::refreshAll) { Icon(Icons.Filled.Refresh, stringResource(R.string.action_refresh), tint = TextSecondary) }
            }
        }
        if (vm.runs.isEmpty()) item {
            if (vm.loading) ListSkeleton(rows = 5, card = true)
            else Text(stringResource(R.string.empty_runs), color = TextSecondary, modifier = Modifier.padding(vertical = 24.dp))
        }
        items(vm.runs, key = { it.id }) { RunRow(it, onClick = { vm.openRun(it) }) }
    }
}

@Composable
private fun RunRow(run: AgentRun, onClick: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(Surface).border(1.dp, Border, RoundedCornerShape(11.dp)).clickable(onClick = onClick).padding(13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusChip(run.status)
            Spacer(Modifier.weight(1f))
            Text("${run.provider} · ${run.model}", color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(9.dp))
        Text(run.prompt, maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 19.sp, fontSize = 13.sp)
        Spacer(Modifier.height(7.dp))
        Text(stringResource(R.string.run_row_meta, run.id.take(8), relativeTime(run.updatedAt)), color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily)
    }
}

@Composable
internal fun ModelsScreen(vm: LocalAgentsViewModel) {
    val grouped = vm.models.groupBy { it.provider }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        if (vm.models.isEmpty() && vm.loading) item { ListSkeleton(rows = 5, card = true) }
        grouped.forEach { (provider, models) ->
            item {
                Text(provider.uppercase(), color = Muted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, fontFamily = AppMonoFamily, modifier = Modifier.padding(top = 7.dp, bottom = 1.dp))
            }
            items(models, key = { it.id }) { model ->
                ModelCard(
                    model = model,
                    selected = vm.selectedModel?.id == model.id,
                    onClick = {
                        vm.selectModel(model)
                        vm.changeTab(MainTab.CHAT)
                    },
                )
            }
        }
    }
}

@Composable
private fun ModelCard(model: ModelOption, selected: Boolean, onClick: () -> Unit) {
    val unavailable = "unavailable" in model.capabilities
    val color = if (selected) Emerald else Border
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(11.dp))
            .background(if (selected) Emerald.copy(alpha = 0.07f) else Surface)
            .border(1.dp, color, RoundedCornerShape(11.dp))
            .clickable(enabled = !unavailable, onClick = onClick)
            .padding(13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(model.name, fontFamily = AppMonoFamily, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = if (unavailable) TextSecondary else TextPrimary, modifier = Modifier.weight(1f))
            when {
                selected -> Icon(Icons.Filled.CheckCircle, stringResource(R.string.a11y_selected), tint = Emerald, modifier = Modifier.size(18.dp))
                unavailable -> {
                    Icon(Icons.Filled.CloudOff, null, tint = Muted, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(5.dp))
                    Text(stringResource(R.string.model_unavailable), color = Muted, fontSize = 10.sp, fontFamily = AppMonoFamily)
                }
            }
        }
        if (unavailable) {
            Spacer(Modifier.height(7.dp))
            Text(stringResource(R.string.model_unavailable_detail), color = Muted, fontSize = 11.sp)
        } else {
            Row(Modifier.padding(top = 9.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                model.capabilities.take(4).forEach { CapabilityTag(it, selected) }
            }
        }
    }
}

@Composable
private fun CapabilityTag(value: String, selected: Boolean) {
    Text(
        value,
        color = if (selected) Emerald else TextSecondary,
        fontSize = 10.sp,
        fontFamily = AppMonoFamily,
        modifier = Modifier.border(1.dp, if (selected) Emerald.copy(alpha = 0.3f) else Border, RoundedCornerShape(6.dp)).padding(horizontal = 7.dp, vertical = 3.dp),
    )
}

@Composable
internal fun SettingsScreen(vm: LocalAgentsViewModel) {
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item { Text(stringResource(R.string.nav_settings), fontSize = 20.sp, fontWeight = FontWeight.Bold) }
        item {
            SettingSection(stringResource(R.string.settings_connection)) {
                SettingLine(stringResource(R.string.settings_companion), vm.settings.baseUrl.removePrefix("https://").removePrefix("http://"))
                SettingLine(
                    stringResource(R.string.settings_status),
                    stringResource(if (vm.online) R.string.status_online else R.string.status_disconnected),
                    if (vm.online) Success else Coral,
                )
            }
        }
        item {
            SettingSection(stringResource(R.string.settings_device)) {
                SettingLine(stringResource(R.string.settings_device_name), Build.MODEL)
                SettingLine(stringResource(R.string.settings_device_id), vm.settings.deviceId.take(12).ifBlank { "—" })
            }
        }
        item {
            SettingSection(stringResource(R.string.settings_token)) {
                SettingLine(stringResource(R.string.settings_access_token), stringResource(R.string.settings_secure_store))
                SettingLine(stringResource(R.string.settings_refresh), stringResource(R.string.settings_automatic), Emerald, Icons.Filled.Autorenew)
            }
        }
        item {
            Column {
                FieldLabel(stringResource(R.string.settings_theme))
                Spacer(Modifier.height(9.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppThemes.chunked(2).forEach { rowThemes ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            rowThemes.forEach { palette ->
                                ThemeSwatch(
                                    palette = palette,
                                    selected = vm.themeId == palette.id,
                                    onClick = { vm.setTheme(palette.id) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                            if (rowThemes.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
                Text(
                    stringResource(R.string.theme_hint),
                    color = Muted,
                    fontSize = 10.sp,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
        item {
            OutlinedButton(
                onClick = vm::openSetupGuide,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(11.dp),
            ) {
                Icon(Icons.Filled.Computer, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.action_open_setup))
            }
        }
        item {
            OutlinedButton(
                onClick = vm::unpair,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Coral),
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(11.dp),
            ) {
                Icon(Icons.AutoMirrored.Filled.Logout, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.action_unpair))
            }
            Text(
                stringResource(R.string.unpair_hint),
                color = Muted,
                fontSize = 11.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 9.dp),
            )
        }
    }
}

@Composable
private fun SettingSection(title: String, content: @Composable () -> Unit) {
    Column {
        FieldLabel(title)
        Spacer(Modifier.height(9.dp))
        Column(Modifier.fillMaxWidth().border(1.dp, Border, RoundedCornerShape(11.dp)).background(Surface).padding(horizontal = 14.dp)) { content() }
    }
}

@Composable
private fun SettingLine(label: String, value: String, valueColor: Color = TextPrimary, icon: ImageVector? = null) {
    Row(Modifier.fillMaxWidth().padding(vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = TextSecondary, fontSize = 13.sp, modifier = Modifier.weight(1f))
        icon?.let {
            Icon(it, null, tint = valueColor, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(6.dp))
        }
        Text(value, color = valueColor, fontSize = 12.sp, fontFamily = AppMonoFamily, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 210.dp))
    }
    HorizontalDivider(color = SurfaceRaised)
}

@Composable
private fun ThemeSwatch(palette: AppPalette, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(10.dp))
            .background(palette.canvas)
            .border(if (selected) 2.dp else 1.dp, if (selected) palette.accent else palette.border, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(16.dp).clip(CircleShape).background(palette.accent))
            Spacer(Modifier.width(7.dp))
            Box(Modifier.weight(1f).height(6.dp).clip(RoundedCornerShape(3.dp)).background(palette.surface))
            if (selected) {
                Spacer(Modifier.width(7.dp))
                Icon(Icons.Filled.CheckCircle, null, tint = palette.accent, modifier = Modifier.size(15.dp))
            }
        }
        Text(palette.label, color = palette.textPrimary, fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
