package com.etdawallet.mdocproximity

import org.multipaz.crypto.EcCurve
import org.multipaz.crypto.EcPrivateKeyOkp

/**
 * Holds holder Ed25519 material unlocked once at pre-tap approve time.
 * Cleared on session stop, cancel, or timeout — never logged.
 */
object DeviceAuthBridge {
  private const val ED25519_SEED_LENGTH = 32
  private const val ED25519_PUBLIC_KEY_LENGTH = 32

  @Volatile
  private var seed: ByteArray? = null

  @Volatile
  private var publicKey: ByteArray? = null

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

  fun isReady(): Boolean = seed != null && publicKey != null

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
  }
}
