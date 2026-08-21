package org.wallet.mdocnfchost

import kotlinx.coroutines.runBlocking
import org.multipaz.cbor.Cbor
import org.multipaz.crypto.Crypto
import org.multipaz.crypto.EcCurve
import org.multipaz.mdoc.issuersigned.IssuerNamespaces
import org.multipaz.mdoc.mso.MobileSecurityObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class TestMdlGeneratorTest {
  @Test
  fun generatesMdlBoundToSuppliedDeviceKey() = runBlocking {
    val deviceKey = Crypto.createEcPrivateKey(EcCurve.P256)
    val generated = TestMdlGenerator.generate(deviceKey.publicKey)
    assertEquals("TEST", generated.familyName)
    assertEquals("HOLDER", generated.givenName)
    assertEquals("1990-01-01", generated.birthDate)

    val root = Cbor.decode(generated.mdocBytes)
    assertEquals(MDL_DOCTYPE, root["docType"].asTstr)
    assertTrue(root["issuerSigned"].asMap.isNotEmpty())

    val nameSpaces = IssuerNamespaces.fromDataItem(root["issuerSigned"]["nameSpaces"])
    val mdl = nameSpaces.data[MDL_NAMESPACE]
    assertNotNull(mdl)
    for (identifier in listOf(
      "family_name",
      "given_name",
      "birth_date",
      "driving_privileges",
      "issue_date",
      "expiry_date",
    )) {
      assertTrue(mdl.containsKey(identifier), "missing $identifier")
    }

    val payload = root["issuerSigned"]["issuerAuth"].asCoseSign1.payload
    assertNotNull(payload)
    val mso = MobileSecurityObject.fromDataItem(Cbor.decode(payload).asTaggedEncodedCbor)
    assertEquals(MDL_DOCTYPE, mso.docType)
    assertEquals(deviceKey.publicKey, mso.deviceKey)

    val parsed = TestMdlGenerator.parseDevicePublicJwk(deviceKey.publicKey.toJwk().toString())
    assertEquals(deviceKey.publicKey, parsed)
    assertTrue(IssuerAttestation.chainContainsIaca(root["issuerSigned"]["issuerAuth"], generated.iacaPem))
  }

  @Test
  fun parseDeviceJwkAcceptsP256AndEd25519() = runBlocking {
    val p256 = Crypto.createEcPrivateKey(EcCurve.P256).publicKey
    assertEquals(p256, TestMdlGenerator.parseDevicePublicJwk(p256.toJwk().toString()))
    val ed25519 = Crypto.createEcPrivateKey(EcCurve.ED25519).publicKey
    assertEquals(ed25519, TestMdlGenerator.parseDevicePublicJwk(ed25519.toJwk().toString()))
  }
}
