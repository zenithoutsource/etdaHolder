package com.etdawallet.mdocproximity

object ProximityEventDispatcher {
  var emitter: ((String, Map<String, Any?>) -> Unit)? = null

  fun sendDeviceEngaged() {
    emitter?.invoke("onDeviceEngaged", emptyMap())
  }

  fun sendRequestReceived(requestedFields: List<String>) {
    emitter?.invoke("onRequestReceived", mapOf("requestedFields" to requestedFields))
  }

  fun sendPresentationComplete(sharedFields: List<String>) {
    emitter?.invoke("onPresentationComplete", mapOf("sharedFields" to sharedFields))
  }

  fun sendError(code: String, message: String) {
    emitter?.invoke("onError", mapOf("code" to code, "message" to message))
  }
}
