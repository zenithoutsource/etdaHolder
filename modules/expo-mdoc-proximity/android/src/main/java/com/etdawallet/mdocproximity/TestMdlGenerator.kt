package com.etdawallet.mdocproximity

import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.multipaz.asn1.ASN1Integer
import org.multipaz.cbor.Bstr
import org.multipaz.cbor.Cbor
import org.multipaz.cbor.RawCbor
import org.multipaz.cbor.Tagged
import org.multipaz.cbor.Tstr
import org.multipaz.cbor.buildCborMap
import org.multipaz.cbor.toDataItem
import org.multipaz.cbor.toDataItemFullDate
import org.multipaz.cose.Cose
import org.multipaz.cose.CoseLabel
import org.multipaz.cose.CoseNumberLabel
import org.multipaz.crypto.Algorithm
import org.multipaz.crypto.AsymmetricKey
import org.multipaz.crypto.Crypto
import org.multipaz.crypto.EcCurve
import org.multipaz.crypto.EcPublicKey
import org.multipaz.crypto.EcPublicKeyDoubleCoordinate
import org.multipaz.crypto.EcPublicKeyOkp
import org.multipaz.crypto.X500Name
import org.multipaz.crypto.X509CertChain
import org.multipaz.mdoc.issuersigned.buildIssuerNamespaces
import org.multipaz.mdoc.mso.MobileSecurityObjectGenerator
import org.multipaz.mdoc.util.MdocUtil
import org.multipaz.util.fromBase64Url
import kotlin.time.Clock
import kotlin.time.Duration.Companion.days
import kotlin.time.ExperimentalTime

/** Debug-only TEST mDL issuer. Never bundled as a production IACA. */
object TestMdlGenerator {
  const val DOCTYPE = "org.iso.18013.5.1.mDL"
  const val NAMESPACE = "org.iso.18013.5.1"

  @OptIn(ExperimentalTime::class)
  suspend fun generate(devicePublicKey: EcPublicKey): ByteArray {
    val now = Clock.System.now()
    val signedAt = kotlin.time.Instant.fromEpochSeconds(now.epochSeconds, 0)
    val validFrom = signedAt
    val validUntil = signedAt + (5 * 365).days

    val iacaPrivate = Crypto.createEcPrivateKey(EcCurve.P256)
    val iacaAnonymous = AsymmetricKey.anonymous(iacaPrivate)
    val iacaCert = MdocUtil.generateIacaCertificate(
      iacaAnonymous,
      X500Name.fromName("CN=Wallet TEST IACA,C=ZZ"),
      ASN1Integer.fromRandom(128),
      validFrom,
      validUntil,
      "http://127.0.0.1:8787/test-iaca",
      "http://127.0.0.1:8787/test-iaca.crl",
    )
    val iacaCertified = AsymmetricKey.X509CertifiedExplicit(
      certChain = X509CertChain(listOf(iacaCert)),
      privateKey = iacaPrivate,
    )
    val dsPrivate = Crypto.createEcPrivateKey(EcCurve.P256)
    val dsCert = MdocUtil.generateDsCertificate(
      iacaCertified,
      dsPrivate.publicKey,
      X500Name.fromName("CN=Wallet TEST DS,C=ZZ"),
      ASN1Integer.fromRandom(128),
      validFrom,
      validUntil,
    )

    val issuerNamespaces = buildIssuerNamespaces {
      addNamespace(NAMESPACE) {
        addDataElement("family_name", Tstr("TEST"))
        addDataElement("given_name", Tstr("HOLDER"))
        addDataElement("birth_date", LocalDate.parse("1990-01-01").toDataItemFullDate())
        addDataElement("issuing_country", Tstr("TH"))
        addDataElement("issue_date", LocalDate.parse("2024-01-01").toDataItemFullDate())
        addDataElement("expiry_date", LocalDate.parse("2034-01-01").toDataItemFullDate())
      }
    }

    val msoGenerator = MobileSecurityObjectGenerator(Algorithm.SHA256, DOCTYPE, devicePublicKey)
    msoGenerator.setValidityInfo(signedAt, validFrom, validUntil, null)
    msoGenerator.addValueDigests(issuerNamespaces)
    val taggedEncodedMso = Cbor.encode(Tagged(24, Bstr(msoGenerator.generate())))

    val protectedHeaders = mapOf<CoseLabel, org.multipaz.cbor.DataItem>(
      CoseNumberLabel(Cose.COSE_LABEL_ALG) to
        dsPrivate.curve.defaultSigningAlgorithm.coseAlgorithmIdentifier!!.toDataItem(),
    )
    val unprotectedHeaders = mapOf<CoseLabel, org.multipaz.cbor.DataItem>(
      CoseNumberLabel(Cose.COSE_LABEL_X5CHAIN) to
        X509CertChain(listOf(dsCert, iacaCert)).toDataItem(),
    )
    val encodedIssuerAuth = Cbor.encode(
      Cose.coseSign1Sign(
        dsPrivate,
        taggedEncodedMso,
        true,
        dsPrivate.curve.defaultSigningAlgorithm,
        protectedHeaders,
        unprotectedHeaders,
      ).toDataItem(),
    )
    val issuerSigned = Cbor.encode(
      buildCborMap {
        put("nameSpaces", issuerNamespaces.toDataItem())
        put("issuerAuth", RawCbor(encodedIssuerAuth))
      },
    )
    return Cbor.encode(
      buildCborMap {
        put("docType", DOCTYPE)
        put("issuerSigned", RawCbor(issuerSigned))
      },
    )
  }

  fun parseDevicePublicJwk(json: String): EcPublicKey {
    val obj = Json.parseToJsonElement(json) as? JsonObject
      ?: throw IllegalArgumentException("device JWK must be a JSON object")
    val kty = obj["kty"]?.jsonPrimitive?.content
    val crv = obj["crv"]?.jsonPrimitive?.content
    if (kty == "EC" && crv == "P-256") {
      val x = obj["x"]?.jsonPrimitive?.content?.fromBase64Url()
        ?: throw IllegalArgumentException("P-256 JWK is missing x")
      val y = obj["y"]?.jsonPrimitive?.content?.fromBase64Url()
        ?: throw IllegalArgumentException("P-256 JWK is missing y")
      return EcPublicKeyDoubleCoordinate(EcCurve.P256, x, y)
    }
    if (kty == "OKP" && (crv == "Ed25519" || crv == "EdDSA")) {
      val x = obj["x"]?.jsonPrimitive?.content?.fromBase64Url()
        ?: throw IllegalArgumentException("Ed25519 JWK is missing x")
      return EcPublicKeyOkp(EcCurve.ED25519, x)
    }
    throw IllegalArgumentException("Unsupported device JWK (need P-256 or Ed25519 public JWK)")
  }
}
