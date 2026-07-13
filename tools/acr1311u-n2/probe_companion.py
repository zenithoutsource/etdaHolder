#!/usr/bin/env python3
"""ACR1311U-N2 companion HCE probe — SELECT + GET_CAPABILITIES.

Validates the wallet's companion NFC/HCE round-trip on real hardware
(Samsung A26 + ACR1311U-N2) without needing a stored mDOC. Arm the phone
first via the dev-only "Test NFC (arm HCE)" button in credential detail, then
tap the phone to the reader while this runs.

Constants mirror
  src/services/proximity/companionTransport/plugins/companionV1/constants.ts
(wire values — keep in sync there, they are the source of truth).

Requires: pyscard  (pip install pyscard) and the ACS PC/SC driver.
Run:      py -3.12 tools/acr1311u-n2/probe_companion.py
"""

from __future__ import annotations

import sys

try:
    from smartcard.System import readers
    from smartcard.util import toHexString
except ImportError:
    sys.exit("pyscard not installed. Run: pip install pyscard")

# --- Wire constants (mirror companionV1/constants.ts) -----------------------
COMPANION_AID = [0xA0, 0x00, 0x00, 0x04, 0x54, 0x44, 0x41, 0x01, 0x00]
SELECT_AID = [0x00, 0xA4, 0x04, 0x00, len(COMPANION_AID)] + COMPANION_AID + [0x00]
GET_CAPABILITIES = [0x80, 0xCA, 0x00, 0x00, 0x00]

SW_SUCCESS = (0x90, 0x00)
SW_FILE_NOT_FOUND = (0x6A, 0x82)


def sw(sw1: int, sw2: int) -> str:
    return f"{sw1:02X}{sw2:02X}"


def decode_capabilities(body: list[int]) -> None:
    """Best-effort pretty print of the CBOR capabilities map (keys 1-4).

    Uses the `cbor2` lib if present; otherwise dumps raw hex.
    """
    raw = bytes(body)
    try:
        import cbor2  # type: ignore
    except ImportError:
        print(f"    CBOR (raw, install cbor2 to decode): {toHexString(body)}")
        return

    try:
        decoded = cbor2.loads(raw)
    except Exception as error:  # noqa: BLE001 - diagnostic only
        print(f"    CBOR decode failed ({error}); raw: {toHexString(body)}")
        return

    key_names = {1: "version", 2: "supportedModes", 3: "activeProfileId", 4: "maxCompanionBytes"}
    if isinstance(decoded, dict):
        for key, value in decoded.items():
            print(f"    {key_names.get(key, key)}: {value}")
    else:
        print(f"    CBOR: {decoded!r}")


def main() -> int:
    available = readers()
    print(f"Readers: {[str(r) for r in available]}")
    picc = next((r for r in available if "PICC" in str(r)), None)
    if picc is None:
        print("No PICC reader found (expected 'ACS ACR1311 ... PICC 0').")
        return 1

    connection = picc.createConnection()
    try:
        connection.connect()
    except Exception as error:  # noqa: BLE001 - diagnostic only
        print(f"Connect failed — is the phone tapped and armed? {error}")
        return 1

    print(f"ATR: {toHexString(connection.getATR())}")

    # Step 1: SELECT companion AID
    data, sw1, sw2 = connection.transmit(SELECT_AID)
    print(f"[SELECT AID] SW={sw(sw1, sw2)} data={toHexString(data) if data else '(none)'}")
    if (sw1, sw2) == SW_FILE_NOT_FOUND:
        print("  -> 6A82: no armed session. Tap the 'Test NFC (arm HCE)' button, then retry.")
        return 2
    if (sw1, sw2) != SW_SUCCESS:
        print("  -> unexpected SW; HCE routing problem.")
        return 2
    print("  -> 9000: companion session armed. HCE SELECT routing OK.")

    # Step 2: GET_CAPABILITIES
    data, sw1, sw2 = connection.transmit(GET_CAPABILITIES)
    print(f"[GET_CAPABILITIES] SW={sw(sw1, sw2)}")
    if (sw1, sw2) != SW_SUCCESS:
        print("  -> unexpected SW; companion APDU handler problem.")
        return 3
    print("  -> 9000: capabilities returned. Companion protocol round-trip OK.")
    decode_capabilities(data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
