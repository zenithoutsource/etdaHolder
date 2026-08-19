package org.wallet.mdocnfchost

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
import org.multipaz.crypto.EcPrivateKey
import org.multipaz.crypto.EcPublicKey
import org.multipaz.crypto.EcPublicKeyDoubleCoordinate
import org.multipaz.crypto.EcPublicKeyOkp
import org.multipaz.crypto.X500Name
import org.multipaz.crypto.X509Cert
import org.multipaz.crypto.X509CertChain
import org.multipaz.mdoc.issuersigned.buildIssuerNamespaces
import org.multipaz.mdoc.mso.MobileSecurityObjectGenerator
import org.multipaz.mdoc.util.MdocUtil
import org.multipaz.util.fromBase64Url
import org.multipaz.util.toBase64Url
import java.nio.file.Files
import java.nio.file.Path
import kotlin.time.Clock
import kotlin.time.Duration.Companion.days
import kotlin.time.ExperimentalTime

data class GeneratedTestMdl(
  val mdocBytes: ByteArray,
  val iacaPem: String,
  val iacaKeyPem: String,
  val deviceKeyPem: String?,
  val familyName: String,
  val givenName: String,
  val birthDate: String,
) {
  val mdocBase64Url: String get() = mdocBytes.toBase64Url()
}

object TestMdlGenerator {
  const val DEFAULT_FAMILY_NAME = "TEST"
  const val DEFAULT_GIVEN_NAME = "HOLDER"
  const val DEFAULT_BIRTH_DATE = "1990-01-01"

  @OptIn(ExperimentalTime::class)
  suspend fun generate(
    devicePublicKey: EcPublicKey,
    familyName: String = DEFAULT_FAMILY_NAME,
    givenName: String = DEFAULT_GIVEN_NAME,
    birthDate: String = DEFAULT_BIRTH_DATE,
  ): GeneratedTestMdl {
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
      addNamespace(MDL_NAMESPACE) {
        addDataElement("family_name", Tstr(familyName))
        addDataElement("given_name", Tstr(givenName))
        addDataElement("birth_date", LocalDate.parse(birthDate).toDataItemFullDate())
        addDataElement("issuing_country", Tstr("TH"))
        addDataElement("issue_date", LocalDate.parse("2024-01-01").toDataItemFullDate())
        addDataElement("expiry_date", LocalDate.parse("2034-01-01").toDataItemFullDate())
        addDataElement(
          "driving_privileges",
          org.multipaz.cbor.buildCborArray {
            add(
              buildCborMap {
                put("vehicle_category_code", Tstr("B"))
                put("issue_date", LocalDate.parse("2024-01-01").toDataItemFullDate())
                put("expiry_date", LocalDate.parse("2034-01-01").toDataItemFullDate())
              },
            )
            add(
              buildCborMap {
                put("vehicle_category_code", Tstr("A"))
              },
            )
          },
        )
      }
    }

    val msoGenerator = MobileSecurityObjectGenerator(
      Algorithm.SHA256,
      MDL_DOCTYPE,
      devicePublicKey,
    )
    msoGenerator.setValidityInfo(signedAt, validFrom, validUntil, null)
    msoGenerator.addValueDigests(issuerNamespaces)
    val mso = msoGenerator.generate()
    val taggedEncodedMso = Cbor.encode(Tagged(24, Bstr(mso)))

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
    val documentBytes = Cbor.encode(
      buildCborMap {
        put("docType", MDL_DOCTYPE)
        put("issuerSigned", RawCbor(issuerSigned))
      },
    )

    return GeneratedTestMdl(
      mdocBytes = documentBytes,
      iacaPem = iacaCert.toPem(),
      iacaKeyPem = iacaPrivate.toPem(),
      deviceKeyPem = null,
      familyName = familyName,
      givenName = givenName,
      birthDate = birthDate,
    )
  }

  suspend fun generateWithOptionalDeviceJwk(deviceJwkJson: String?): Pair<GeneratedTestMdl, EcPrivateKey?> {
    if (deviceJwkJson.isNullOrBlank()) {
      val deviceKey = Crypto.createEcPrivateKey(EcCurve.P256)
      val generated = generate(deviceKey.publicKey)
      return generated.copy(deviceKeyPem = deviceKey.toPem()) to deviceKey
    }
    return generate(parseDevicePublicJwk(deviceJwkJson)) to null
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

  fun writeArtifacts(generated: GeneratedTestMdl, outDir: Path) {
    Files.createDirectories(outDir)
    Files.write(outDir.resolve("test-mdl.cbor"), generated.mdocBytes)
    Files.writeString(outDir.resolve("test-mdl.b64url"), generated.mdocBase64Url)
    Files.writeString(outDir.resolve("test-iaca.pem"), generated.iacaPem)
    Files.writeString(outDir.resolve("test-iaca-key.pem"), generated.iacaKeyPem)
    generated.deviceKeyPem?.let { Files.writeString(outDir.resolve("test-device-key.pem"), it) }
  }
}
