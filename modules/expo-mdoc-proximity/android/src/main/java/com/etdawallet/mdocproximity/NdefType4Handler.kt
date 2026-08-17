package com.etdawallet.mdocproximity

object NdefType4Handler {
  private const val CC_FILE_ID = 0xE103
  private const val NDEF_FILE_ID = 0xE104
  private const val CC_LENGTH = 15
  val NDEF_AID: ByteArray = byteArrayOf(
    0xD2.toByte(), 0x76, 0x00, 0x00, 0x85.toByte(), 0x01, 0x01,
  )

  fun process(commandApdu: ByteArray): ByteArray {
    if (CompanionSession.readArmState() == null) {
      return sw(0x6A, 0x82)
    }

    val ndefMessage = CompanionSession.readNdefMessage()
      ?: return sw(0x6A, 0x82)

    if (isSelectAid(commandApdu, NDEF_AID)) {
      CompanionSession.selectNdef()
      return sw(0x90, 0x00)
    }

    if (isSelectFileById(commandApdu, CC_FILE_ID)) {
      CompanionSession.selectNdefFile(CC_FILE_ID)
      return sw(0x90, 0x00)
    }

    if (isSelectFileById(commandApdu, NDEF_FILE_ID)) {
      CompanionSession.selectNdefFile(NDEF_FILE_ID)
      return sw(0x90, 0x00)
    }

    if (isReadBinary(commandApdu)) {
      val offset = readOffset(commandApdu)
      val length = readLe(commandApdu)
      val fileBytes = when (CompanionSession.readNdefSelectedFile()) {
        CC_FILE_ID -> buildCapabilityContainer(ndefMessage)
        NDEF_FILE_ID -> buildNdefFile(ndefMessage)
        else -> return sw(0x6A, 0x82)
      }
      return readBinary(fileBytes, offset, length)
    }

    return sw(0x6D, 0x00)
  }

  private fun buildCapabilityContainer(ndefMessage: ByteArray): ByteArray {
    val ndefFileSize = ndefMessage.size + 2
    val maxNdefFileSize = maxOf(ndefFileSize, 0x00FF)
    return byteArrayOf(
      0x00, CC_LENGTH.toByte(),
      0x20,
      0x00, 0x3B,
      0x00, 0x34,
      0x04, 0x06,
      0xE1.toByte(), 0x04,
      ((maxNdefFileSize shr 8) and 0xFF).toByte(),
      (maxNdefFileSize and 0xFF).toByte(),
      0x00,
      0x00,
    )
  }

  private fun buildNdefFile(ndefMessage: ByteArray): ByteArray {
    val nlen = ndefMessage.size + 2
    return byteArrayOf(
      ((nlen shr 8) and 0xFF).toByte(),
      (nlen and 0xFF).toByte(),
    ) + ndefMessage
  }

  private fun readBinary(fileBytes: ByteArray, offset: Int, length: Int): ByteArray {
    if (offset < 0 || offset > fileBytes.size) {
      return sw(0x6B, 0x00)
    }
    val available = fileBytes.size - offset
    val toRead = if (length == 0) available else minOf(length, available)
    if (toRead <= 0) {
      return sw(0x6B, 0x00)
    }
    return fileBytes.copyOfRange(offset, offset + toRead) + sw(0x90, 0x00)
  }

  private fun isSelectAid(commandApdu: ByteArray, aid: ByteArray): Boolean {
    if (commandApdu.size < 5) return false
    if (commandApdu[0] != 0x00.toByte() || commandApdu[1] != 0xA4.toByte()) return false
    val lc = commandApdu[4].toInt() and 0xFF
    if (commandApdu.size < 5 + lc) return false
    val selectedAid = commandApdu.copyOfRange(5, 5 + lc)
    return selectedAid.contentEquals(aid)
  }

  private fun isSelectFileById(commandApdu: ByteArray, fileId: Int): Boolean {
    if (commandApdu.size < 7) return false
    if (commandApdu[0] != 0x00.toByte() || commandApdu[1] != 0xA4.toByte()) return false
    if (commandApdu[2] != 0x00.toByte() || commandApdu[3] != 0x0C.toByte()) return false
    if (commandApdu[4] != 0x02.toByte()) return false
    val idHigh = commandApdu[5].toInt() and 0xFF
    val idLow = commandApdu[6].toInt() and 0xFF
    return ((idHigh shl 8) or idLow) == fileId
  }

  private fun isReadBinary(commandApdu: ByteArray): Boolean {
    if (commandApdu.size < 4) return false
    return commandApdu[0] == 0x00.toByte() && commandApdu[1] == 0xB0.toByte()
  }

  private fun readOffset(commandApdu: ByteArray): Int {
    val p1 = commandApdu[2].toInt() and 0xFF
    val p2 = commandApdu[3].toInt() and 0xFF
    return (p1 shl 8) or p2
  }

  private fun readLe(commandApdu: ByteArray): Int {
    if (commandApdu.size < 5) return 0
    val le = commandApdu[4].toInt() and 0xFF
    return if (le == 0) 256 else le
  }

  private fun sw(sw1: Int, sw2: Int): ByteArray =
    byteArrayOf(sw1.toByte(), sw2.toByte())
}
