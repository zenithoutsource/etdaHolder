package com.etdawallet.mdocproximity

import android.util.Log
import java.util.concurrent.atomic.AtomicReference

data class ProximityArmState(
  val credentialId: String,
  val sharingMode: String,
  val profileId: String,
  val approvedMdocFields: List<String>,
  val companionSdJwt: String?,
  val armedUntilMs: Long,
)

object EtdaCompanionSession {
  private const val TAG = "EtdaCompanionSession"
  private val armState = AtomicReference<ProximityArmState?>(null)
  private val pendingCompanionResponse = AtomicReference<ByteArray?>(null)
  var onCompanionSignRequested: ((ByteArray) -> Unit)? = null

  fun arm(state: ProximityArmState) {
    armState.set(state)
    pendingCompanionResponse.set(null)
    Log.d(TAG, "[companion-arm] profile=${state.profileId} mode=${state.sharingMode}")
  }

  fun disarm() {
    armState.set(null)
    pendingCompanionResponse.set(null)
    onCompanionSignRequested = null
    Log.d(TAG, "[companion-arm] disarmed")
  }

  fun readArmState(): ProximityArmState? {
    val state = armState.get() ?: return null
    if (System.currentTimeMillis() > state.armedUntilMs) {
      disarm()
      return null
    }
    return state
  }

  fun storeCompanionResponse(bytes: ByteArray) {
    pendingCompanionResponse.set(bytes)
  }

  fun consumeCompanionResponse(): ByteArray? = pendingCompanionResponse.getAndSet(null)
}
