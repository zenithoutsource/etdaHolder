package com.wallet.dcapiprovider

import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val LOG_TAG = "DcApiProvider"

class ExpoDcApiProviderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoDcApiProvider")

    OnCreate {
      DcApiSessionStore.eventEmitter = { eventName, payload ->
        sendEvent(eventName, payload)
      }
    }

    OnDestroy {
      DcApiSessionStore.eventEmitter = null
    }

    Events(
      "onDcApiPresentationRequest",
      "onDcApiCrossDeviceSession",
    )

    AsyncFunction("syncDcApiRegistryPayload") { options: Map<String, Any?>, promise: Promise ->
      val context = appContext.reactContext?.applicationContext
      if (context == null) {
        promise.reject("DcApiProviderUnavailable", "ReactContextUnavailable", null)
        return@AsyncFunction
      }

      val registryPayloadBase64 = options["registryPayloadBase64"] as? String
      if (registryPayloadBase64.isNullOrBlank()) {
        promise.reject("DcApiRegistryPayloadInvalid", "registryPayloadBase64 is required", null)
        return@AsyncFunction
      }

      try {
        val registeredCount = DcApiRegistrySync.syncRegistry(context, registryPayloadBase64)
        if (registeredCount == 0) {
          Log.w(LOG_TAG, "syncDcApiRegistryPayload skipped because payload decoded empty")
        }
        promise.resolve(registeredCount)
      } catch (error: Exception) {
        Log.e(LOG_TAG, "syncDcApiRegistryPayload failed", error)
        promise.reject("DcApiRegistrySyncFailed", error.message, error)
      }
    }

    AsyncFunction("completeDcApiSession") { sessionId: String, responseJson: String, promise: Promise ->
      when (DcApiSessionStore.completeSession(sessionId, responseJson)) {
        DcApiSessionCompleteResult.DELIVERED,
        DcApiSessionCompleteResult.AWAITING_DELIVERY,
        -> promise.resolve(null)
        DcApiSessionCompleteResult.NOT_FOUND -> {
          promise.reject("DcApiSessionNotFound", "SessionNotFound", null)
        }
        DcApiSessionCompleteResult.DELIVERY_FAILED -> {
          promise.reject(
            "DcApiDeliveryFailed",
            "CredentialManagerDeliveryFailed",
            null,
          )
        }
      }
    }

    AsyncFunction("cancelDcApiSession") { sessionId: String, reason: String, promise: Promise ->
      val cancelled = DcApiSessionStore.cancelSession(sessionId, reason)
      if (!cancelled) {
        promise.reject("DcApiSessionNotFound", "SessionNotFound", null)
        return@AsyncFunction
      }
      promise.resolve(null)
    }

    AsyncFunction("pullPendingDcApiPresentationRequests") { promise: Promise ->
      try {
        val pending = DcApiSessionStore.drainUndeliveredPresentationRequests()
        if (pending.isNotEmpty()) {
          Log.i(LOG_TAG, "pullPendingDcApiPresentationRequests count=${pending.size}")
        }
        promise.resolve(pending)
      } catch (error: Exception) {
        Log.e(LOG_TAG, "pullPendingDcApiPresentationRequests failed", error)
        promise.reject("DcApiPendingPullFailed", error.message, error)
      }
    }
  }
}
