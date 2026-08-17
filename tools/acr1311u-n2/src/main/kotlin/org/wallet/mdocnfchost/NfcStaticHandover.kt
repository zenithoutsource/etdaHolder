package org.wallet.mdocnfchost

import kotlinx.io.bytestring.ByteString
import kotlinx.io.bytestring.decodeToString
import kotlinx.io.bytestring.encodeToByteString
import org.multipaz.cbor.Bstr
import org.multipaz.cbor.DataItem
import org.multipaz.cbor.Simple
import org.multipaz.cbor.buildCborArray
import org.multipaz.mdoc.connectionmethod.MdocConnectionMethodNfc
import org.multipaz.mdoc.role.MdocRole
import org.multipaz.nfc.HandoverSelectRecord
import org.multipaz.nfc.NdefMessage
import org.multipaz.nfc.NdefRecord

/**
 * Pure encode/decode for ISO 18013-5:2021 static NFC handover NDEF messages.
 *
 * Layout matches Multipaz [org.multipaz.mdoc.nfc.MdocNfcEngagementHelper] static handover:
 * Handover Select, DeviceEngagement external-type record, and NFC carrier configuration.
 */
object NfcStaticHandover {
  private const val HANDOVER_SELECT_VERSION = 0x15
  private const val DEVICE_ENGAGEMENT_TYPE = "iso.org:18013:deviceengagement"
  private const val DEVICE_ENGAGEMENT_ID = "mdoc"
  private const val NFC_MAX_APDU_LENGTH = 0xFFFFL

  fun encode(deviceEngagementCbor: ByteArray): ByteArray {
    return generateHandoverSelectMessage(deviceEngagementCbor).encode()
  }

  fun handoverDataItem(ndefMessage: ByteArray): DataItem =
    buildCborArray {
      add(Bstr(ndefMessage))
      add(Simple.NULL)
    }

  fun decode(ndefMessage: ByteArray): ByteArray {
    if (ndefMessage.isEmpty()) {
      throw IllegalArgumentException("NDEF message is empty")
    }
    val message = NdefMessage.fromEncoded(ndefMessage)
    for (record in message.records) {
      if (record.tnf != NdefRecord.Tnf.EXTERNAL_TYPE) {
        continue
      }
      if (record.type.decodeToString() != DEVICE_ENGAGEMENT_TYPE) {
        continue
      }
      return record.payload.toByteArray()
    }
    throw IllegalArgumentException("DeviceEngagement record missing from static handover NDEF")
  }

  private fun generateHandoverSelectMessage(encodedDeviceEngagement: ByteArray): NdefMessage {
    val auxiliaryReferences = listOf(DEVICE_ENGAGEMENT_ID)
    val nfcMethod = MdocConnectionMethodNfc(
      commandDataFieldMaxLength = NFC_MAX_APDU_LENGTH,
      responseDataFieldMaxLength = NFC_MAX_APDU_LENGTH,
    )
    val (carrierConfigurationRecord, alternativeCarrierRecord) =
      nfcMethod.toNdefRecord(
        auxiliaryReferences = auxiliaryReferences,
        role = MdocRole.MDOC,
        skipUuids = false,
      ) ?: error("NFC static handover carrier records are required")

    val handoverSelectRecord = HandoverSelectRecord(
      version = HANDOVER_SELECT_VERSION,
      embeddedMessage = NdefMessage(listOf(alternativeCarrierRecord)),
    )

    return NdefMessage(
      listOf(
        handoverSelectRecord.generateNdefRecord(),
        NdefRecord(
          tnf = NdefRecord.Tnf.EXTERNAL_TYPE,
          type = DEVICE_ENGAGEMENT_TYPE.encodeToByteString(),
          id = DEVICE_ENGAGEMENT_ID.encodeToByteString(),
          payload = ByteString(encodedDeviceEngagement),
        ),
        carrierConfigurationRecord,
      ),
    )
  }
}
