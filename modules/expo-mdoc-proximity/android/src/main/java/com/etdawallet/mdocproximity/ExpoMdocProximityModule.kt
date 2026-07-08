package com.etdawallet.mdocproximity

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.nio.charset.StandardCharsets

class ExpoMdocProximityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMdocProximity")

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

    AsyncFunction("storeMdoc") { credentialId: String, docType: String, mdocBytes: ByteArray ->
      val context = requireContext()
      MdocProximityEngine.storeMdoc(context, credentialId, docType, mdocBytes)
    }

    AsyncFunction("hasMdoc") { credentialId: String ->
      val context = appContext.reactContext?.applicationContext ?: return@AsyncFunction false
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
        val approvedFields = (config["approvedMdocFields"] as? List<*>)
          ?.mapNotNull { it as? String }
          ?: emptyList()
        val companionSdJwt = config["companionSdJwt"] as? String
        val armWindowMs = (config["armWindowMs"] as? Number)?.toLong() ?: 60_000L

        EtdaCompanionSession.arm(
          ProximityArmState(
            credentialId = credentialId,
            sharingMode = sharingMode,
            profileId = profileId,
            approvedMdocFields = approvedFields,
            companionSdJwt = companionSdJwt,
            armedUntilMs = System.currentTimeMillis() + armWindowMs,
          ),
        )

        EtdaCompanionSession.onCompanionSignRequested = { nonce ->
          sendEvent(
            "onCompanionSignRequested",
            mapOf("nonceBase64Url" to android.util.Base64.encodeToString(nonce, android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING)),
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
        EtdaCompanionSession.storeCompanionResponse(bytes)
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
      EtdaCompanionSession.disarm()
    }

    AsyncFunction("approvePresentation") { requestedFields: List<String>, promise: Promise ->
      promise.reject(
        MdocProximityErrors.PROXIMITY_NOT_READY,
        "approvePresentation is not wired until NFC engagement is available",
        null,
      )
    }

    AsyncFunction("denyPresentation") {
      MdocProximityEngine.stopProximityPresentation()
      EtdaCompanionSession.disarm()
    }
  }

  private fun requireContext() =
    appContext.reactContext?.applicationContext
      ?: throw MdocProximityException(
        MdocProximityErrors.PROXIMITY_NOT_READY,
        "Application context is unavailable",
      )
}
