package com.wallet.dcapiprovider

import org.json.JSONObject

internal object DcApiCredentialJson {
  fun toPlatformCredentialJson(responseJson: String, protocol: String): String {
    val trimmed = responseJson.trim()
    if (trimmed.isEmpty() || !trimmed.startsWith("{")) {
      return trimmed
    }

    return try {
      val root = JSONObject(trimmed)
      if (root.has("protocol") && root.has("data")) {
        return trimmed
      }

      val data = when {
        root.has("vp_token") || root.has("response") -> root
        root.has("data") -> root.getJSONObject("data")
        else -> root
      }
      JSONObject()
        .put("protocol", protocol)
        .put("data", data)
        .toString()
    } catch (_: Exception) {
      trimmed
    }
  }

  fun describeDeliveryShape(credentialJson: String): String {
    val trimmed = credentialJson.trim()
    if (trimmed.isEmpty() || !trimmed.startsWith("{")) {
      return "deliveryShape=invalid"
    }

    return try {
      val root = JSONObject(trimmed)
      val protocol = root.optString("protocol", "<missing>")
      val data = when {
        root.has("data") -> root.getJSONObject("data")
        root.has("vp_token") || root.has("response") -> root
        else -> return "deliveryShape=protocol=$protocol data=missing"
      }
      if (!data.has("vp_token")) {
        return "deliveryShape=protocol=$protocol encrypted=${data.has("response")}"
      }
      val vpToken = data.getJSONObject("vp_token")
      val keys = vpToken.keys().asSequence().toList()
      val shapes = keys.joinToString(",") { key ->
        val value = vpToken.get(key)
        val shape = when (value) {
          is org.json.JSONArray -> "array(len=${value.length()})"
          is String -> "string"
          else -> value.javaClass.simpleName
        }
        "$key=$shape"
      }
      "deliveryShape=protocol=$protocol vpToken=[$shapes]"
    } catch (_: Exception) {
      "deliveryShape=unparseable"
    }
  }
}
