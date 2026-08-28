package com.wallet.dcapiprovider

import android.content.Intent

object DcApiTransport {
  /**
   * Classifies the platform transport for logging and JS routing.
   *
   * Desktop QR hybrid still invokes the wallet through registry `GET_CREDENTIAL` with
   * `callerPackage=com.google.android.gms`. When the platform cannot be classified, this
   * returns [DcApiSessionStore.TRANSPORT_SAME_DEVICE] even for a valid cross-device run.
   */
  fun readSessionTransport(
    intent: Intent?,
    credentialOptionCount: Int,
    platformEnvelope: String,
  ): String {
    val action = intent?.action.orEmpty()
    return when {
      action.contains("identitycredentials", ignoreCase = true) -> {
        DcApiSessionStore.TRANSPORT_CROSS_DEVICE
      }
      credentialOptionCount > 1 -> {
        DcApiSessionStore.TRANSPORT_CROSS_DEVICE
      }
      platformEnvelope == "wrapped" -> {
        DcApiSessionStore.TRANSPORT_CROSS_DEVICE
      }
      else -> DcApiSessionStore.TRANSPORT_SAME_DEVICE
    }
  }
}
