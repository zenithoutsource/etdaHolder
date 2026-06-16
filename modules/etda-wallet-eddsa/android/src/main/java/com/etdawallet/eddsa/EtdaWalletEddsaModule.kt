package com.etdawallet.eddsa

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class EtdaWalletEddsaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("EtdaWalletEddsa")

    Function("supportsSecureEnvironment") {
      return@Function EtdaWalletEddsa.supportsSecureEnvironment(appContext)
    }

    AsyncFunction("generateKeypair") { keyId: String, biometricsBacked: Boolean ->
      EtdaWalletEddsa.generateKeypair(appContext, keyId, biometricsBacked)
    }

    Function("getPublicBytesForKeyId") { keyId: String ->
      return@Function EtdaWalletEddsa.getPublicBytesForKeyId(appContext, keyId)
    }

    AsyncFunction("sign") { keyId: String, message: ByteArray, biometricsBacked: Boolean, promise: Promise ->
      EtdaWalletEddsa.sign(appContext, keyId, message, biometricsBacked, promise)
    }

    AsyncFunction("deleteKey") { keyId: String ->
      EtdaWalletEddsa.deleteKey(appContext, keyId)
    }
  }
}
