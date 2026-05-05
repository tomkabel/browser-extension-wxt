package org.smartid.vault.audit

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import android.util.Log
import androidx.annotation.VisibleForTesting
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyPair
import java.security.KeyStore
import java.security.Signature
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

data class QesAuditEntry(
    val sessionId: String,
    val timestamp: Long,
    val transactionHash: String,
    val zkTlsProofHash: String,
    val webauthnAssertionHash: String,
    val armTimestamp: Long,
    val interruptType: String,
    val interruptTimestamp: Long,
    val actuationTimestamp: Long,
    val result: String,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("sessionId", sessionId)
        put("timestamp", timestamp)
        put("transactionHash", transactionHash)
        put("zkTlsProofHash", zkTlsProofHash)
        put("webauthnAssertionHash", webauthnAssertionHash)
        put("armTimestamp", armTimestamp)
        put("interruptType", interruptType)
        put("interruptTimestamp", interruptTimestamp)
        put("actuationTimestamp", actuationTimestamp)
        put("result", result)
    }

    companion object {
        fun fromJson(json: JSONObject): QesAuditEntry = QesAuditEntry(
            sessionId = json.getString("sessionId"),
            timestamp = json.getLong("timestamp"),
            transactionHash = json.getString("transactionHash"),
            zkTlsProofHash = json.getString("zkTlsProofHash"),
            webauthnAssertionHash = json.getString("webauthnAssertionHash"),
            armTimestamp = json.getLong("armTimestamp"),
            interruptType = json.getString("interruptType"),
            interruptTimestamp = json.getLong("interruptTimestamp"),
            actuationTimestamp = json.getLong("actuationTimestamp"),
            result = json.getString("result"),
        )
    }
}

internal data class SignedAuditEntry(
    val entry: QesAuditEntry,
    val signatureBase64: String,
    val publicKeyBase64: String,
)

class AuditLogger(private val context: Context) {

    private val entries = mutableSetOf<QesAuditEntry>()
    @Volatile
    private var attestationKey: KeyPair? = null
    private val keyLock = ReentrantLock()

    fun logEntry(entry: QesAuditEntry) {
        synchronized(entries) {
            entries.add(entry)
            persistEntry(entry)
        }
        Log.i(TAG, "Audit entry logged: session=${entry.sessionId} result=${entry.result}")
    }

    fun getAllEntries(): List<QesAuditEntry> = synchronized(entries) { entries.toList() }

    fun signEntry(entry: QesAuditEntry): ByteArray {
        val keyPair = getOrCreateAttestationKey()
        val signature = Signature.getInstance(SIGNATURE_ALGORITHM)
        signature.initSign(keyPair.private)
        signature.update(entry.toJson().toString().toByteArray(Charsets.UTF_8))
        return signature.sign()
    }

    fun verifyEntry(entry: QesAuditEntry, signatureBytes: ByteArray): Boolean {
        val keyPair = getOrCreateAttestationKey()
        val signature = Signature.getInstance(SIGNATURE_ALGORITHM)
        signature.initVerify(keyPair.public)
        signature.update(entry.toJson().toString().toByteArray(Charsets.UTF_8))
        return signature.verify(signatureBytes)
    }

    @VisibleForTesting
    fun getAttestationPublicKeyBytes(): ByteArray {
        return getOrCreateAttestationKey().public.encoded
    }

    fun exportAuditLog(): String {
        val signedEntries = loadSignedEntriesFromStorage()
        val exportArray = JSONArray()
        for (signed in signedEntries) {
            exportArray.put(JSONObject().apply {
                put("entry", signed.entry.toJson())
                put("signature", signed.signatureBase64)
                put("publicKey", signed.publicKeyBase64)
            })
        }
        val result = exportArray.toString(2)
        Log.i(TAG, "Audit log exported: ${signedEntries.size} entries using stored signatures")
        return result
    }

    fun clear() {
        synchronized(entries) {
            entries.clear()
            val file = getAuditFile()
            if (file.exists()) file.delete()
        }
        Log.i(TAG, "Audit log cleared")
    }

    fun loadPersistedEntries(): List<QesAuditEntry> {
        val signed = loadSignedEntriesFromStorage()
        synchronized(entries) {
            val deduplicated = signed.filter { it.entry !in entries }
            entries.addAll(deduplicated.map { it.entry })
            if (deduplicated.isNotEmpty()) {
                Log.i(TAG, "Loaded ${deduplicated.size} new persisted audit entries")
            }
        }
        return signed.map { it.entry }
    }

    private fun loadSignedEntriesFromStorage(): List<SignedAuditEntry> {
        val file = getAuditFile()
        if (!file.exists()) return emptyList()

        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            val encryptedFile = EncryptedFile.Builder(
                context, file, masterKey,
                EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
            ).build()

            val jsonStr = encryptedFile.openFileInput().bufferedReader().use { it.readText() }
            val jsonArray = JSONArray(jsonStr)
            val result = mutableListOf<SignedAuditEntry>()
            for (i in 0 until jsonArray.length()) {
                try {
                    val obj = jsonArray.getJSONObject(i)
                    val entry = QesAuditEntry.fromJson(obj.getJSONObject("entry"))
                    val sig = obj.optString("signature", "")
                    val pk = obj.optString("publicKey", "")
                    if (sig.isNotEmpty() && pk.isNotEmpty() && verifyEntryFromComponents(entry, sig, pk)) {
                        result.add(SignedAuditEntry(entry, sig, pk))
                    } else {
                        Log.w(TAG, "Skipping entry $i: signature verification failed")
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Skipping corrupt audit entry at index $i", e)
                }
            }
            result
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load persisted audit entries", e)
            emptyList()
        }
    }

    private fun verifyEntryFromComponents(
        entry: QesAuditEntry,
        signatureBase64: String,
        publicKeyBase64: String,
    ): Boolean {
        return try {
            val sigBytes = Base64.decode(signatureBase64, Base64.NO_WRAP)
            val pkBytes = Base64.decode(publicKeyBase64, Base64.NO_WRAP)
            val keyFactory = java.security.KeyFactory.getInstance("EC")
            val keySpec = java.security.spec.X509EncodedKeySpec(pkBytes)
            val publicKey = keyFactory.generatePublic(keySpec)
            val signature = Signature.getInstance(SIGNATURE_ALGORITHM)
            signature.initVerify(publicKey)
            signature.update(entry.toJson().toString().toByteArray(Charsets.UTF_8))
            signature.verify(sigBytes)
        } catch (e: Exception) {
            Log.w(TAG, "Entry verification failed", e)
            false
        }
    }

    private fun persistEntry(entry: QesAuditEntry) {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        val file = getAuditFile()
        val encryptedFile = EncryptedFile.Builder(
            context, file, masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build()

        val sigBytes = signEntry(entry)
        val newEntryJson = JSONObject().apply {
            put("entry", entry.toJson())
            put("signature", Base64.encodeToString(sigBytes, Base64.NO_WRAP))
            put("publicKey", Base64.encodeToString(
                getAttestationPublicKeyBytes(), Base64.NO_WRAP
            ))
        }

        val allEntries = mutableListOf<JSONObject>()
        if (file.exists()) {
            try {
                val existing = encryptedFile.openFileInput().bufferedReader().use {
                    JSONArray(it.readText())
                }
                for (i in 0 until existing.length()) {
                    allEntries.add(existing.getJSONObject(i))
                }
            } catch (_: Exception) { }
        }

        allEntries.add(newEntryJson)
        val output = JSONArray(allEntries).toString(2)
        encryptedFile.openFileOutput().bufferedWriter().use { it.write(output) }
    }

    private fun getAuditFile(): File {
        val dir = File(context.filesDir, AUDIT_DIR)
        if (!dir.exists()) dir.mkdirs()
        return File(dir, AUDIT_FILE_NAME)
    }

    private fun getOrCreateAttestationKey(): KeyPair {
        attestationKey?.let { return it }
        return keyLock.withLock {
            attestationKey?.let { return@withLock it }

            val keyStore = KeyStore.getInstance(KEYSTORE_TYPE)
            keyStore.load(null)

            if (keyStore.containsAlias(KEY_ALIAS)) {
                val entry = keyStore.getEntry(KEY_ALIAS, null) as KeyStore.PrivateKeyEntry
                val pair = KeyPair(entry.certificate.publicKey, entry.privateKey)
                attestationKey = pair
                return@withLock pair
            }

            val keyPair = generateKeyWithRetry()
            attestationKey = keyPair
            Log.i(TAG, "Attestation key pair generated and cached")
            keyPair
        }
    }

    private fun generateKeyWithRetry(): KeyPair {
        val kpg = java.security.KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC, KEYSTORE_TYPE
        )

        val strongBoxSpec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        )
            .setAlgorithmParameterSpec(
                java.security.spec.ECGenParameterSpec("secp256r1")
            )
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setIsStrongBoxBacked(true)
            .build()

        try {
            val kpgStrong = java.security.KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC, KEYSTORE_TYPE
            )
            kpgStrong.initialize(strongBoxSpec)
            return kpgStrong.generateKeyPair()
        } catch (e: StrongBoxUnavailableException) {
            Log.w(TAG, "StrongBox not available, retrying with TEE-backed key")
        }

        val teeSpec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        )
            .setAlgorithmParameterSpec(
                java.security.spec.ECGenParameterSpec("secp256r1")
            )
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setIsStrongBoxBacked(false)
            .build()

        val kpgTee = java.security.KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC, KEYSTORE_TYPE
        )
        kpgTee.initialize(teeSpec)
        return kpgTee.generateKeyPair()
    }

    companion object {
        private const val TAG = "AuditLogger"
        private const val KEYSTORE_TYPE = "AndroidKeyStore"
        private const val KEY_ALIAS = "smartid_qes_attestation_key"
        private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"
        private const val AUDIT_DIR = "qes_audit"
        private const val AUDIT_FILE_NAME = "audit_log.enc"
    }
}
