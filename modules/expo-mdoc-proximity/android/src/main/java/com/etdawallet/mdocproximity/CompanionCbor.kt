package com.etdawallet.mdocproximity

import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets

data class EtdaBeginCompanionRequest(
  val mode: String,
  val nonce: ByteArray,
  val profileId: String,
)

object EtdaCompanionCbor {
  fun encodeCapabilities(
    version: Int,
    supportedModes: List<String>,
    activeProfileId: String,
    maxCompanionBytes: Int,
  ): ByteArray {
    val output = ByteArrayOutputStream()
    writeMapHeader(output, 4)
    writeUnsigned(output, 1)
    writeUnsigned(output, version)
    writeUnsigned(output, 2)
    writeArrayHeader(output, supportedModes.size)
    supportedModes.forEach { writeTextString(output, it) }
    writeUnsigned(output, 3)
    writeTextString(output, activeProfileId)
    writeUnsigned(output, 4)
    writeUnsigned(output, maxCompanionBytes)
    return output.toByteArray()
  }

  fun decodeBeginRequest(bytes: ByteArray): EtdaBeginCompanionRequest {
    val reader = CborReader(bytes)
    val map = reader.readMap()
    val mode = map[1] as? String ?: throw IllegalArgumentException("mode required")
    val nonce = map[2] as? ByteArray ?: throw IllegalArgumentException("nonce required")
    val profileId = map[3] as? String ?: throw IllegalArgumentException("profileId required")
    if (nonce.size != 32) throw IllegalArgumentException("nonce must be 32 bytes")
    return EtdaBeginCompanionRequest(mode, nonce, profileId)
  }

  private fun writeMapHeader(output: ByteArrayOutputStream, pairCount: Int) {
    output.write(0xA0 + pairCount)
  }

  private fun writeArrayHeader(output: ByteArrayOutputStream, length: Int) {
    output.write(0x80 + length)
  }

  private fun writeUnsigned(output: ByteArrayOutputStream, value: Int) {
    when {
      value < 24 -> output.write(value)
      value < 256 -> {
        output.write(0x18)
        output.write(value)
      }
      value < 65536 -> {
        output.write(0x19)
        output.write(value shr 8)
        output.write(value and 0xFF)
      }
      else -> throw IllegalArgumentException("unsigned integer too large")
    }
  }

  private fun writeTextString(output: ByteArrayOutputStream, value: String) {
    val bytes = value.toByteArray(StandardCharsets.UTF_8)
    writeLength(output, 0x60, bytes.size)
    output.write(bytes)
  }

  private fun writeLength(output: ByteArrayOutputStream, major: Int, length: Int) {
    when {
      length < 24 -> output.write(major + length)
      length < 256 -> {
        output.write(major + 24)
        output.write(length)
      }
      length < 65536 -> {
        output.write(major + 25)
        output.write(length shr 8)
        output.write(length and 0xFF)
      }
      else -> throw IllegalArgumentException("string too large")
    }
  }

  private class CborReader(private val bytes: ByteArray) {
    private var offset = 0

    fun readMap(): Map<Int, Any?> {
      val initial = readInitial()
      require(initial.major == 5) { "expected map" }
      val map = mutableMapOf<Int, Any?>()
      repeat(initial.length) {
        val key = readUnsigned()
        map[key] = readValue()
      }
      return map
    }

    private fun readValue(): Any? {
      val initial = readInitial()
      return when (initial.major) {
        0 -> initial.length
        2 -> readBytes(initial.length)
        3 -> String(readBytes(initial.length), StandardCharsets.UTF_8)
        else -> throw IllegalArgumentException("unsupported CBOR type")
      }
    }

    private fun readUnsigned(): Int {
      val initial = readInitial()
      require(initial.major == 0) { "expected unsigned integer" }
      return initial.length
    }

    private fun readInitial(): InitialByte {
      val value = bytes[offset++].toInt() and 0xFF
      val major = value shr 5
      val additional = value and 0x1F
      if (additional < 24) return InitialByte(major, additional)
      if (additional == 24) return InitialByte(major, readByte())
      if (additional == 25) return InitialByte(major, (readByte() shl 8) or readByte())
      throw IllegalArgumentException("unsupported length")
    }

    private fun readBytes(length: Int): ByteArray {
      val slice = bytes.copyOfRange(offset, offset + length)
      offset += length
      return slice
    }

    private fun readByte(): Int = bytes[offset++].toInt() and 0xFF
  }

  private data class InitialByte(val major: Int, val length: Int)
}
