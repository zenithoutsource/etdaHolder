package org.wallet.mdocnfchost

data class HostOmittedField(
  val key: String,
  val reason: String = "holder_declined",
)

object HostClaimDisplay {
  fun omittedFields(requested: List<String>, claims: Map<String, String>): List<HostOmittedField> =
    requested
      .filter { key -> claims[key].isNullOrBlank() }
      .map { HostOmittedField(it) }
}
