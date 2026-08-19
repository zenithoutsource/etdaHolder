package org.wallet.mdocnfchost

import org.multipaz.cbor.DataItem
import org.multipaz.cbor.Tagged

/** Same ISO category → Thai labels as wallet `drivingLicenceVehicleCategories.ts`. */
fun thaiVehicleTypeLabel(code: String): String {
  val trimmed = code.trim()
  if (trimmed.isEmpty()) return trimmed
  return when (trimmed.uppercase()) {
    "A" -> "รถจักรยานยนต์"
    "B" -> "รถยนต์ส่วนบุคคล"
    "C" -> "รถบรรทุก"
    "D" -> "รถโดยสาร"
    else -> trimmed
  }
}

/** Wallet rule: first `vehicle_category_code` only, then Thai. */
fun firstDrivingPrivilegeLabel(codes: Iterable<String>): String {
  val first = codes.firstOrNull { it.isNotBlank() } ?: return ""
  return thaiVehicleTypeLabel(first)
}

data class PrivilegeDisplay(
  val licenceClass: String,
  val issueDate: String? = null,
  val expiryDate: String? = null,
)

/**
 * Issued mDLs often put `issue_date` / `expiry_date` on each driving-privilege
 * entry (ISO optional on DrivingPrivilege) instead of as top-level mDL elements.
 * Requesting missing top-level dates is how Multipaz session status 20 starts.
 */
fun readPrivilegeDisplay(value: DataItem): PrivilegeDisplay {
  value.asTstrOrNull()?.let {
    return PrivilegeDisplay(licenceClass = thaiVehicleTypeLabel(it))
  }
  return try {
    val first = value.asArray.firstOrNull()
      ?: return PrivilegeDisplay(licenceClass = formatElementValue(value))
    val code = try {
      first["vehicle_category_code"].asTstrOrNull()?.takeIf { it.isNotBlank() }
    } catch (_: Exception) {
      first.asTstrOrNull()?.takeIf { it.isNotBlank() }
    }
    PrivilegeDisplay(
      licenceClass = firstDrivingPrivilegeLabel(listOfNotNull(code))
        .ifBlank { formatElementValue(value) },
      issueDate = readMapDate(first, "issue_date"),
      expiryDate = readMapDate(first, "expiry_date"),
    )
  } catch (_: Exception) {
    PrivilegeDisplay(licenceClass = formatElementValue(value))
  }
}

internal fun readMapDate(entry: DataItem, key: String): String? {
  return try {
    formatIsoDate(entry[key])
  } catch (_: Exception) {
    null
  }
}

internal fun formatIsoDate(value: DataItem): String? {
  var current = value
  repeat(4) {
    try {
      val date = current.asDateString.toString().trim()
      if (date.isNotEmpty()) return isoDatePrefix(date)
    } catch (_: Exception) {
    }
    current.asTstrOrNull()?.trim()?.takeIf { it.isNotEmpty() }?.let { return isoDatePrefix(it) }
    current = (current as? Tagged)?.taggedItem ?: return null
  }
  return null
}

internal fun formatElementValue(value: DataItem): String {
  value.asTstrOrNull()?.let { return it }
  formatIsoDate(value)?.let { return it }
  try {
    val bytes = value.asBstr
    return if (bytes.isEmpty()) "(empty)" else "(image ${bytes.size} bytes)"
  } catch (_: Exception) {
  }
  return value.toString()
}

internal fun DataItem.asTstrOrNull(): String? = try {
  asTstr
} catch (_: Exception) {
  null
}

private fun isoDatePrefix(value: String): String {
  return if (value.length >= 10 && value[4] == '-') value.take(10) else value
}
