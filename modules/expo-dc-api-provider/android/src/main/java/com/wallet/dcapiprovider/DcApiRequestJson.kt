package com.wallet.dcapiprovider

import org.json.JSONObject

data class ParsedDcApiPlatformRequest(
  val protocol: String,
  val requestJson: String,
  /** `wrapped` when the platform sent a top-level `requests[]` envelope (common on desktop QR hybrid). */
  val platformEnvelope: String,
)

object DcApiRequestJson {
  fun parse(requestJson: String): ParsedDcApiPlatformRequest? {
    return try {
      val root = JSONObject(requestJson)
      val wrapped = readWrappedRequest(root) ?: return null
      val platformEnvelope = if (root.has("requests")) "wrapped" else "flat"
      ParsedDcApiPlatformRequest(
        protocol = wrapped.protocol,
        requestJson = wrapped.requestBody.toString(),
        platformEnvelope = platformEnvelope,
      )
    } catch (_: Exception) {
      null
    }
  }

  private data class WrappedRequest(
    val protocol: String,
    val requestBody: JSONObject,
  )

  private fun readWrappedRequest(root: JSONObject): WrappedRequest? {
    val requests = root.optJSONArray("requests")
    if (requests != null) {
      return readWrappedRequestFromObject(requests.optJSONObject(0))
    }
    return readWrappedRequestFromObject(root)
  }

  private fun readWrappedRequestFromObject(value: JSONObject?): WrappedRequest? {
    if (value == null) return null

    val protocol = value.optString("protocol").trim()
    val dataObject = value.optJSONObject("data")
    if (protocol.isNotEmpty() && dataObject != null) {
      return WrappedRequest(protocol = protocol, requestBody = dataObject)
    }

    val dataString = value.optString("data").trim()
    if (protocol.isNotEmpty() && dataString.isNotEmpty()) {
      val requestBody = readSignedRequestBodyFromDataString(dataString) ?: return null
      return WrappedRequest(protocol = protocol, requestBody = requestBody)
    }

    val signedJar = value.optString("request").trim()
    if (signedJar.isNotEmpty()) {
      return WrappedRequest(
        protocol = "openid4vp-v1-signed",
        requestBody = JSONObject().put("request", signedJar),
      )
    }

    if (value.has("response_mode") || value.has("dcql_query")) {
      return WrappedRequest(
        protocol = "openid4vp-v1-unsigned",
        requestBody = value,
      )
    }

    if (value.has("payload") && value.has("signatures")) {
      return WrappedRequest(
        protocol = "openid4vp-v1-signed",
        requestBody = value,
      )
    }

    return null
  }

  private fun readSignedRequestBodyFromDataString(dataString: String): JSONObject? {
    if (dataString.startsWith("{")) {
      return try {
        JSONObject(dataString)
      } catch (_: Exception) {
        null
      }
    }

    return try {
      JSONObject().put("request", dataString)
    } catch (_: Exception) {
      null
    }
  }
}
