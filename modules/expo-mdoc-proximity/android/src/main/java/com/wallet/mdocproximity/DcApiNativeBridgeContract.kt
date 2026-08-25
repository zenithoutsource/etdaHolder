package com.wallet.mdocproximity

import com.etdawallet.mdocproximity.MdocProximityErrors
import java.util.Base64
import org.multipaz.crypto.EcPublicKey

internal enum class DcApiNativeFailureStage {
  PRESENTATION_ACTIVE,
  STORED_CREDENTIAL,
  SIGNING,
  CONSTRUCTION,
}

internal class DcApiSafeFailure(
  val code: String,
  val message: String,
  val diagnosticCategory: String,
) {
  override fun toString(): String =
    "DcApiSafeFailure(code=$code, diagnosticCategory=$diagnosticCategory)"
}

internal class DcApiNativeInput(
  val credentialId: String,
  val approvedNamespaceKeys: List<String>,
  val origin: String,
  val nonce: String,
  val encryptionJwkJson: String?,
  val opaqueNativeHandle: String,
) {
  override fun toString(): String = "DcApiNativeInput(redacted)"
}

internal class DcApiBridgeInputException : Exception(INPUT_FAILURE.message) {
  val failure: DcApiSafeFailure = INPUT_FAILURE

  private companion object {
    val INPUT_FAILURE = DcApiSafeFailure(
      code = MdocProximityErrors.INVALID_ARGUMENT,
      message = "DC API DeviceResponse input is invalid",
      diagnosticCategory = "input_invalid",
    )
  }
}

internal class DcApiStoredCredential(
  val mdocBytes: ByteArray,
  val docType: String?,
) {
  override fun toString(): String = "DcApiStoredCredential(redacted)"
}

internal interface DcApiNativeBridgeDependencies {
  fun isPresentationActive(): Boolean

  suspend fun readStoredCredential(credentialId: String): DcApiStoredCredential

  suspend fun authenticateSigningSession(opaqueNativeHandle: String)

  suspend fun readPublicKey(opaqueNativeHandle: String): EcPublicKey

  suspend fun signWithoutPrompt(
    opaqueNativeHandle: String,
    data: ByteArray,
  ): ByteArray

  suspend fun buildDeviceResponse(
    input: DcApiNativeInput,
    storedCredential: DcApiStoredCredential,
    publicKey: EcPublicKey,
    sign: suspend (ByteArray) -> ByteArray,
  ): ByteArray
}

internal class DcApiBridgeExecutionException(
  val failure: DcApiSafeFailure,
) : Exception(failure.message)

internal object DcApiNativeBridgeContract {
  fun safeFailure(
    stage: DcApiNativeFailureStage,
    @Suppress("UNUSED_PARAMETER")
    rawFailure: Throwable,
  ): DcApiSafeFailure {
    return when (stage) {
      DcApiNativeFailureStage.PRESENTATION_ACTIVE -> DcApiSafeFailure(
        code = MdocProximityErrors.PRESENTATION_ACTIVE,
        message = "A proximity presentation is already active",
        diagnosticCategory = "presentation_active",
      )
      DcApiNativeFailureStage.STORED_CREDENTIAL -> DcApiSafeFailure(
        code = MdocProximityErrors.STORAGE_FAILED,
        message = "Stored mDOC credential is unavailable",
        diagnosticCategory = "stored_credential_failed",
      )
      DcApiNativeFailureStage.SIGNING -> DcApiSafeFailure(
        code = MdocProximityErrors.DC_API_SIGNING_FAILED,
        message = "DC API DeviceResponse signing failed",
        diagnosticCategory = "signing_failed",
      )
      DcApiNativeFailureStage.CONSTRUCTION -> DcApiSafeFailure(
        code = MdocProximityErrors.DC_API_DEVICE_RESPONSE_FAILED,
        message = "DC API DeviceResponse construction failed",
        diagnosticCategory = "construction_failed",
      )
    }
  }

  fun readInput(params: Map<String, Any?>): DcApiNativeInput {
    val encryptionJwkJson = if (params.containsKey("encryptionJwkJson")) {
      val supplied = params["encryptionJwkJson"] as? String
        ?: throw DcApiBridgeInputException()
      if (
        supplied.isBlank() ||
        DcApiHandoverCbor.sha256ThumbprintOfJwk(supplied) == null
      ) {
        throw DcApiBridgeInputException()
      }
      supplied
    } else {
      null
    }

    return DcApiNativeInput(
      credentialId = requiredString(params, "credentialId"),
      approvedNamespaceKeys = requiredStringList(params, "approvedNamespaceKeys"),
      origin = requiredString(params, "origin"),
      nonce = requiredString(params, "nonce"),
      encryptionJwkJson = encryptionJwkJson,
      opaqueNativeHandle = requiredString(params, "opaqueNativeHandle"),
    )
  }

  fun encodeDeviceResponse(deviceResponse: ByteArray): String =
    Base64.getUrlEncoder().withoutPadding().encodeToString(deviceResponse)

  suspend fun execute(
    input: DcApiNativeInput,
    dependencies: DcApiNativeBridgeDependencies,
  ): String {
    if (dependencies.isPresentationActive()) {
      throw DcApiBridgeExecutionException(
        safeFailure(
          DcApiNativeFailureStage.PRESENTATION_ACTIVE,
          IllegalStateException("presentation active"),
        ),
      )
    }
    val storedCredential = runStage(DcApiNativeFailureStage.STORED_CREDENTIAL) {
      dependencies.readStoredCredential(input.credentialId)
    }
    runStage(DcApiNativeFailureStage.SIGNING) {
      dependencies.authenticateSigningSession(input.opaqueNativeHandle)
    }
    val publicKey = runStage(DcApiNativeFailureStage.SIGNING) {
      dependencies.readPublicKey(input.opaqueNativeHandle)
    }
    val deviceResponse = runStage(DcApiNativeFailureStage.CONSTRUCTION) {
      dependencies.buildDeviceResponse(
        input = input,
        storedCredential = storedCredential,
        publicKey = publicKey,
        sign = { data ->
          runStage(DcApiNativeFailureStage.SIGNING) {
            dependencies.signWithoutPrompt(input.opaqueNativeHandle, data)
          }
        },
      )
    }
    return encodeDeviceResponse(deviceResponse)
  }

  private suspend fun <T> runStage(
    stage: DcApiNativeFailureStage,
    block: suspend () -> T,
  ): T = try {
    block()
  } catch (error: DcApiBridgeExecutionException) {
    throw error
  } catch (error: Exception) {
    throw DcApiBridgeExecutionException(safeFailure(stage, error))
  }

  private fun requiredString(params: Map<String, Any?>, name: String): String {
    val value = params[name] as? String ?: throw DcApiBridgeInputException()
    return value.takeIf { it.isNotBlank() } ?: throw DcApiBridgeInputException()
  }

  private fun requiredStringList(params: Map<String, Any?>, name: String): List<String> {
    val values = params[name] as? List<*> ?: throw DcApiBridgeInputException()
    if (values.isEmpty() || values.any { it !is String || it.isBlank() }) {
      throw DcApiBridgeInputException()
    }
    return values.map { it as String }
  }
}
