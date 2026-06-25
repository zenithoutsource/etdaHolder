package com.etdawallet.mdocproximity

object MdocProximityErrors {
  const val NFC_UNAVAILABLE = "NFC_UNAVAILABLE"
  const val NFC_DISABLED = "NFC_DISABLED"
  const val PROXIMITY_NOT_READY = "PROXIMITY_NOT_READY"
  const val STORAGE_FAILED = "STORAGE_FAILED"
  const val CREDENTIAL_NOT_FOUND = "CREDENTIAL_NOT_FOUND"
  const val PRESENTATION_ACTIVE = "PRESENTATION_ACTIVE"
  const val PRESENTATION_INACTIVE = "PRESENTATION_INACTIVE"
  const val INVALID_ARGUMENT = "INVALID_ARGUMENT"
}

class MdocProximityException(
  val code: String,
  override val message: String,
) : Exception(message)
