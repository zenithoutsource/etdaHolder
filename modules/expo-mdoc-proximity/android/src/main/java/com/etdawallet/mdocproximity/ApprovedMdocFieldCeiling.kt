package com.etdawallet.mdocproximity

import org.multipaz.presentment.CredentialSelection
import org.multipaz.request.MdocRequestedClaim

/**
 * Pre-tap consent ceiling. Wallet keys are `namespace.identifier`; some tests use
 * `namespace:identifier`. Match both. Never compare claim values.
 */
object ApprovedMdocFieldCeiling {
  fun fieldKey(namespace: String, identifier: String): String = "$namespace.$identifier"

  fun contains(ceiling: Collection<String>, namespace: String, identifier: String): Boolean {
    val dotted = "$namespace.$identifier"
    val colon = "$namespace:$identifier"
    return ceiling.any { it == dotted || it == colon }
  }

  fun requestedFieldKeys(selection: CredentialSelection): List<String> =
    selection.matches.flatMap { match ->
      match.claims.keys.mapNotNull { claim ->
        val mdoc = claim as? MdocRequestedClaim ?: return@mapNotNull null
        fieldKey(mdoc.namespaceName, mdoc.dataElementName)
      }
    }

  fun extraFieldCount(ceiling: Collection<String>, selection: CredentialSelection): Int =
    selection.matches.sumOf { match ->
      match.claims.keys.count { claim ->
        val mdoc = claim as? MdocRequestedClaim ?: return@count true
        !contains(ceiling, mdoc.namespaceName, mdoc.dataElementName)
      }
    }
}
