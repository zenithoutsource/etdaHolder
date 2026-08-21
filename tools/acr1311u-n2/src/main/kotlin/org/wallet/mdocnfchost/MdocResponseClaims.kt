package org.wallet.mdocnfchost

import org.multipaz.cbor.Cbor
import org.multipaz.cbor.DataItem
import org.multipaz.mdoc.issuersigned.IssuerNamespaces

data class ExtractedMdocClaims(
  val claims: Map<String, String>,
  val issuerAuth: DataItem,
)

object MdocResponseClaims {
  fun extract(deviceResponseCbor: ByteArray): ExtractedMdocClaims {
    val root = Cbor.decode(deviceResponseCbor)
    val documents = root["documents"].asArray
    if (documents.isEmpty()) {
      throw MdocPresentmentException("EMPTY_RESPONSE", "DeviceResponse contains no documents")
    }
    val issuerSigned = documents[0]["issuerSigned"]
    val nameSpaces = IssuerNamespaces.fromDataItem(issuerSigned["nameSpaces"])
    val mdl = nameSpaces.data[MDL_NAMESPACE].orEmpty()
    val claims = linkedMapOf<String, String>()

    mdl["given_name"]?.let { claims["given_name"] = formatElementValue(it.dataElementValue) }
    mdl["family_name"]?.let { claims["family_name"] = formatElementValue(it.dataElementValue) }
    mdl["birth_date"]?.let { item ->
      claims["birth_date"] = formatElementValue(item.dataElementValue)
      val birth = readBirthDate(item.dataElementValue)
      claims["age_over_18"] = if (birth != null && !birth.plusYears(18).isAfter(java.time.LocalDate.now())) {
        "ใช่"
      } else {
        "ไม่"
      }
    }

    mdl["driving_privileges"]?.let { item ->
      claims["driving_privileges"] = readPrivilegeDisplay(item.dataElementValue).licenceClass
    }
    // Top-level issue_date / expiry_date only. Nested dates on driving_privileges
    // must not fill those rows — holder decline of วันหมดอายุ would otherwise
    // still show a value whenever ประเภทใบอนุญาต was sent.
    mdl["issue_date"]?.let { claims["issue_date"] = formatElementValue(it.dataElementValue) }
    mdl["expiry_date"]?.let { claims["expiry_date"] = formatElementValue(it.dataElementValue) }

    if (claims.isEmpty()) {
      throw MdocPresentmentException("EMPTY_RESPONSE", "DeviceResponse did not include requested mDL fields")
    }
    return ExtractedMdocClaims(claims, issuerSigned["issuerAuth"])
  }

  private fun readBirthDate(value: DataItem): java.time.LocalDate? {
    return formatIsoDate(value)?.let { runCatching { java.time.LocalDate.parse(it) }.getOrNull() }
  }
}
