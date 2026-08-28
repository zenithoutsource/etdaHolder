package com.wallet.dcapiprovider

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.credentials.DigitalCredential
import androidx.credentials.ExperimentalDigitalCredentialApi
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetDigitalCredentialOption
import androidx.credentials.provider.PendingIntentHandler
import androidx.credentials.provider.ProviderGetCredentialRequest
import androidx.credentials.registry.provider.selectedEntryId
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

private const val LOG_TAG = "DcApiProvider"

@OptIn(ExperimentalDigitalCredentialApi::class)
class GetCredentialActivity : ComponentActivity(), DcApiSessionDeliveryHost {
  private var activeSessionId: String? = null
  private var activeProtocol: String? = null
  private var activeTransport: String = DcApiSessionStore.TRANSPORT_SAME_DEVICE
  private var responseDelivered = false
  private var pendingCredentialJson: String? = null

  override val sessionId: String
    get() = activeSessionId.orEmpty()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    Log.i(LOG_TAG, "GetCredentialActivity onCreate")

    val providerRequest = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
    if (providerRequest == null) {
      Log.e(LOG_TAG, "missing ProviderGetCredentialRequest")
      setResult(Activity.RESULT_CANCELED)
      finish()
      return
    }

    lifecycleScope.launch {
      handleProviderRequest(providerRequest)
    }
  }

  override fun onResume() {
    super.onResume()
    val pending = pendingCredentialJson ?: return
    if (responseDelivered || activeTransport != DcApiSessionStore.TRANSPORT_CROSS_DEVICE) return
    pendingCredentialJson = null
    Log.i(
      LOG_TAG,
      "flushing deferred cross-device delivery sessionId=$activeSessionId resumed=true",
    )
    performCredentialDelivery(pending)
  }

  override fun onStop() {
    super.onStop()
    Log.i(
      LOG_TAG,
      "GetCredentialActivity onStop sessionId=$activeSessionId transport=$activeTransport delivered=$responseDelivered finishing=$isFinishing resumed=${lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)}",
    )
  }

  override fun onDestroy() {
    Log.i(
      LOG_TAG,
      "GetCredentialActivity onDestroy sessionId=$activeSessionId transport=$activeTransport delivered=$responseDelivered finishing=$isFinishing",
    )
    super.onDestroy()
  }

  private suspend fun handleProviderRequest(providerRequest: ProviderGetCredentialRequest) {
    val digitalOption = providerRequest.credentialOptions
      .filterIsInstance<GetDigitalCredentialOption>()
      .firstOrNull()

    if (digitalOption == null) {
      Log.e(LOG_TAG, "missing GetDigitalCredentialOption")
      setResult(Activity.RESULT_CANCELED)
      finish()
      return
    }

    val parsedRequest = DcApiRequestJson.parse(digitalOption.requestJson)
    if (parsedRequest == null) {
      Log.e(LOG_TAG, "unsupported digital credential request JSON")
      setResult(Activity.RESULT_CANCELED)
      finish()
      return
    }

    val protocol = parsedRequest.protocol
    if (protocol != "openid4vp-v1-unsigned" && protocol != "openid4vp-v1-signed") {
      Log.e(LOG_TAG, "unsupported protocol: $protocol")
      setResult(Activity.RESULT_CANCELED)
      finish()
      return
    }

    val origin = readRequestOrigin(providerRequest)
    if (!origin.startsWith("https://")) {
      Log.e(
        LOG_TAG,
        "invalid origin for DC API request callerPackage=${readCallingPackage(providerRequest)} origin=${origin.ifEmpty { "<empty>" }}",
      )
      setResult(Activity.RESULT_CANCELED)
      finish()
      return
    }

    val selectedCredentialId = readSelectedCredentialId(providerRequest)
    val credentialOptionCount = providerRequest.credentialOptions.size
    val transport = DcApiTransport.readSessionTransport(
      intent,
      credentialOptionCount,
      parsedRequest.platformEnvelope,
    )

    Log.i(
      LOG_TAG,
      "incoming provider request origin=$origin protocol=$protocol transport=$transport platformEnvelope=${parsedRequest.platformEnvelope} selectedCredentialId=$selectedCredentialId credentialOptionCount=$credentialOptionCount callerPackage=${readCallingPackage(providerRequest)} intentAction=${intent.action.orEmpty()}",
    )

    val session = DcApiSessionStore.createSession(
      protocol = protocol,
      origin = origin,
      requestJson = parsedRequest.requestJson,
      selectedCredentialId = selectedCredentialId,
      transport = transport,
    )
    activeSessionId = session.sessionId
    activeProtocol = protocol
    activeTransport = transport
    responseDelivered = false
    DcApiSessionStore.registerDeliveryHost(this@GetCredentialActivity)

    try {
      DcApiSessionStore.emitPresentationRequest(session)
      // Keep GetCredentialActivity alive for desktop QR hybrid; flat cross-device requests are
      // indistinguishable from same-device at this boundary (credentialOptionCount=1, GMS caller).
      bringWalletToForeground(clearTask = false)

      val result = DcApiSessionStore.awaitSessionResult(session)
      if (!responseDelivered) {
        when (result.outcome) {
          DcApiSessionOutcome.COMPLETED -> {
            val responseJson = result.responseJson.orEmpty()
            if (responseJson.isBlank()) {
              setResult(Activity.RESULT_CANCELED)
              finish()
              return
            }
            if (!deliverCredentialResponse(responseJson)) {
              Log.e(
                LOG_TAG,
                "awaitSessionResult delivery failed sessionId=${session.sessionId} transport=$activeTransport finishing=$isFinishing destroyed=$isDestroyed",
              )
              setResult(Activity.RESULT_CANCELED)
              finish()
            }
          }
          DcApiSessionOutcome.CANCELLED,
          DcApiSessionOutcome.TIMED_OUT,
          -> {
            Log.i(LOG_TAG, "session ended: ${result.outcome} ${result.reason.orEmpty()}")
            setResult(Activity.RESULT_CANCELED)
            finish()
          }
        }
      }
    } finally {
      DcApiSessionStore.unregisterDeliveryHost(session.sessionId)
      activeSessionId = null
      activeProtocol = null
      activeTransport = DcApiSessionStore.TRANSPORT_SAME_DEVICE
    }
  }

  override fun deliverCredentialResponse(responseJson: String): Boolean {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      if (isFinishing || isDestroyed) {
        Log.w(LOG_TAG, "deliverCredentialResponse skipped off-main finishing=$isFinishing destroyed=$isDestroyed")
        return responseDelivered
      }
      val delivered = java.util.concurrent.CountDownLatch(1)
      var result = false
      runOnUiThread {
        result = deliverCredentialResponseOnMainThread(responseJson)
        delivered.countDown()
      }
      delivered.await()
      return waitForCrossDeviceDeliveryIfNeeded(result)
    }
    return waitForCrossDeviceDeliveryIfNeeded(deliverCredentialResponseOnMainThread(responseJson))
  }

  private fun waitForCrossDeviceDeliveryIfNeeded(initialResult: Boolean): Boolean {
    if (initialResult || responseDelivered) return true
    if (activeTransport != DcApiSessionStore.TRANSPORT_CROSS_DEVICE) return false
    if (Looper.myLooper() == Looper.getMainLooper()) return responseDelivered

    val deadline = SystemClock.uptimeMillis() + 10_000L
    while (!responseDelivered && SystemClock.uptimeMillis() < deadline) {
      try {
        Thread.sleep(50)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
        break
      }
    }
    if (!responseDelivered) {
      Log.e(
        LOG_TAG,
        "cross-device delivery timed out waiting for resumed activity sessionId=$activeSessionId",
      )
      pendingCredentialJson = null
    }
    return responseDelivered
  }

  private fun deliverCredentialResponseOnMainThread(responseJson: String): Boolean {
    if (responseDelivered || isFinishing || isDestroyed) {
      Log.w(
        LOG_TAG,
        "deliverCredentialResponse skipped delivered=$responseDelivered finishing=$isFinishing destroyed=$isDestroyed",
      )
      return responseDelivered
    }
    if (responseJson.isBlank()) {
      Log.e(LOG_TAG, "deliverCredentialResponse rejected blank response")
      return false
    }

    val protocol = activeProtocol.orEmpty()
    val credentialJson = if (protocol.isBlank()) {
      responseJson.trim()
    } else {
      DcApiCredentialJson.toPlatformCredentialJson(responseJson, protocol)
    }
    if (credentialJson.isBlank()) {
      Log.e(LOG_TAG, "deliverCredentialResponse rejected empty normalized response")
      return false
    }

    if (
      activeTransport == DcApiSessionStore.TRANSPORT_CROSS_DEVICE &&
      !lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
    ) {
      Log.i(
        LOG_TAG,
        "deferring cross-device delivery until GetCredentialActivity resumes sessionId=$activeSessionId ${DcApiCredentialJson.describeDeliveryShape(credentialJson)}",
      )
      pendingCredentialJson = credentialJson
      reorderCredentialActivityToFront()
      scheduleCrossDeviceDeliveryWhenResumed(credentialJson)
      return false
    }

    return performCredentialDelivery(credentialJson)
  }

  private fun scheduleCrossDeviceDeliveryWhenResumed(credentialJson: String) {
    lifecycleScope.launch {
      var waitedMs = 0
      while (waitedMs < 10_000 && !responseDelivered && !isDestroyed && !isFinishing) {
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
          if (pendingCredentialJson != null) {
            pendingCredentialJson = null
            performCredentialDelivery(credentialJson)
          }
          return@launch
        }
        delay(50)
        waitedMs += 50
      }
      if (!responseDelivered) {
        Log.e(
          LOG_TAG,
          "cross-device delivery timed out in resume scheduler sessionId=$activeSessionId",
        )
        pendingCredentialJson = null
      }
    }
  }

  private fun performCredentialDelivery(credentialJson: String): Boolean {
    if (responseDelivered || isFinishing || isDestroyed) {
      return responseDelivered
    }

    return try {
      val credential = DigitalCredential(credentialJson)
      val resultData = Intent()
      PendingIntentHandler.setGetCredentialResponse(
        resultData,
        GetCredentialResponse(credential),
      )
      responseDelivered = true
      setResult(Activity.RESULT_OK, resultData)
      Log.i(
        LOG_TAG,
        "deliverCredentialResponse success sessionId=$activeSessionId transport=$activeTransport credentialJsonLength=${credentialJson.length} ${DcApiCredentialJson.describeDeliveryShape(credentialJson)} resumed=${lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)}",
      )
      finish()
      true
    } catch (error: Exception) {
      Log.e(LOG_TAG, "deliverCredentialResponse failed", error)
      false
    }
  }

  private fun reorderCredentialActivityToFront() {
    val intent = Intent(this, GetCredentialActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    Log.i(
      LOG_TAG,
      "reorderCredentialActivityToFront sessionId=$activeSessionId transport=$activeTransport",
    )
    startActivity(intent)
  }

  override fun finishWithCancel(reason: String) {
    if (responseDelivered || isFinishing || isDestroyed) return
    Log.i(LOG_TAG, "finishWithCancel reason=$reason sessionId=$activeSessionId")
    setResult(Activity.RESULT_CANCELED)
    finish()
  }

  private fun readSelectedCredentialId(providerRequest: ProviderGetCredentialRequest): String? {
    val raw = providerRequest.selectedEntryId?.trim().orEmpty()
    if (raw.isEmpty()) return null

    return try {
      val json = JSONObject(raw)
      json.optString("id").trim().ifEmpty { null }
    } catch (_: Exception) {
      raw
    }
  }

  private fun readRequestOrigin(providerRequest: ProviderGetCredentialRequest): String {
    return try {
      var origin = providerRequest.callingAppInfo
        .getOrigin(DcApiPrivilegedAllowlist.readJson(this))
        ?.trim()
        .orEmpty()
      if (origin.endsWith(":443")) {
        origin = origin.removeSuffix(":443")
        Log.i(LOG_TAG, "normalized request origin by stripping :443 suffix")
      }
      origin
    } catch (error: Exception) {
      Log.e(LOG_TAG, "readRequestOrigin failed callerPackage=${readCallingPackage(providerRequest)}", error)
      ""
    }
  }

  private fun readCallingPackage(providerRequest: ProviderGetCredentialRequest): String {
    return try {
      providerRequest.callingAppInfo.packageName
    } catch (_: Exception) {
      "<unknown>"
    }
  }

  private fun bringWalletToForeground(clearTask: Boolean = true) {
    val component = packageManager.getLaunchIntentForPackage(packageName)?.component
    if (component == null) {
      Log.w(LOG_TAG, "bringWalletToForeground skipped: launch component missing")
      return
    }

    // Never reuse the launcher intent: it carries FLAG_ACTIVITY_NEW_TASK, which can orphan
    // GetCredentialActivity during cross-device hybrid and prevent Credential Manager delivery.
    var flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    if (clearTask) {
      flags = flags or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val intent = Intent(Intent.ACTION_MAIN).apply {
      setComponent(component)
      addCategory(Intent.CATEGORY_LAUNCHER)
      addFlags(flags)
    }
    Log.i(
      LOG_TAG,
      "bringWalletToForeground clearTask=$clearTask transport=$activeTransport sessionId=$activeSessionId",
    )
    startActivity(intent)
  }
}
