package com.localagents.app.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.localagents.app.R
import com.localagents.app.ui.theme.LocalAgentsTheme

/**
 * Widget eklenirken açılan yapılandırma ekranı (android:configure). Per-widget
 * "dokununca açılacak hedef" seçtirir, kaydeder, widget'ları tazeler ve RESULT_OK
 * döner. İptal halinde widget eklenmez (varsayılan RESULT_CANCELED).
 */
class LocalAgentsWidgetConfigActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(Activity.RESULT_CANCELED)

        val appWidgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        setContent {
            LocalAgentsTheme {
                ConfigScreen(
                    initialTarget = LocalAgentsWidgetConfig.tapTarget(this, appWidgetId),
                    initialDensity = LocalAgentsWidgetConfig.density(this, appWidgetId),
                    onSave = { target, density ->
                        LocalAgentsWidgetConfig.setTapTarget(this, appWidgetId, target)
                        LocalAgentsWidgetConfig.setDensity(this, appWidgetId, density)
                        LocalAgentsWidgetUpdater.updateAll(this)
                        setResult(
                            Activity.RESULT_OK,
                            Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId),
                        )
                        finish()
                    },
                )
            }
        }
    }
}

@Composable
private fun ConfigScreen(
    initialTarget: String,
    initialDensity: String,
    onSave: (String, String) -> Unit,
) {
    val targetOptions = listOf(
        LocalAgentsWidgetIntents.TARGET_SESSIONS to stringResource(R.string.nav_sessions),
        LocalAgentsWidgetIntents.TARGET_RUNS to stringResource(R.string.nav_runs),
        LocalAgentsWidgetIntents.TARGET_NEW_SESSION to stringResource(R.string.action_new_chat),
    )
    val densityOptions = listOf(
        LocalAgentsWidgetConfig.DENSITY_DETAILED to stringResource(R.string.widget_config_mode_detailed),
        LocalAgentsWidgetConfig.DENSITY_COMPACT to stringResource(R.string.widget_config_mode_compact),
    )
    var target by remember { mutableStateOf(LocalAgentsWidgetConfig.sanitizeTarget(initialTarget)) }
    var density by remember { mutableStateOf(LocalAgentsWidgetConfig.sanitizeDensity(initialDensity)) }

    Surface(color = MaterialTheme.colorScheme.background) {
        Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
            Text(
                text = stringResource(R.string.widget_config_title),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = stringResource(R.string.widget_config_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(14.dp))
            targetOptions.forEach { (value, label) ->
                OptionRow(selected = target == value, label = label) { target = value }
            }

            Spacer(Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.widget_config_mode_title),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Spacer(Modifier.height(4.dp))
            densityOptions.forEach { (value, label) ->
                OptionRow(selected = density == value, label = label) { density = value }
            }

            Spacer(Modifier.height(20.dp))
            Button(onClick = { onSave(target, density) }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.widget_config_save))
            }
        }
    }
}

@Composable
private fun OptionRow(selected: Boolean, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = selected, onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Spacer(Modifier.width(10.dp))
        Text(text = label, color = MaterialTheme.colorScheme.onBackground)
    }
}
