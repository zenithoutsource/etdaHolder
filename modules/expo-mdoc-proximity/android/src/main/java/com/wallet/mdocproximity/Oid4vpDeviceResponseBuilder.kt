package com.wallet.mdocproximity

import com.etdawallet.mdocproximity.MdocIssuerAuthX5Chain
import com.etdawallet.mdocproximity.MdocIssuerSignedExtractor
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.Simple
import org.multipaz.cbor.buildCborArray
import org.multipaz.crypto.EcPublicKey

object Oid4vpDeviceResponseBuilder {
  @Suppress("UNUSED_PARAMETER")
  suspend fun build(
    mdocBytes: ByteArray,
    storedDocType: String?,
    approvedNamespaceKeys: List<String>,
    clientId: String,
    nonce: String,
    responseUri: String,
    encryptionJwkJson: String?,
    publicKey: EcPublicKey,
    sign: suspend (ByteArray) -> ByteArray,
  ): ByteArray {
    require(mdocBytes.isNotEmpty()) { "Stored mDOC bytes are required" }
    require(approvedNamespaceKeys.isNotEmpty()) { "Approved namespace keys are required" }
    require(clientId.isNotBlank()) { "OID4VP client_id is required" }
    require(nonce.isNotBlank()) { "OID4VP nonce is required" }
    require(responseUri.isNotBlank()) { "OID4VP response_uri is required" }

    val (docType, issuerSignedBytes) = MdocIssuerSignedExtractor.extractForPresentation(
      mdocBytes,
      storedDocType,
    )
    MdocIssuerAuthX5Chain.requireX5Chain(issuerSignedBytes)
    val filteredIssuerSigned = MdocManualDeviceResponseBuilder.filterIssuerSigned(
      issuerSignedBytes,
      approvedNamespaceKeys,
    )
    val thumbprint = encryptionJwkJson?.let { jwk ->
      DcApiHandoverCbor.sha256ThumbprintOfJwk(jwk)
        ?: throw IllegalArgumentException("OID4VP encryption JWK is invalid")
    }
    val sessionTranscript = buildCborArray {
      add(Simple.NULL)
      add(Simple.NULL)
      add(
        Cbor.decode(
          Oid4vpHandoverCbor.buildHandover(
            clientId = clientId,
            nonce = nonce,
            jwkThumbprint = thumbprint,
            responseUri = responseUri,
          ),
        ),
      )
    }

    return MdocManualDeviceResponseBuilder.build(
      docType = docType,
      issuerSignedBytes = filteredIssuerSigned,
      sessionTranscript = sessionTranscript,
      sign = sign,
    )
  }
}
