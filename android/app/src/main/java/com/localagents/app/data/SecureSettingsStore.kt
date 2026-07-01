package com.localagents.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.flow.first

private val Context.localAgentsDataStore: DataStore<Preferences> by preferencesDataStore("local_agents_settings")

class SecureSettingsStore(private val context: Context) {
    private object Keys {
        val baseUrl = stringPreferencesKey("base_url")
        val accessToken = stringPreferencesKey("access_token")
        val refreshToken = stringPreferencesKey("refresh_token")
        val deviceId = stringPreferencesKey("device_id")
        val themeId = stringPreferencesKey("theme_id")
        val setupGuideSeen = booleanPreferencesKey("setup_guide_seen")
    }

    private val crypto = TokenCrypto()

    suspend fun load(): ConnectionSettings {
        val prefs = context.localAgentsDataStore.data.first()
        return ConnectionSettings(
            baseUrl = prefs[Keys.baseUrl].orEmpty(),
            accessToken = crypto.decrypt(prefs[Keys.accessToken].orEmpty()),
            refreshToken = crypto.decrypt(prefs[Keys.refreshToken].orEmpty()),
            deviceId = prefs[Keys.deviceId].orEmpty(),
        )
    }

    suspend fun save(settings: ConnectionSettings) {
        context.localAgentsDataStore.edit { prefs ->
            prefs[Keys.baseUrl] = settings.baseUrl
            prefs[Keys.accessToken] = crypto.encrypt(settings.accessToken)
            prefs[Keys.refreshToken] = crypto.encrypt(settings.refreshToken)
            prefs[Keys.deviceId] = settings.deviceId
        }
    }

    suspend fun clearConnection() {
        context.localAgentsDataStore.edit { prefs ->
            prefs.remove(Keys.baseUrl)
            prefs.remove(Keys.accessToken)
            prefs.remove(Keys.refreshToken)
            prefs.remove(Keys.deviceId)
        }
    }

    suspend fun loadThemeId(): String =
        context.localAgentsDataStore.data.first()[Keys.themeId] ?: "emerald"

    suspend fun saveThemeId(id: String) {
        context.localAgentsDataStore.edit { it[Keys.themeId] = id }
    }

    suspend fun loadSetupGuideSeen(): Boolean =
        context.localAgentsDataStore.data.first()[Keys.setupGuideSeen] ?: false

    suspend fun saveSetupGuideSeen(seen: Boolean) {
        context.localAgentsDataStore.edit { it[Keys.setupGuideSeen] = seen }
    }
}

private class TokenCrypto {
    companion object {
        private const val ALIAS = "local_agents_device_tokens"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    fun encrypt(value: String): String {
        if (value.isEmpty()) return ""
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val bytes = ByteBuffer.allocate(4 + cipher.iv.size + encrypted.size)
            .putInt(cipher.iv.size).put(cipher.iv).put(encrypted).array()
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    fun decrypt(value: String): String {
        if (value.isEmpty()) return ""
        return try {
            val bytes = ByteBuffer.wrap(Base64.decode(value, Base64.NO_WRAP))
            val iv = ByteArray(bytes.int).also(bytes::get)
            val encrypted = ByteArray(bytes.remaining()).also(bytes::get)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(encrypted), Charsets.UTF_8)
        } catch (_: Exception) {
            ""
        }
    }
}
