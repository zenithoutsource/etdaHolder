package com.etdawallet.mdocproximity

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import androidx.fragment.app.FragmentActivity
import com.etdawallet.hardwareecdsa.HardwareSigningSessionManager
import java.nio.charset.StandardCharsets
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

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

    AsyncFunction("armProximitySession") { config: Map<String, Any?>, promise: Promise ->
      try {
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
        val companionSdJwt = config["companionSdJwt"] as? String
        val armWindowMs = (config["armWindowMs"] as? Number)?.toLong() ?: 60_000L

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
            companionSdJwt = companionSdJwt,
            armedUntilMs = System.currentTimeMillis() + armWindowMs,
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

        promise.resolve(null)
      } catch (error: MdocProximityException) {
        promise.reject(error.code, error.message, error)
      } catch (error: Exception) {
        promise.reject(MdocProximityErrors.PROXIMITY_NOT_READY, error.message, error)
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

  private fun readStringList(value: Any?): List<String> {
    val items = value as? List<*> ?: return emptyList()
    return items.mapNotNull { it as? String }
  }
}
