package com.etdawallet.mdocproximity

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoMdocProximityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoMdocProximity")

    Events(
      "onDeviceEngaged",
      "onRequestReceived",
      "onPresentationComplete",
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

    AsyncFunction("deleteMdoc") { credentialId: String ->
      val context = appContext.reactContext?.applicationContext ?: return@AsyncFunction
      MdocProximityEngine.deleteMdoc(context, credentialId)
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
    }
  }

  private fun requireContext() =
    appContext.reactContext?.applicationContext
      ?: throw MdocProximityException(
        MdocProximityErrors.PROXIMITY_NOT_READY,
        "Application context is unavailable",
      )
}
