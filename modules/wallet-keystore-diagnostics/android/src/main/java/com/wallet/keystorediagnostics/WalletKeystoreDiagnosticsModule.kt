package com.wallet.keystorediagnostics

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WalletKeystoreDiagnosticsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WalletKeystoreDiagnostics")

    AsyncFunction("probeKeystoreKeygen") { ->
      WalletKeystoreDiagnostics.probe(appContext)
    }
  }
}
