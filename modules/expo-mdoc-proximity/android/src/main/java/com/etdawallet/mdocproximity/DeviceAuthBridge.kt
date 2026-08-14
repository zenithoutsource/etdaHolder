package com.etdawallet.mdocproximity

import org.multipaz.crypto.EcCurve
import org.multipaz.crypto.EcPrivateKeyOkp

/**
 * Pre-tap device-auth material for ISO 18013-5.
 *
 * Hardware P-256: opaque native signing handle only (no private key bytes).
 * Flag-off Ed25519: 32-byte seed installed once at arm time, cleared on stop.
 */
object DeviceAuthBridge {
  private const val ED25519_SEED_LENGTH = 32
  private const val ED25519_PUBLIC_KEY_LENGTH = 32

  @Volatile
  private var seed: ByteArray? = null

  @Volatile
  private var publicKey: ByteArray? = null

  @Volatile
  private var hardwareHandle: String? = null

  fun install(seedBytes: ByteArray, publicKeyBytes: ByteArray) {
    if (seedBytes.size != ED25519_SEED_LENGTH || publicKeyBytes.size != ED25519_PUBLIC_KEY_LENGTH) {
      throw MdocProximityException(
        MdocProximityErrors.INVALID_ARGUMENT,
        "Ed25519 seed and public key must each be 32 bytes",
      )
    }
    clear()
    seed = seedBytes.copyOf()
    publicKey = publicKeyBytes.copyOf()
  }

  fun installHardwareHandle(handle: String) {
    if (handle.isBlank()) {
      throw MdocProximityException(
        MdocProximityErrors.INVALID_ARGUMENT,
        "opaqueNativeHandle is required",
      )
    }
    clear()
    hardwareHandle = handle
  }

  fun isReady(): Boolean = hasHardwareHandle() || (seed != null && publicKey != null)

  fun hasHardwareHandle(): Boolean = hardwareHandle != null

  fun hardwareHandle(): String? = hardwareHandle

  fun buildPrivateKey(): EcPrivateKeyOkp? {
    val seedBytes = seed ?: return null
    val publicKeyBytes = publicKey ?: return null
    return EcPrivateKeyOkp(
      curve = EcCurve.ED25519,
      d = seedBytes.copyOf(),
      x = publicKeyBytes.copyOf(),
    )
  }

  fun clear() {
    seed?.fill(0)
    seed = null
    publicKey = null
    hardwareHandle = null
  }
}
