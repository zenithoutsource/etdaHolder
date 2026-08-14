package org.wallet.mdocnfchost

const val MDL_DOCTYPE = "org.iso.18013.5.1.mDL"
const val MDL_NAMESPACE = "org.iso.18013.5.1"
const val ISO_MDOC_AID_HEX = "A0000002480400"
const val DEFAULT_HOST = "127.0.0.1"
const val DEFAULT_PORT = 8787
const val DEFAULT_TAP_TIMEOUT_MS = 90_000L

val MDL_REQUEST_FIELDS = listOf("family_name", "given_name", "birth_date")
