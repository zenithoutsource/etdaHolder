package com.etdawallet.hardwareecdsa

import org.json.JSONArray
import org.json.JSONObject

internal object StrongBoxKeyMintProbeReporter {
  const val TAG = "StrongBoxKeyMintProbe"
  const val REPORT_JSON_PREFIX = "REPORT_JSON:"

  fun log(result: Map<String, Any?>) {
    val exceptionClass = result["strongBoxUnavailableExceptionClass"] as? String
    val exceptionMessage = result["strongBoxUnavailableExceptionMessage"] as? String
    if (exceptionClass != null) {
      LogProbe.i("$exceptionClass: ${exceptionMessage ?: "no-message"}")
    }

    val walletExceptionClass = result["walletSpecStrongBoxUnavailableExceptionClass"] as? String
    val walletExceptionMessage = result["walletSpecStrongBoxUnavailableExceptionMessage"] as? String
    if (walletExceptionClass != null) {
      LogProbe.i("wallet-spec $walletExceptionClass: ${walletExceptionMessage ?: "no-message"}")
    }

    LogProbe.i("$REPORT_JSON_PREFIX${mapToJson(result)}")
  }

  private fun mapToJson(value: Map<String, Any?>): String = JSONObject(value.mapValues { (_, entry) -> toJsonValue(entry) }).toString()

  private fun toJsonValue(value: Any?): Any =
    when (value) {
      null -> JSONObject.NULL
      is Boolean, is Int, is Long, is Double, is Float -> value
      is String -> value
      is Map<*, *> -> {
        val mapped =
          value.entries.associate { (key, entry) ->
            key.toString() to toJsonValue(entry)
          }
        JSONObject(mapped)
      }
      is List<*> -> JSONArray(value.map { toJsonValue(it) })
      else -> value.toString()
    }

  private object LogProbe {
    fun i(message: String) {
      android.util.Log.i(TAG, message)
    }
  }
}
