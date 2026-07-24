package com.wallet.keystorediagnostics

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WalletKeystoreDiagnosticsTest {
  private fun passingRecipe(label: String, securityLevelLabel: String): Map<String, Any?> {
    return mapOf(
      "label" to label,
      "status" to "EXECUTED",
      "publicKeyLooksEd25519" to true,
      "signVerifyOk" to true,
      "signatureBytes" to 64,
      "hardwareBacked" to true,
      "securityLevelLabel" to securityLevelLabel,
    )
  }

  @Test
  fun `StrongBox request is skipped only when feature is absent`() {
    assertTrue(WalletKeystoreDiagnostics.shouldSkipStrongBoxRecipe(true, false))
    assertFalse(WalletKeystoreDiagnostics.shouldSkipStrongBoxRecipe(true, true))
    assertFalse(WalletKeystoreDiagnostics.shouldSkipStrongBoxRecipe(false, false))
    assertFalse(WalletKeystoreDiagnostics.shouldSkipStrongBoxRecipe(null, false))
  }

  @Test
  fun `hardware aggregate accepts only strict default recipes`() {
    assertFalse(
      WalletKeystoreDiagnostics.supportsHardwareEd25519(
        listOf(passingRecipe("R1-Ed25519-sign", "TRUSTED_ENVIRONMENT")),
      ),
    )
    assertTrue(
      WalletKeystoreDiagnostics.supportsHardwareEd25519(
        listOf(passingRecipe("R7-Ed25519-digest-none", "TRUSTED_ENVIRONMENT")),
      ),
    )
    assertTrue(
      WalletKeystoreDiagnostics.supportsHardwareEd25519(
        listOf(passingRecipe("R10-CTS-EC-ed25519-default", "TRUSTED_ENVIRONMENT")),
      ),
    )
  }

  @Test
  fun `StrongBox aggregate requires strict recipe and StrongBox level`() {
    assertFalse(
      WalletKeystoreDiagnostics.supportsStrongBoxEd25519(
        listOf(passingRecipe("R12-Ed25519-digest-none-sb", "TRUSTED_ENVIRONMENT")),
      ),
    )
    assertTrue(
      WalletKeystoreDiagnostics.supportsStrongBoxEd25519(
        listOf(passingRecipe("R12-Ed25519-digest-none-sb", "STRONGBOX")),
      ),
    )
    assertTrue(
      WalletKeystoreDiagnostics.supportsStrongBoxEd25519(
        listOf(passingRecipe("R11-CTS-EC-ed25519-sb", "STRONGBOX")),
      ),
    )
  }

  @Test
  fun `skipped recipe never satisfies either aggregate`() {
    val skipped = passingRecipe("R11-CTS-EC-ed25519-sb", "STRONGBOX") +
      ("status" to "SKIPPED_FEATURE_ABSENT")

    assertFalse(WalletKeystoreDiagnostics.supportsHardwareEd25519(listOf(skipped)))
    assertFalse(WalletKeystoreDiagnostics.supportsStrongBoxEd25519(listOf(skipped)))
  }
}
