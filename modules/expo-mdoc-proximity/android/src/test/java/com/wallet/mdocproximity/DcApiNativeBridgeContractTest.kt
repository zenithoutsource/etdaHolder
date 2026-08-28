package com.wallet.mdocproximity

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.multipaz.crypto.EcCurve
import org.multipaz.crypto.EcPublicKey
import org.multipaz.crypto.EcPublicKeyDoubleCoordinate

class DcApiNativeBridgeContractTest {
  @Test
  fun mapsNativeFailureStagesToDistinctSafeRejectionsWithoutThrowableCauses() {
    val sensitiveDiagnostic = IllegalArgumentException(
      "claim=Jane Doe jwk={secret} handle=opaque-secret",
    )

    val storage = DcApiNativeBridgeContract.safeFailure(
      DcApiNativeFailureStage.STORED_CREDENTIAL,
      sensitiveDiagnostic,
    )
    val signing = DcApiNativeBridgeContract.safeFailure(
      DcApiNativeFailureStage.SIGNING,
      sensitiveDiagnostic,
    )
    val construction = DcApiNativeBridgeContract.safeFailure(
      DcApiNativeFailureStage.CONSTRUCTION,
      IllegalArgumentException("Stored mDOC issuerAuth is missing x5chain; claim a new mDL credential from the issuer"),
    )

    assertEquals("STORAGE_FAILED", storage.code)
    assertEquals("Stored mDOC credential is unavailable", storage.message)
    assertEquals("stored_credential_failed", storage.diagnosticCategory)
    assertEquals("DC_API_SIGNING_FAILED", signing.code)
    assertEquals("DC API DeviceResponse signing failed", signing.message)
    assertEquals("signing_failed", signing.diagnosticCategory)
    assertEquals("DC_API_DEVICE_RESPONSE_X5CHAIN_MISSING", construction.code)
    assertEquals("Stored mDOC issuerAuth is missing x5chain", construction.message)
    assertEquals("missing_x5chain", construction.diagnosticCategory)

    val genericConstruction = DcApiNativeBridgeContract.safeFailure(
      DcApiNativeFailureStage.CONSTRUCTION,
      sensitiveDiagnostic,
    )
    assertEquals("DC_API_DEVICE_RESPONSE_FAILED", genericConstruction.code)
    assertEquals("DC API DeviceResponse construction failed", genericConstruction.message)
    assertEquals("construction_failed", genericConstruction.diagnosticCategory)

    listOf(storage, signing, construction, genericConstruction).forEach { failure ->
      assertFalse(failure.toString().contains("Jane Doe"))
      assertFalse(failure.toString().contains("opaque-secret"))
      assertFalse(failure.toString().contains("{secret}"))
    }
  }

  @Test
  fun acceptsOmittedEncryptionJwkButRejectsEveryPresentInvalidValue() {
    val omitted = DcApiNativeBridgeContract.readInput(validParams())
    assertNull(omitted.encryptionJwkJson)

    listOf<Any?>(null, "", "   ", 42, "{not-a-jwk}").forEach { invalidJwk ->
      val params = validParams().toMutableMap().apply {
        put("encryptionJwkJson", invalidJwk)
      }
      val error = assertThrows(DcApiBridgeInputException::class.java) {
        DcApiNativeBridgeContract.readInput(params)
      }

      assertEquals("INVALID_ARGUMENT", error.failure.code)
      assertEquals("DC API DeviceResponse input is invalid", error.failure.message)
      assertEquals("input_invalid", error.failure.diagnosticCategory)
      assertNull(error.cause)
      assertFalse(error.toString().contains("not-a-jwk"))
    }
  }

  @Test
  fun acceptsPresentValidEncryptionJwkWithoutChangingIt() {
    val validJwk = """
      {"kty":"EC","crv":"P-256","x":"DxiH5Q4Yx3UrukE2lWCErq8N8bqC9CHLLrAwLz5BmE0","y":"XtLM4-3h5o3HUH0MHVJV0kyq0iBlrBwlh8qEDMZ4-Pc"}
    """.trimIndent()
    val params = validParams().toMutableMap().apply {
      put("encryptionJwkJson", validJwk)
    }

    assertEquals(validJwk, DcApiNativeBridgeContract.readInput(params).encryptionJwkJson)
  }

  @Test
  fun encodesDeviceResponseAsUnpaddedUnwrappedBase64Url() {
    val encoded = DcApiNativeBridgeContract.encodeDeviceResponse(
      byteArrayOf(0xfb.toByte(), 0xff.toByte()),
    )

    assertEquals("-_8", encoded)
    assertFalse(encoded.contains('='))
    assertFalse(encoded.contains('\n'))
    assertFalse(encoded.contains('\r'))
  }

  @Test
  fun executesOneAuthenticationAndRoutesTheOpaqueHandleToNoPromptSigning() = runBlocking {
    val events = mutableListOf<String>()
    val input = DcApiNativeBridgeContract.readInput(validParams())
    val dependencies = object : DcApiNativeBridgeDependencies {
      override fun isPresentationActive(): Boolean = false

      override suspend fun readStoredCredential(credentialId: String): DcApiStoredCredential {
        assertEquals("credential-1", credentialId)
        events += "storage"
        return DcApiStoredCredential(byteArrayOf(0x01), "org.iso.18013.5.1.mDL")
      }

      override suspend fun authenticateSigningSession(opaqueNativeHandle: String) {
        assertEquals("opaque-handle-1", opaqueNativeHandle)
        events += "authenticate"
      }

      override suspend fun readPublicKey(opaqueNativeHandle: String): EcPublicKey {
        assertEquals("opaque-handle-1", opaqueNativeHandle)
        events += "public-key"
        return testPublicKey()
      }

      override suspend fun signWithoutPrompt(
        opaqueNativeHandle: String,
        data: ByteArray,
      ): ByteArray {
        assertEquals("opaque-handle-1", opaqueNativeHandle)
        assertArrayEquals(byteArrayOf(0x21, 0x22), data)
        events += "sign"
        return ByteArray(64) { 0x5a }
      }

      override suspend fun buildDeviceResponse(
        input: DcApiNativeInput,
        storedCredential: DcApiStoredCredential,
        publicKey: EcPublicKey,
        sign: suspend (ByteArray) -> ByteArray,
      ): ByteArray {
        assertEquals("nonce-1", input.nonce)
        assertArrayEquals(byteArrayOf(0x01), storedCredential.mdocBytes)
        assertEquals(testPublicKey(), publicKey)
        events += "build"
        assertEquals(64, sign(byteArrayOf(0x21, 0x22)).size)
        return byteArrayOf(0xfb.toByte(), 0xff.toByte())
      }
    }

    val encoded = DcApiNativeBridgeContract.execute(input, dependencies)

    assertEquals("-_8", encoded)
    assertEquals(
      listOf("storage", "authenticate", "public-key", "build", "sign"),
      events,
    )
  }

  @Test
  fun executionSeparatesStorageSigningAndConstructionFailures() = runBlocking {
    val input = DcApiNativeBridgeContract.readInput(validParams())

    val storage = captureExecutionFailure {
      DcApiNativeBridgeContract.execute(
        input,
        FakeDependencies(readStoredCredentialFailure = IllegalArgumentException("raw claims")),
      )
    }
    val signing = captureExecutionFailure {
      DcApiNativeBridgeContract.execute(
        input,
        FakeDependencies(signingFailure = IllegalArgumentException("raw handle")),
      )
    }
    val construction = captureExecutionFailure {
      DcApiNativeBridgeContract.execute(
        input,
        FakeDependencies(constructionFailure = IllegalArgumentException("raw DeviceResponse")),
      )
    }

    assertEquals("STORAGE_FAILED", storage.failure.code)
    assertEquals("DC_API_SIGNING_FAILED", signing.failure.code)
    assertEquals("DC_API_DEVICE_RESPONSE_FAILED", construction.failure.code)
    listOf(storage, signing, construction).forEach { failure ->
      assertFalse(failure.failure.code == "INVALID_ARGUMENT")
      assertNull(failure.cause)
      assertFalse(failure.toString().contains("raw"))
    }
  }

  private fun validParams(): Map<String, Any?> = mapOf(
    "credentialId" to "credential-1",
    "approvedNamespaceKeys" to listOf("org.iso.18013.5.1/family_name"),
    "origin" to "https://example.com",
    "nonce" to "nonce-1",
    "opaqueNativeHandle" to "opaque-handle-1",
  )

  private suspend fun captureExecutionFailure(
    block: suspend () -> Unit,
  ): DcApiBridgeExecutionException = try {
    block()
    throw AssertionError("Expected DcApiBridgeExecutionException")
  } catch (error: DcApiBridgeExecutionException) {
    error
  }

  private class FakeDependencies(
    private val readStoredCredentialFailure: Throwable? = null,
    private val signingFailure: Throwable? = null,
    private val constructionFailure: Throwable? = null,
  ) : DcApiNativeBridgeDependencies {
    override fun isPresentationActive(): Boolean = false

    override suspend fun readStoredCredential(credentialId: String): DcApiStoredCredential {
      readStoredCredentialFailure?.let { throw it }
      return DcApiStoredCredential(byteArrayOf(0x01), "org.iso.18013.5.1.mDL")
    }

    override suspend fun authenticateSigningSession(opaqueNativeHandle: String) = Unit

    override suspend fun readPublicKey(opaqueNativeHandle: String): EcPublicKey = testPublicKey()

    override suspend fun signWithoutPrompt(
      opaqueNativeHandle: String,
      data: ByteArray,
    ): ByteArray {
      signingFailure?.let { throw it }
      return ByteArray(64)
    }

    override suspend fun buildDeviceResponse(
      input: DcApiNativeInput,
      storedCredential: DcApiStoredCredential,
      publicKey: EcPublicKey,
      sign: suspend (ByteArray) -> ByteArray,
    ): ByteArray {
      constructionFailure?.let { throw it }
      sign(byteArrayOf(0x01))
      return byteArrayOf(0x01)
    }
  }

  private companion object {
    fun testPublicKey() = EcPublicKeyDoubleCoordinate(
      curve = EcCurve.P256,
      x = hex("6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),
      y = hex("4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"),
    )

    fun hex(value: String): ByteArray = value
      .chunked(2)
      .map { it.toInt(16).toByte() }
      .toByteArray()
  }
}
