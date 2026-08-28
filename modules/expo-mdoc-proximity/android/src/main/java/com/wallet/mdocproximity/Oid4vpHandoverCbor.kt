package com.wallet.mdocproximity

import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.Simple
import org.multipaz.cbor.buildCborArray
import java.security.MessageDigest

object Oid4vpHandoverCbor {
  private const val HANDOVER_LABEL = "OpenID4VPHandover"

  fun buildHandover(
    clientId: String,
    nonce: String,
    jwkThumbprint: ByteArray?,
    responseUri: String,
  ): ByteArray {
    val infoBytes = Cbor.encode(
      buildCborArray {
        add(clientId)
        add(nonce)
        add(jwkThumbprint?.let(::Bstr) ?: Simple.NULL)
        add(responseUri)
      },
    )
    return Cbor.encode(
      buildCborArray {
        add(HANDOVER_LABEL)
        add(Bstr(MessageDigest.getInstance("SHA-256").digest(infoBytes)))
      },
    )
  }
}
