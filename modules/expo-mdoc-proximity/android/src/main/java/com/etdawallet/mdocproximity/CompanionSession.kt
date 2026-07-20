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

object CompanionSession {
  private const val TAG = "CompanionSession"
  private val armState = AtomicReference<ProximityArmState?>(null)
  private val pendingCompanionResponse = AtomicReference<ByteArray?>(null)
  private val selectedAid = AtomicReference<String?>(null)
  private val mdocExchangeComplete = AtomicReference(false)
  private val presentationApproved = AtomicReference(false)
  var onCompanionSignRequested: ((ByteArray) -> Unit)? = null

  fun arm(state: ProximityArmState) {
    armState.set(state)
    pendingCompanionResponse.set(null)
    selectedAid.set(null)
    mdocExchangeComplete.set(false)
    presentationApproved.set(state.approvedMdocFields.isNotEmpty())
    Log.d(TAG, "[companion-arm] profile=${state.profileId} mode=${state.sharingMode}")
  }

  fun disarm() {
    armState.set(null)
    pendingCompanionResponse.set(null)
    selectedAid.set(null)
    mdocExchangeComplete.set(false)
    presentationApproved.set(false)
    onCompanionSignRequested = null
    MdocApduHandler.stop()
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

  fun requireArmState(): ProximityArmState =
    readArmState() ?: throw MdocProximityException(
      MdocProximityErrors.PRESENTATION_INACTIVE,
      "Proximity session is not armed",
    )

  fun selectMdoc() {
    selectedAid.set("mdoc")
  }

  fun selectCompanion() {
    selectedAid.set("companion")
  }

  fun readSelectedAid(): String? = selectedAid.get()

  fun markMdocExchangeComplete() {
    mdocExchangeComplete.set(true)
  }

  fun isMdocExchangeComplete(): Boolean = mdocExchangeComplete.get()

  fun isPresentationApproved(): Boolean = presentationApproved.get()

  fun markPresentationApproved(approvedFields: List<String> = emptyList()) {
    val state = readArmState() ?: return
    if (approvedFields.isNotEmpty()) {
      armState.set(state.copy(approvedMdocFields = approvedFields))
    }
    presentationApproved.set(true)
  }

  fun storeCompanionResponse(bytes: ByteArray) {
    pendingCompanionResponse.set(bytes)
  }

  fun consumeCompanionResponse(): ByteArray? = pendingCompanionResponse.getAndSet(null)
}
