package com.wallet.dcapiprovider

import android.util.Log
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

private const val LOG_TAG = "DcApiProvider"

enum class DcApiSessionOutcome {
  COMPLETED,
  CANCELLED,
  TIMED_OUT,
}

enum class DcApiSessionCompleteResult {
  DELIVERED,
  AWAITING_DELIVERY,
  NOT_FOUND,
  DELIVERY_FAILED,
}

data class DcApiSessionResult(
  val outcome: DcApiSessionOutcome,
  val responseJson: String? = null,
  val reason: String? = null,
)

data class PendingDcApiSession(
  val sessionId: String,
  val protocol: String,
  val origin: String,
  val requestJson: String,
  val selectedCredentialId: String?,
  val transport: String,
  val completion: CompletableDeferred<DcApiSessionResult>,
)

interface DcApiSessionDeliveryHost {
  val sessionId: String
  fun deliverCredentialResponse(responseJson: String): Boolean
  fun finishWithCancel(reason: String)
}

object DcApiSessionStore {
  private const val SESSION_TIMEOUT_MS = 120_000L

  val providerScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  private val sessions = ConcurrentHashMap<String, PendingDcApiSession>()
  private val undeliveredToJs = ConcurrentHashMap.newKeySet<String>()
  private val deliveryHosts = ConcurrentHashMap<String, DcApiSessionDeliveryHost>()

  @Volatile
  var eventEmitter: ((String, Map<String, Any?>) -> Unit)? = null

  fun createSession(
    protocol: String,
    origin: String,
    requestJson: String,
    selectedCredentialId: String?,
    transport: String,
  ): PendingDcApiSession {
    val session = PendingDcApiSession(
      sessionId = UUID.randomUUID().toString(),
      protocol = protocol,
      origin = origin,
      requestJson = requestJson,
      selectedCredentialId = selectedCredentialId,
      transport = transport,
      completion = CompletableDeferred(),
    )
    sessions[session.sessionId] = session
    return session
  }

  fun readSession(sessionId: String): PendingDcApiSession? = sessions[sessionId]

  fun registerDeliveryHost(host: DcApiSessionDeliveryHost) {
    deliveryHosts[host.sessionId] = host
  }

  fun unregisterDeliveryHost(sessionId: String) {
    deliveryHosts.remove(sessionId)
  }

  fun emitPresentationRequest(session: PendingDcApiSession) {
    undeliveredToJs.add(session.sessionId)
    val emitter = eventEmitter ?: return
    emitPresentationRequestNow(session, emitter)
  }

  fun drainUndeliveredPresentationRequests(): List<Map<String, Any?>> {
    val drained = mutableListOf<Map<String, Any?>>()
    for (sessionId in undeliveredToJs.toList()) {
      val session = sessions[sessionId]
      if (session == null) {
        undeliveredToJs.remove(sessionId)
        continue
      }
      undeliveredToJs.remove(sessionId)
      drained.add(sessionToEventMap(session))
    }
    return drained
  }

  private fun sessionToEventMap(session: PendingDcApiSession): Map<String, Any?> {
    return mapOf(
      "sessionId" to session.sessionId,
      "protocol" to session.protocol,
      "origin" to session.origin,
      "request" to session.requestJson,
      "selectedCredentialId" to session.selectedCredentialId,
      "transport" to session.transport,
    )
  }

  private fun emitPresentationRequestNow(
    session: PendingDcApiSession,
    emitter: (String, Map<String, Any?>) -> Unit,
  ) {
    val payload = sessionToEventMap(session)
    emitter.invoke("onDcApiPresentationRequest", payload)
    if (session.transport == TRANSPORT_CROSS_DEVICE) {
      emitter.invoke("onDcApiCrossDeviceSession", payload)
    }
  }

  const val TRANSPORT_SAME_DEVICE = "same_device"
  const val TRANSPORT_CROSS_DEVICE = "cross_device"

  fun completeSession(sessionId: String, responseJson: String): DcApiSessionCompleteResult {
    undeliveredToJs.remove(sessionId)
    val session = sessions.remove(sessionId) ?: return DcApiSessionCompleteResult.NOT_FOUND
    val credentialJson = DcApiCredentialJson.toPlatformCredentialJson(responseJson, session.protocol)
    val result = DcApiSessionResult(
      outcome = DcApiSessionOutcome.COMPLETED,
      responseJson = credentialJson,
    )
    val host = deliveryHosts[sessionId]
    if (host != null) {
      val delivered = host.deliverCredentialResponse(credentialJson)
      session.completion.complete(result)
      if (delivered) {
        Log.i(
          LOG_TAG,
          "session delivered to Credential Manager sessionId=$sessionId transport=${session.transport}",
        )
        return DcApiSessionCompleteResult.DELIVERED
      }
      Log.e(
        LOG_TAG,
        "session delivery failed sessionId=$sessionId transport=${session.transport}",
      )
      return DcApiSessionCompleteResult.DELIVERY_FAILED
    }

    session.completion.complete(result)
    Log.w(
      LOG_TAG,
      "session completed awaiting activity delivery sessionId=$sessionId transport=${session.transport}",
    )
    return DcApiSessionCompleteResult.AWAITING_DELIVERY
  }

  fun cancelSession(sessionId: String, reason: String): Boolean {
    undeliveredToJs.remove(sessionId)
    val session = sessions.remove(sessionId) ?: return false
    val host = deliveryHosts[sessionId]
    host?.finishWithCancel(reason)
    session.completion.complete(
      DcApiSessionResult(
        outcome = DcApiSessionOutcome.CANCELLED,
        reason = reason,
      ),
    )
    return true
  }

  suspend fun awaitSessionResult(session: PendingDcApiSession): DcApiSessionResult {
    val result = withTimeoutOrNull(SESSION_TIMEOUT_MS) {
      session.completion.await()
    }
    sessions.remove(session.sessionId)
    return result ?: DcApiSessionResult(
      outcome = DcApiSessionOutcome.TIMED_OUT,
      reason = "DcApiSessionTimedOut",
    )
  }
}
