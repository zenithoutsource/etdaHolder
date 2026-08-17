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
  val responseDrainGraceMs: Long = 5_000L,
)

object CompanionSession {
  private const val TAG = "CompanionSession"
  private val armState = AtomicReference<ProximityArmState?>(null)
  private val pendingCompanionResponse = AtomicReference<ByteArray?>(null)
  private val selectedAid = AtomicReference<String?>(null)
  private val mdocExchangeComplete = AtomicReference(false)
  private val presentationApproved = AtomicReference(false)
  private val ndefMessage = AtomicReference<ByteArray?>(null)
  private val ndefSelectedFile = AtomicReference<Int?>(null)
  var onCompanionSignRequested: ((ByteArray) -> Unit)? = null

  fun arm(state: ProximityArmState) {
    armState.set(state)
    pendingCompanionResponse.set(null)
    selectedAid.set(null)
    ndefMessage.set(null)
    ndefSelectedFile.set(null)
    mdocExchangeComplete.set(false)
    presentationApproved.set(state.approvedMdocFields.isNotEmpty())
    Log.d(TAG, "[companion-arm] profile=${state.profileId} mode=${state.sharingMode}")
  }

  fun disarm() {
    armState.set(null)
    pendingCompanionResponse.set(null)
    selectedAid.set(null)
    ndefMessage.set(null)
    ndefSelectedFile.set(null)
    mdocExchangeComplete.set(false)
    presentationApproved.set(false)
    onCompanionSignRequested = null
    MultipazPresentmentSession.stop()
    MdocApduHandler.stop()
    HcePreferredService.release()
    Log.d(TAG, "[companion-arm] disarmed")
  }

  fun peekArmState(): ProximityArmState? = armState.get()

  fun readArmState(): ProximityArmState? {
    val state = armState.get() ?: return null
    if (System.currentTimeMillis() > state.armedUntilMs) {
      Log.w(TAG, "[companion-arm] expired")
      disarm()
      return null
    }
    return state
  }

  fun extendArm(armWindowMs: Long) {
    val state = readArmState() ?: return
    val windowMs = if (armWindowMs > 0) armWindowMs else 180_000L
    armState.set(state.copy(armedUntilMs = System.currentTimeMillis() + windowMs))
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

  fun selectNdef() {
    selectedAid.set("ndef")
    ndefSelectedFile.set(null)
  }

  fun selectNdefFile(fileId: Int) {
    ndefSelectedFile.set(fileId)
  }

  fun clearSelectedAid() {
    selectedAid.set(null)
    ndefSelectedFile.set(null)
  }

  fun readSelectedAid(): String? = selectedAid.get()

  fun readNdefSelectedFile(): Int? = ndefSelectedFile.get()

  fun setNdefMessage(bytes: ByteArray) {
    ndefMessage.set(bytes)
    ndefSelectedFile.set(null)
  }

  fun readNdefMessage(): ByteArray? = ndefMessage.get()

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
