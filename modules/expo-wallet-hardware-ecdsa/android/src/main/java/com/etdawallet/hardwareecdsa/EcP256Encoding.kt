package com.etdawallet.hardwareecdsa

import android.util.Base64
import java.math.BigInteger
import java.security.interfaces.ECPublicKey

internal object EcP256Encoding {
  private val P256_ORDER =
    BigInteger(
      "FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",
      16,
    )
  private val P256_HALF_ORDER = P256_ORDER.shiftRight(1)
  fun publicKeyToJwk(publicKey: ECPublicKey): Map<String, String> {
    val affineX = normalizeScalar(publicKey.w.affineX)
    val affineY = normalizeScalar(publicKey.w.affineY)
    return mapOf(
      "kty" to "EC",
      "crv" to "P-256",
      "x" to base64UrlEncode(affineX),
      "y" to base64UrlEncode(affineY),
    )
  }

  fun base64UrlEncode(value: ByteArray): String =
    Base64.encodeToString(value, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

  fun base64UrlDecode(value: String): ByteArray =
    Base64.decode(value, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

  fun derEcdsaSignatureToJoseRaw(derSignature: ByteArray): ByteArray {
    val (r, sBytes) = parseDerEcdsaSignature(derSignature)
    var s = BigInteger(1, sBytes)
    if (s > P256_HALF_ORDER) {
      s = P256_ORDER.subtract(s)
    }
    val raw = ByteArray(64)
    System.arraycopy(normalizeScalar(r), 0, raw, 0, 32)
    System.arraycopy(normalizeScalar(s), 0, raw, 32, 32)
    return raw
  }

  private fun normalizeScalar(value: BigInteger): ByteArray {
    val bytes = value.toByteArray()
    if (bytes.size == 32) return bytes
    if (bytes.size == 33 && bytes[0] == 0.toByte()) {
      return bytes.copyOfRange(1, 33)
    }
    if (bytes.size > 32) {
      return bytes.copyOfRange(bytes.size - 32, bytes.size)
    }
    val padded = ByteArray(32)
    System.arraycopy(bytes, 0, padded, 32 - bytes.size, bytes.size)
    return padded
  }

  private fun normalizeScalar(value: ByteArray): ByteArray {
    if (value.size == 32) return value
    if (value.size > 32) return value.copyOfRange(value.size - 32, value.size)
    val padded = ByteArray(32)
    System.arraycopy(value, 0, padded, 32 - value.size, value.size)
    return padded
  }

  private fun parseDerEcdsaSignature(der: ByteArray): Pair<ByteArray, ByteArray> {
    var offset = 0

    fun readByte(): Int {
      if (offset >= der.size) throw WalletHardwareEcdsaException("InvalidDerEcdsaSignature", "InvalidDerEcdsaSignature")
      return der[offset++].toInt() and 0xff
    }

    if (readByte() != 0x30) throw WalletHardwareEcdsaException("InvalidDerEcdsaSignature", "InvalidDerEcdsaSignature")
    val seqLength = readDerLength(readByte(), ::readByte)
    val seqEnd = offset + seqLength

    if (readByte() != 0x02) throw WalletHardwareEcdsaException("InvalidDerEcdsaSignature", "InvalidDerEcdsaSignature")
    val rLength = readDerLength(readByte(), ::readByte)
    val r = der.copyOfRange(offset, offset + rLength)
    offset += rLength

    if (readByte() != 0x02) throw WalletHardwareEcdsaException("InvalidDerEcdsaSignature", "InvalidDerEcdsaSignature")
    val sLength = readDerLength(readByte(), ::readByte)
    val s = der.copyOfRange(offset, offset + sLength)
    offset += sLength

    if (offset != seqEnd) throw WalletHardwareEcdsaException("InvalidDerEcdsaSignature", "InvalidDerEcdsaSignature")
    return r to s
  }

  private fun readDerLength(firstLengthByte: Int, readNext: () -> Int): Int {
    if (firstLengthByte and 0x80 == 0) return firstLengthByte

    val byteCount = firstLengthByte and 0x7f
    if (byteCount == 0 || byteCount > 4) {
      throw WalletHardwareEcdsaException("InvalidDerEcdsaSignature", "InvalidDerEcdsaSignature")
    }

    var length = 0
    repeat(byteCount) {
      length = (length shl 8) or readNext()
    }
    return length
  }
}
