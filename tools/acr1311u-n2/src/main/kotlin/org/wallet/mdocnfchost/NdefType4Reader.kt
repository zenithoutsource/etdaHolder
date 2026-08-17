package org.wallet.mdocnfchost

import kotlinx.io.bytestring.ByteString

object NdefType4Reader {
  const val NDEF_AID_HEX = NDEF_AID_HEX_CONSTANT

  suspend fun readNdefMessage(tag: PcscNfcIsoTag): ByteArray {
    val selectResponse = tag.selectApplication(ByteString(hexToBytes(NDEF_AID_HEX)))
    val status = selectResponse.status
    if (status != 0x9000) {
      throw MdocPresentmentException(
        StatusWordMapper.codeForStatus(status),
        StatusWordMapper.messageForStatus(status),
      )
    }

    tag.selectFile(CC_FILE_ID)
    val cc = tag.readBinary(offset = 0, length = CC_READ_LENGTH)
    val ndefFileId = parseNdefFileId(cc)
    tag.selectFile(ndefFileId)
    val nlen = readNdefLength(tag)
    return tag.readBinary(offset = 2, length = nlen)
  }

  private const val CC_FILE_ID = 0xE103
  private const val CC_READ_LENGTH = 15
  private const val NDEF_FILE_ID_OFFSET = 9

  private fun parseNdefFileId(cc: ByteArray): Int {
    if (cc.size < CC_READ_LENGTH) {
      throw MdocPresentmentException("NDEF_READ_FAILED", "Capability Container is too short")
    }
    val fileIdHigh = cc[NDEF_FILE_ID_OFFSET].toInt() and 0xFF
    val fileIdLow = cc[NDEF_FILE_ID_OFFSET + 1].toInt() and 0xFF
    return (fileIdHigh shl 8) or fileIdLow
  }

  private suspend fun readNdefLength(tag: PcscNfcIsoTag): Int {
    val nlenBytes = tag.readBinary(offset = 0, length = 2)
    if (nlenBytes.size < 2) {
      throw MdocPresentmentException("NDEF_READ_FAILED", "NDEF length prefix is missing")
    }
    val nlen = ((nlenBytes[0].toInt() and 0xFF) shl 8) or (nlenBytes[1].toInt() and 0xFF)
    if (nlen < 2) {
      throw MdocPresentmentException("NDEF_READ_FAILED", "NDEF message length is invalid")
    }
    return nlen - 2
  }

  private fun hexToBytes(hex: String): ByteArray =
    hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}
