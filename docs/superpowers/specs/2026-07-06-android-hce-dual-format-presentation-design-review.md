# รีวิว: Android HCE Dual-Format Presentation Design

**เอกสารที่รีวิว:** [`2026-07-03-android-hce-dual-format-presentation-design.md`](./2026-07-03-android-hce-dual-format-presentation-design.md)  
**สถานะเอกสารต้นทาง:** **Approved** (rev 4 — 2026-07-06)  
**วันที่รีวิวล่าสุด:** 2026-07-06  
**ผู้รีวิว:** AI agent

---

## สรุปภาพรวม (rev 4)

**ผ่าน — spec พร้อมใช้เป็นแหล่งอ้างอิงสำหรับ implementation planning**

เอกสารขึ้นสถานะ **Approved** พร้อมข้อจำกัดชัด: implement dual-format NFC ยังต้องรอ **ETDA companion APDU spec** และ **EdDSA interop test pass** ก่อน

rev 4 ปิดประเด็นที่เหลือจากรีวิว rev 3 ครบ:

| ประเด็น (rev 3) | rev 4 |
|---|---|
| กฎ grouping ฝั่ง Issuer (Section 6) | ✅ suffix `_dc+sd-jwt` / `_mso_mdoc` + metadata `logical_credential_id` ชนะ naming |
| Renewal vs `credentialRenewalService` | ✅ Migration: renewal v1 = SD-JWT-only; mDOC renewal = later slice |
| Test matrix — subset ของ profile | ✅ เพิ่มเคสบรรทัด ~347 |
| Reader identity บน consent (v1) | ✅ Section 10: แสดง profile name + document type แทน |

---

## จุดแข็งหลัก (คงจาก rev 3)

1. **ขอบเขตมาตรฐาน** — แยก ISO 18013-5 กับ ETDA extension; OID4VCI/OID4VP/dual NFC ชัด
2. **Relationship To Prior Specs** — amend spec 2026-06-23; HCE APDU แทน BLE data leg บนมือถือ
3. **Data model + migration** — `LogicalCredential` เป็น linking layer; lazy migration; UI ยังอิง SD-JWT `id`
4. **Pre-tap request resolution** — fixed ETDA reader profile ใน `src/config/`; approve = ceiling
5. **ความปลอดภัย** — consent-first, screen on, one biometric, signed companion, logging rules
6. **Holder key** — seed Ed25519 เดียว + P-256 fallback ถ้า interop ไม่ผ่าน
7. **Implementation stack** — Multipaz เป็น leading candidate ตาม ADR 0006; ไม่ lock ก่อนทดสอบเครื่องจริง

---

## สิ่งที่ยังเป็น dependency (ไม่ใช่ defect ของ spec)

| Dependency | หมายเหตุ |
|---|---|
| **ETDA companion APDU spec** | AID, CLA/INS, nonce — ต้องมีก่อน implement dual-format NFC |
| **EdDSA interop บน ACR1311U-N2** | test matrix บังคับรันก่อน — gate การเลือก P-256 fallback |
| **Follow-up ADR** | หลัง interop เลือก native mDOC module (Multipaz หรืออื่น) |
| **OID4VP multi-format `vp_token`** | acceptance criteria ระบุเป็นงานใหม่ — แยกจาก NFC slice |

---

## ข้อสังเกตเล็กน้อย (ไม่บล็อก approve)

1. **Config ที่ต้องสร้างตอน implement** — ETDA reader profile (`src/config/`), `EXPO_PUBLIC_DUAL_FORMAT_ISSUE_SKEW_MS`, `EXPO_PUBLIC_HCE_ARM_WINDOW_MS`, `EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES` ยังไม่มีใน `.env.example` จนกว่าจะลงมือ implement (spec กำหนดไว้แล้ว)
2. **โค้ด proximity ปัจจุบันยังไม่ตรง spec** — `present.tsx` / `proximityStore` ยัง tap-first; refactor ตาม spec เป็นงาน implement ถัดไป
3. **`mso_mdoc` claim** — ยัง `CredentialFormatUnsupported` ใน `exchangeService` — งาน issuance slice แยก
4. **Sharing mode (mDOC-only vs dual)** — user เลือกบน consent screen แต่ยังไม่ระบุ default ถ้า reader ไม่ส่งสัญญาณก่อนแตะ (v1 อาศัย user เลือก + profile config — ยอมรับได้)

---

## เทียบกับโค้ดปัจจุบัน

| หัวข้อ | Spec (Approved rev 4) | โค้ดวันนี้ |
|---|---|---|
| สถานะ spec | Approved | — |
| NFC consent | ก่อนแตะ → arm HCE | หลังแตะ → `ConsentPanel` |
| Dual issuance | claim สอง format | SD-JWT เท่านั้น |
| Logical credential | linking layer | flat `VerifiableCredentialRecord` |
| OID4VP dual | สอง format / `vp_token` | credential เดียว |
| NFC dual-format | รอ companion APDU spec | `expo-mdoc-proximity` stub |

---

## คำแนะนำขั้นตอนถัดไป

1. Track ใน `docs/TASKS.md`: ETDA companion APDU spec, dual-format issuance, proximity refactor (consent-first), OID4VP multi-format
2. หลังได้ reader จริง: รัน EdDSA interop ก่อน — ตาม test matrix
3. หลัง interop: ADR เลือก mDOC native module
4. Implement ETDA reader profile ใน `src/config/` คู่กับ ACR1311U-N2 template ที่ lock

---

## สรุปท้าย

**rev 4 สมบูรณ์ในระดับ design spec** — ไม่มีช่องว่าง architecture ที่บล็อกการวางแผน implement อีกแล้ว

การลงมือเขียนโค้ด NFC dual-format ยัง **gated** ตามที่ spec ระบุเอง: companion APDU spec + EdDSA interop

---

## ประวัติรีวิว

| รอบ | สถานะ spec | สรุป |
|---|---|---|
| rev 2 | Draft | architecture ดี แต่ขาด pre-tap / migration / BLE reconcile |
| rev 3 | Draft | แก้ประเด็นใหญ่ครบ — แนะนำ approve ระดับ design |
| rev 4 | **Approved** | ปิดรายละเอียยเล็กน้อยครบ — **ผ่านรีวิว** |
