package com.etdawallet.mdocproximity

import android.util.Log
import com.wallet.mdocproximity.DcApiBridgeExecutionException
import com.wallet.mdocproximity.DcApiBridgeInputException
import com.wallet.mdocproximity.DcApiDeviceResponseBuilder
import com.wallet.mdocproximity.DcApiNativeBridgeContract
import com.wallet.mdocproximity.DcApiNativeBridgeDependencies
import com.wallet.mdocproximity.DcApiNativeFailureStage
import com.wallet.mdocproximity.DcApiNativeInput
import com.wallet.mdocproximity.DcApiSafeFailure
import com.wallet.mdocproximity.DcApiStoredCredential
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import androidx.fragment.app.FragmentActivity
import com.etdawallet.hardwareecdsa.HardwareSigningSessionManager
import java.nio.charset.StandardCharsets
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ExpoMdocProximityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMdocProximity")

    OnCreate {
      ProximityEventDispatcher.emitter = { eventName, payload ->
        sendEvent(eventName, payload)
      }
    }

    OnDestroy {
      ProximityEventDispatcher.emitter = null
    }

    Events(
      "onDeviceEngaged",
      "onRequestReceived",
      "onPresentationComplete",
      "onCompanionSignRequested",
      "onError",
    )

    Function("getAvailability") {
      val context = appContext.reactContext?.applicationContext
        ?: return@Function mapOf(
          "platform" to "android",
          "nfcSupported" to false,
          "nfcEnabled" to false,
          "presentationReady" to false,
        )

      return@Function MdocProximityEngine.getAvailability(context)
    }

    Function("getDeviceEngagementUri") {
      MdocProximityEngine.getDeviceEngagementUri()
    }

    Function("extendProximityArm") { armWindowMs: Double ->
      CompanionSession.extendArm(armWindowMs.toLong())
    }

    AsyncFunction("installMdocDeviceKey") { seed: ByteArray, publicKey: ByteArray ->
      DeviceAuthBridge.install(seed, publicKey)
    }

    AsyncFunction("installMdocSigningHandle") { handle: String, promise: Promise ->
      val activity = appContext.currentActivity as? FragmentActivity
      if (activity == null) {
        promise.reject(
          MdocProximityErrors.PROXIMITY_NOT_READY,
          "CurrentActivityUnavailable",
          null,
        )
        return@AsyncFunction
      }

      CoroutineScope(Dispatchers.Main.immediate).launch {
        try {
          HardwareSigningSessionManager.authenticateMdocSession(handle, activity)
          DeviceAuthBridge.installHardwareHandle(handle)
          promise.resolve(null)
        } catch (error: MdocProximityException) {
          promise.reject(error.code, error.message, error)
        } catch (error: Exception) {
          promise.reject(MdocProximityErrors.PROXIMITY_NOT_READY, error.message, error)
        }
      }
    }

    AsyncFunction("storeMdoc") { credentialId: String, docType: String, mdocBytes: ByteArray ->
      val context = requireContext()
      MdocProximityEngine.storeMdoc(context, credentialId, docType, mdocBytes)
    }

    AsyncFunction("hasMdoc") { credentialId: String ->
      val context = appContext.reactContext?.applicationContext
        ?: throw MdocProximityException(
          MdocProximityErrors.STORAGE_FAILED,
          "Application context is unavailable",
        )
      return@AsyncFunction MdocProximityEngine.hasMdoc(context, credentialId)
    }

    AsyncFunction("readMdoc") { credentialId: String ->
      val context = requireContext()
      return@AsyncFunction MdocProximityEngine.readMdoc(context, credentialId)
    }

    AsyncFunction("deleteMdoc") { credentialId: String ->
      val context = appContext.reactContext?.applicationContext ?: return@AsyncFunction
      MdocProximityEngine.deleteMdoc(context, credentialId)
    }

    AsyncFunction("buildDcApiDeviceResponse") { params: Map<String, Any?>, promise: Promise ->
      val activity = appContext.currentActivity as? FragmentActivity
      if (activity == null) {
        promise.reject(
          MdocProximityErrors.PROXIMITY_NOT_READY,
          "CurrentActivityUnavailable",
          null,
        )
        return@AsyncFunction
      }

      CoroutineScope(Dispatchers.Main.immediate).launch {
        try {
          val input = DcApiNativeBridgeContract.readInput(params)
          promise.resolve(
            DcApiNativeBridgeContract.execute(
              input,
              dcApiBridgeDependencies(activity),
            ),
          )
        } catch (error: DcApiBridgeInputException) {
          rejectDcApiFailure(promise, error.failure)
        } catch (error: DcApiBridgeExecutionException) {
          rejectDcApiFailure(promise, error.failure)
        } catch (error: Exception) {
          rejectDcApiFailure(
            promise,
            DcApiNativeBridgeContract.safeFailure(
              DcApiNativeFailureStage.CONSTRUCTION,
              error,
            ),
          )
        }
      }
    }

    AsyncFunction("armProximitySession") { config: Map<String, Any?>, promise: Promise ->
      CoroutineScope(Dispatchers.Main.immediate).launch {
        try {
          val activity = appContext.currentActivity
            ?: throw MdocProximityException(
              MdocProximityErrors.PROXIMITY_NOT_READY,
              "CurrentActivityUnavailable",
            )
          if (!HcePreferredService.claim(activity)) {
            throw MdocProximityException(
              MdocProximityErrors.PROXIMITY_NOT_READY,
              "HcePreferredServiceUnavailable",
            )
          }

          withContext(Dispatchers.Default) {
            armProximitySessionBody(config)
          }
          promise.resolve(null)
        } catch (error: MdocProximityException) {
          CompanionSession.disarm()
          promise.reject(error.code, error.message, error)
        } catch (error: Exception) {
          CompanionSession.disarm()
          promise.reject(MdocProximityErrors.PROXIMITY_NOT_READY, error.message, error)
        }
      }
    }

    AsyncFunction("supplyCompanionPresentation") { presentation: String, promise: Promise ->
      try {
        val bytes = presentation.toByteArray(StandardCharsets.UTF_8)
        CompanionSession.storeCompanionResponse(bytes)
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject(MdocProximityErrors.PROXIMITY_NOT_READY, error.message, error)
      }
    }

    AsyncFunction("startProximityPresentation") { credentialId: String, deviceKeyId: String, promise: Promise ->
      try {
        MdocProximityEngine.startProximityPresentation(appContext, credentialId, deviceKeyId)
        promise.resolve(null)
      } catch (error: MdocProximityException) {
        promise.reject(error.code, error.message, error)
      } catch (error: Exception) {
        promise.reject(MdocProximityErrors.PROXIMITY_NOT_READY, error.message, error)
      }
    }

    AsyncFunction("stopProximityPresentation") {
      MdocProximityEngine.stopProximityPresentation()
      CompanionSession.disarm()
    }

    AsyncFunction("approvePresentation") { requestedFields: List<String>, promise: Promise ->
      try {
        val context = requireContext()
        MdocProximityEngine.approvePresentation(context, requestedFields)
        promise.resolve(null)
      } catch (error: MdocProximityException) {
        promise.reject(error.code, error.message, error)
      } catch (error: Exception) {
        promise.reject(MdocProximityErrors.PROXIMITY_NOT_READY, error.message, error)
      }
    }

    AsyncFunction("denyPresentation") {
      MdocProximityEngine.stopProximityPresentation()
      CompanionSession.disarm()
    }
  }

  private fun requireContext() =
    appContext.reactContext?.applicationContext
      ?: throw MdocProximityException(
        MdocProximityErrors.PROXIMITY_NOT_READY,
        "Application context is unavailable",
      )

  private fun armProximitySessionBody(config: Map<String, Any?>) {
    val credentialId = config["credentialId"] as? String
      ?: throw MdocProximityException(MdocProximityErrors.INVALID_ARGUMENT, "credentialId is required")
    val sharingMode = config["sharingMode"] as? String
      ?: throw MdocProximityException(MdocProximityErrors.INVALID_ARGUMENT, "sharingMode is required")
    val profileId = config["profileId"] as? String
      ?: throw MdocProximityException(MdocProximityErrors.INVALID_ARGUMENT, "profileId is required")
    val approvedFields = readStringList(config["approvedMdocFields"])
    if (approvedFields.isEmpty()) {
      throw MdocProximityException(
        MdocProximityErrors.INVALID_ARGUMENT,
        "approvedMdocFields is required",
      )
    }
    val profileCeiling = readStringList(config["profileCeiling"]).ifEmpty { approvedFields }
    if (approvedFields.any { field -> !ApprovedMdocFieldCeiling.containsKey(profileCeiling, field) }) {
      throw MdocProximityException(
        MdocProximityErrors.INVALID_ARGUMENT,
        "approvedMdocFields must be a subset of profileCeiling",
      )
    }
    val companionSdJwt = config["companionSdJwt"] as? String
    val displayNameOverlay = readStringMap(config["displayNameOverlay"])
    val armWindowMs = (config["armWindowMs"] as? Number)?.toLong() ?: 180_000L
    val responseDrainGraceMs = (config["responseDrainGraceMs"] as? Number)?.toLong() ?: 5_000L

    val context = requireContext()
    if (!MdocProximityEngine.hasMdoc(context, credentialId)) {
      throw MdocProximityException(
        MdocProximityErrors.CREDENTIAL_NOT_FOUND,
        "No mDOC is stored for this credential",
      )
    }

    CompanionSession.arm(
      ProximityArmState(
        credentialId = credentialId,
        sharingMode = sharingMode,
        profileId = profileId,
        approvedMdocFields = approvedFields,
        profileCeiling = profileCeiling,
        companionSdJwt = companionSdJwt,
        armedUntilMs = System.currentTimeMillis() + armWindowMs,
        responseDrainGraceMs = responseDrainGraceMs,
        displayNameOverlay = displayNameOverlay,
      ),
    )

    CompanionSession.onCompanionSignRequested = { nonce ->
      sendEvent(
        "onCompanionSignRequested",
        mapOf("nonceBase64Url" to android.util.Base64.encodeToString(nonce, android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING)),
      )
    }

    MdocProximityEngine.preparePresentationEngine(context)
    if (MultipazPresentmentSession.deviceEngagementUri() == null) {
      throw MdocProximityException(
        MdocProximityErrors.PROXIMITY_NOT_READY,
        "Device engagement QR was not produced",
      )
    }
    // Start the arm clock when the QR exists so biometric/prepare time does not consume it.
    CompanionSession.extendArm(armWindowMs)
  }

  private fun readStringList(value: Any?): List<String> {
    val items = value as? List<*> ?: return emptyList()
    return items.mapNotNull { it as? String }
  }

  private fun readStringMap(value: Any?): Map<String, String> {
    val items = value as? Map<*, *> ?: return emptyMap()
    val overlay = linkedMapOf<String, String>()
    for ((key, entry) in items) {
      val label = key as? String ?: continue
      val text = entry as? String ?: continue
      if (label.isNotBlank() && text.isNotBlank()) {
        overlay[label] = text
      }
    }
    return overlay
  }

  private fun dcApiBridgeDependencies(
    activity: FragmentActivity,
  ): DcApiNativeBridgeDependencies = object : DcApiNativeBridgeDependencies {
    override fun isPresentationActive(): Boolean = MdocProximityEngine.isPresentationActive()

    override suspend fun readStoredCredential(credentialId: String): DcApiStoredCredential {
      val context = requireContext()
      return DcApiStoredCredential(
        mdocBytes = MdocProximityEngine.readMdoc(context, credentialId),
        docType = MdocProximityEngine.readStoredDocType(context, credentialId),
      )
    }

    override suspend fun authenticateSigningSession(opaqueNativeHandle: String) {
      HardwareSigningSessionManager.authenticateMdocSession(opaqueNativeHandle, activity)
    }

    override suspend fun readPublicKey(opaqueNativeHandle: String) = withContext(Dispatchers.Default) {
      HardwareHandleSecureArea(opaqueNativeHandle)
        .getKeyInfo(HardwareHandleSecureArea.KEY_ALIAS)
        .publicKey
    }

    override suspend fun signWithoutPrompt(
      opaqueNativeHandle: String,
      data: ByteArray,
    ): ByteArray = HardwareSigningSessionManager.signMdocWithoutPrompt(
      opaqueNativeHandle,
      data,
    )

    override suspend fun buildDeviceResponse(
      input: DcApiNativeInput,
      storedCredential: DcApiStoredCredential,
      publicKey: org.multipaz.crypto.EcPublicKey,
      sign: suspend (ByteArray) -> ByteArray,
    ): ByteArray = withContext(Dispatchers.Default) {
      DcApiDeviceResponseBuilder.build(
        mdocBytes = storedCredential.mdocBytes,
        storedDocType = storedCredential.docType,
        approvedNamespaceKeys = input.approvedNamespaceKeys,
        origin = input.origin,
        nonce = input.nonce,
        encryptionJwkJson = input.encryptionJwkJson,
        publicKey = publicKey,
        sign = sign,
      )
    }
  }

  private fun rejectDcApiFailure(promise: Promise, failure: DcApiSafeFailure) {
    Log.e(TAG, "[dc-api-mdoc] failure category=${failure.diagnosticCategory}")
    promise.reject(failure.code, failure.message, null)
  }

  private companion object {
    const val TAG = "ExpoMdocProximity"
  }
}
