package com.etdawallet.mdocproximity

import com.etdawallet.hardwareecdsa.HardwareSigningSessionManager
import org.multipaz.crypto.Algorithm
import org.multipaz.crypto.EcCurve
import org.multipaz.crypto.EcPublicKey
import org.multipaz.crypto.EcPublicKeyDoubleCoordinate
import org.multipaz.crypto.EcSignature
import org.multipaz.prompt.Reason
import org.multipaz.securearea.CreateKeySettings
import org.multipaz.securearea.KeyAttestation
import org.multipaz.securearea.KeyInfo
import org.multipaz.securearea.KeyLockedException
import org.multipaz.securearea.SecureArea

/**
 * Multipaz SecureArea that signs with the already-opened mdoc hardware session.
 * Alias is resolved from the opaque handle; JavaScript never supplies a Keystore alias.
 */
class HardwareHandleSecureArea(
  private val opaqueNativeHandle: String,
) : SecureArea {
  override val identifier: String = IDENTIFIER
  override val displayName: String = "Hardware P-256"
  override val supportedAlgorithms: List<Algorithm> = listOf(Algorithm.ESP256)

  override suspend fun createKey(alias: String?, createKeySettings: CreateKeySettings): KeyInfo {
    throw IllegalStateException("Hardware mdoc keys are created outside Multipaz")
  }

  override suspend fun deleteKey(alias: String) {
    // k_cred lifetime is owned by the wallet registry, not the NFC session.
  }

  override suspend fun getKeyInfo(alias: String): KeyInfo {
    val jwk = HardwareSigningSessionManager.readPublicJwkForHandle(opaqueNativeHandle)
    val x = decodeBase64Url(jwk.getValue("x"))
    val y = decodeBase64Url(jwk.getValue("y"))
    val publicKey: EcPublicKey = EcPublicKeyDoubleCoordinate(EcCurve.P256, x, y)
    return HardwareHandleKeyInfo(
      alias = KEY_ALIAS,
      algorithm = Algorithm.ESP256,
      publicKey = publicKey,
      attestation = KeyAttestation(publicKey, null),
    )
  }

  override suspend fun getKeyInvalidated(alias: String): Boolean = false

  override suspend fun sign(
    alias: String,
    dataToSign: ByteArray,
    unlockReason: Reason,
  ): EcSignature {
    val jose =
      try {
        HardwareSigningSessionManager.signMdocWithoutPrompt(opaqueNativeHandle, dataToSign)
      } catch (error: Exception) {
        throw KeyLockedException(error.message ?: "MdocSignFailed", error)
      }
    if (jose.size != 64) {
      throw IllegalStateException("Mdoc ES256 signature must be 64-byte r||s")
    }
    return EcSignature(
      r = jose.copyOfRange(0, 32),
      s = jose.copyOfRange(32, 64),
    )
  }

  override suspend fun keyAgreement(
    alias: String,
    otherKey: EcPublicKey,
    unlockReason: Reason,
  ): ByteArray {
    throw UnsupportedOperationException("mdoc device auth uses signature, not key agreement")
  }

  companion object {
    const val IDENTIFIER = "WalletHardwareHandleSecureArea"
    const val KEY_ALIAS = "wallet-mdoc-hardware-device-key"

    private fun decodeBase64Url(value: String): ByteArray {
      val padded = value.replace('-', '+').replace('_', '/')
      val remainder = padded.length % 4
      val withPad = if (remainder == 0) padded else padded + "=".repeat(4 - remainder)
      return android.util.Base64.decode(withPad, android.util.Base64.DEFAULT)
    }
  }
}

private class HardwareHandleKeyInfo(
  alias: String,
  algorithm: Algorithm,
  publicKey: EcPublicKey,
  attestation: KeyAttestation,
) : KeyInfo(alias, algorithm, publicKey, attestation)
