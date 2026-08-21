package com.etdawallet.mdocproximity

import org.multipaz.presentment.CredentialSelection
import org.multipaz.request.MdocRequestedClaim

data class OmittedMdocField(
  val key: String,
  val reason: String,
)

/**
 * Pre-tap consent ceiling vs holder selection. Wallet keys are `namespace.identifier`;
 * some tests use `namespace:identifier`. Match both. Never compare claim values.
 */
object ApprovedMdocFieldCeiling {
  const val REASON_HOLDER_DECLINED = "holder_declined"
  const val REASON_NOT_IN_DOCUMENT = "not_in_document"

  fun fieldKey(namespace: String, identifier: String): String = "$namespace.$identifier"

  fun splitFieldKey(key: String): Pair<String, String> {
    val colon = key.lastIndexOf(':')
    val dot = key.lastIndexOf('.')
    val sep = maxOf(colon, dot)
    if (sep <= 0) return "" to key
    return key.substring(0, sep) to key.substring(sep + 1)
  }

  fun contains(ceiling: Collection<String>, namespace: String, identifier: String): Boolean {
    val dotted = "$namespace.$identifier"
    val colon = "$namespace:$identifier"
    return ceiling.any { it == dotted || it == colon }
  }

  fun containsKey(ceiling: Collection<String>, key: String): Boolean {
    if (ceiling.contains(key)) return true
    val (namespace, identifier) = splitFieldKey(key)
    return contains(ceiling, namespace, identifier)
  }

  fun requestedFieldKeys(selection: CredentialSelection): List<String> =
    selection.matches.flatMap { match ->
      match.claims.keys.mapNotNull { claim ->
        val mdoc = claim as? MdocRequestedClaim ?: return@mapNotNull null
        fieldKey(mdoc.namespaceName, mdoc.dataElementName)
      }
    }

  fun extraIdentifierCount(ceiling: Collection<String>, requestedKeys: Collection<String>): Int =
    requestedKeys.count { key -> !containsKey(ceiling, key) }

  fun extraFieldCount(ceiling: Collection<String>, selection: CredentialSelection): Int =
    extraIdentifierCount(ceiling, requestedFieldKeys(selection))

  fun filterToApproved(
    selection: CredentialSelection,
    approved: Collection<String>,
  ): CredentialSelection =
    CredentialSelection(
      matches = selection.matches.map { match ->
        match.copy(
          claims = match.claims.filterKeys { requested ->
            val mdoc = requested as? MdocRequestedClaim ?: return@filterKeys false
            contains(approved, mdoc.namespaceName, mdoc.dataElementName)
          },
        )
      },
    )

  fun disclosedAndOmitted(
    requestedKeys: Collection<String>,
    approved: Collection<String>,
    ceiling: Collection<String>,
  ): Pair<List<String>, List<OmittedMdocField>> {
    val disclosed = requestedKeys.filter { containsKey(approved, it) }
    val omitted = requestedKeys.mapNotNull { key ->
      when {
        !containsKey(ceiling, key) -> null
        containsKey(approved, key) -> null
        else -> OmittedMdocField(key, REASON_HOLDER_DECLINED)
      }
    }
    return disclosed to omitted
  }
}
