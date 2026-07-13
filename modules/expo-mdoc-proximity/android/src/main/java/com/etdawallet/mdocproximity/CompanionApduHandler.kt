package com.etdawallet.mdocproximity

import android.util.Log

object CompanionApduHandler {
  private const val TAG = "CompanionApdu"
  private const val CLA_PROPRIETARY = 0x80.toByte()
  private const val INS_GET_CAPABILITIES = 0xCA.toByte()
  private const val INS_BEGIN_COMPANION = 0xCB.toByte()
  private const val INS_GET_RESPONSE = 0xC0.toByte()
  private const val INS_ABORT = 0xFF.toByte()

  fun process(commandApdu: ByteArray): ByteArray {
    if (commandApdu.size < 4) return sw(0x6F, 0x00)

    val cla = commandApdu[0]
    val ins = commandApdu[1]

    if (cla != CLA_PROPRIETARY) return sw(0x6D, 0x00)

    return when (ins) {
      INS_GET_CAPABILITIES -> handleGetCapabilities()
      INS_BEGIN_COMPANION -> handleBeginCompanion(commandApdu)
      INS_GET_RESPONSE -> handleGetResponse()
      INS_ABORT -> {
        CompanionSession.disarm()
        sw(0x90, 0x00)
      }
      else -> sw(0x6D, 0x00)
    }
  }

  private fun handleGetCapabilities(): ByteArray {
    val state = CompanionSession.readArmState()
      ?: return sw(0x6A, 0x82)

    val modes = if (state.sharingMode == "dual-format") {
      listOf("mdoc-only", "dual-format")
    } else {
      listOf("mdoc-only")
    }

    val body = CompanionCbor.encodeCapabilities(
      version = 1,
      supportedModes = modes,
      activeProfileId = state.profileId,
      maxCompanionBytes = 65536,
    )

    return success(body)
  }

  private fun handleBeginCompanion(commandApdu: ByteArray): ByteArray {
    val state = CompanionSession.readArmState()
      ?: return sw(0x6A, 0x82)

    if (commandApdu.size < 5) return sw(0x6F, 0x00)
    val lc = commandApdu[4].toInt() and 0xFF
    if (commandApdu.size < 5 + lc) return sw(0x6F, 0x00)

    val payload = commandApdu.copyOfRange(5, 5 + lc)
    val request = try {
      CompanionCbor.decodeBeginRequest(payload)
    } catch (error: Exception) {
      Log.e(TAG, "[begin-companion] invalid CBOR", error)
      return sw(0x6F, 0x00)
    }

    if (request.profileId != state.profileId) return sw(0x69, 0x85)
    if (request.mode == "dual-format" && state.sharingMode != "dual-format") {
      return sw(0x69, 0x85)
    }
    if (request.mode == "mdoc-only") {
      return success(ByteArray(0))
    }

    val response = CompanionSession.consumeCompanionResponse()
    if (response == null) {
      CompanionSession.onCompanionSignRequested?.invoke(request.nonce)
      Log.w(TAG, "[begin-companion] companion KB signing pending JS bridge")
      return sw(0x69, 0x85)
    }

    return success(response)
  }

  private fun handleGetResponse(): ByteArray {
    val response = CompanionSession.consumeCompanionResponse() ?: return sw(0x6F, 0x00)
    return success(response)
  }

  private fun success(body: ByteArray): ByteArray {
    if (body.size <= 255) {
      return body + sw(0x90, 0x00)
    }
    val chunk = body.copyOfRange(0, 255)
    val remaining = body.copyOfRange(255, body.size)
    CompanionSession.storeCompanionResponse(remaining)
    return chunk + sw(0x61, remaining.size.coerceAtMost(255))
  }

  private fun sw(sw1: Int, sw2: Int): ByteArray =
    byteArrayOf(sw1.toByte(), sw2.toByte())
}
