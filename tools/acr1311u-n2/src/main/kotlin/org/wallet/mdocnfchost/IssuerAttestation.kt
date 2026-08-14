package org.wallet.mdocnfchost

import org.multipaz.cose.Cose
import org.multipaz.cose.CoseNumberLabel
import org.multipaz.crypto.X509Cert
import org.multipaz.crypto.X509CertChain
import org.multipaz.cbor.DataItem
import java.nio.file.Files
import java.nio.file.Path

object IssuerAttestation {
  fun loadOptionalPem(): String? {
    val env = System.getenv("MDOC_TEST_IACA_PEM")?.trim().orEmpty()
    if (env.isNotEmpty()) {
      val asPath = Path.of(env)
      if (Files.isRegularFile(asPath)) {
        return Files.readString(asPath)
      }
      if (env.contains("BEGIN CERTIFICATE")) {
        return env
      }
    }
    val candidates = listOf(
      Path.of("testdata", "test-iaca.pem"),
      Path.of("tools", "acr1311u-n2", "testdata", "test-iaca.pem"),
    )
    return candidates.firstOrNull { Files.isRegularFile(it) }?.let { Files.readString(it) }
  }

  fun chainContainsIaca(issuerAuth: DataItem, iacaPem: String): Boolean {
    val cose = issuerAuth.asCoseSign1
    val chainItem = cose.unprotectedHeaders[CoseNumberLabel(Cose.COSE_LABEL_X5CHAIN)]
      ?: return false
    val chain = X509CertChain.fromDataItem(chainItem)
    val iaca = X509Cert.fromPem(iacaPem)
    return chain.certificates.any { cert -> cert.encoded == iaca.encoded }
  }
}
