package org.wallet.mdocnfchost

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.multipaz.nfc.CommandApdu
import org.multipaz.nfc.NfcIsoTag
import org.multipaz.nfc.ResponseApdu
import javax.smartcardio.Card
import javax.smartcardio.CardChannel
import javax.smartcardio.CardException
import javax.smartcardio.CardTerminal
import javax.smartcardio.CommandAPDU
import javax.smartcardio.TerminalFactory

class PcscNfcIsoTag(
  private val channel: CardChannel,
  private val card: Card,
) : NfcIsoTag() {
  override val maxTransceiveLength: Int = 256

  override suspend fun transceive(command: CommandApdu): ResponseApdu {
    return withContext(Dispatchers.IO) {
      val encoded = command.encode()
      val response = try {
        channel.transmit(CommandAPDU(encoded))
      } catch (error: CardException) {
        throw IllegalStateException("PC/SC transceive failed", error)
      }
      val bytes = response.bytes
      ResponseApdu.decode(bytes)
    }
  }

  override suspend fun updateDialogMessage(message: String) {
    println("[mdoc-nfc-host] $message")
  }

  override suspend fun close() {
    withContext(Dispatchers.IO) {
      try {
        card.disconnect(false)
      } catch (_: CardException) {
      }
    }
  }

  companion object {
    fun listTerminalNames(): List<String> {
      return try {
        TerminalFactory.getDefault().terminals().list().map { it.name }
      } catch (error: Exception) {
        throw IllegalStateException("PC/SC is unavailable. Install the ACS CCID driver for ACR1311U-N2.", error)
      }
    }

    fun waitForCard(timeoutMs: Long): PcscNfcIsoTag {
      val terminals = TerminalFactory.getDefault().terminals().list()
      if (terminals.isEmpty()) {
        throw IllegalStateException("No PC/SC readers found. Connect the ACR1311U-N2 over USB or Bluetooth to this PC.")
      }
      val preferred = terminals.firstOrNull { terminal ->
        val name = terminal.name.uppercase()
        name.contains("ACR1311") || name.contains("ACS")
      } ?: terminals.first()

      val deadline = System.currentTimeMillis() + timeoutMs
      while (System.currentTimeMillis() < deadline) {
        if (preferred.isCardPresent) {
          return connect(preferred)
        }
        preferred.waitForCardPresent((deadline - System.currentTimeMillis()).coerceAtMost(500L).coerceAtLeast(50L))
      }
      throw IllegalStateException(
        "Timed out waiting for NFC. Arm the wallet, scan the Waiting for tap QR, then hold the phone to the reader while that screen is still open.",
      )
    }

    private fun connect(terminal: CardTerminal): PcscNfcIsoTag {
      val card = terminal.connect("*")
      return PcscNfcIsoTag(card.basicChannel, card)
    }
  }
}
