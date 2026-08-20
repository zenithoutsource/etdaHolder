/**
 * Credential UI schema registry — titles, colors, display/summary fields, issuance confirm, disclosure labels.
 * Journey: every document card, issuance panel, and presentation disclosure list.
 * Copy: field labels and presentationLabel (Thai) live here.
 * Map: docs/CODEMAPS/frontend.md#copy-and-layout
 */

import { THEME } from './themeColors'
export type DisplayField = {
  key: string;
  label: string;
  presentationLabel?: string;
  aliases?: string[];
  /**
   * Extra keys that satisfy this field for OID4VP matching / SD-JWT selection.
   * Not used for credential-card rows (so given/family stay separate from fullName).
   */
  matchAliases?: string[];
  staticValue?: string;
  /** OID4VP Holder disclosure policy fallback when Issuer metadata is unavailable. */
  presentationDisclosure?: {
    md?: boolean;
    sd?: boolean;
  };
};

export type IssuanceVerificationConfig = {
  providerLabel: string;
  imageKey: "thaid";
};

export type IssuanceConfirmationConfig = {
  documentLabel: string;
  issuerLabel: string;
  imageKey: "dopa" | "dltt" | "chulalongkorn" | "profile";
  accent: "navy" | "pink";
};

export type CardSchemaConfig = {
  type: string;
  title: string;
  documentTitle: string;
  issuerName: string;
  primaryColor: string;
  imageKey: "profile" | "id" | "car" | "transcript";
  issuerLogoKey?: "thaid" | "dltt" | "chulalongkorn";
  displayFields: DisplayField[];
  summaryFields?: DisplayField[];
  summaryRows?: DisplayField[][];
  /** Divider style for summaryRows. 'horizontal' (default) = line above each row. 'vertical' = line between columns. 'both' = both. */
  summaryRowDivider?: "horizontal" | "vertical" | "both";
  /** Hide the Issue Date / Expiry Date footer row on document summary chrome. */
  hideSummaryValidityFooter?: boolean;
  /** When true, first successful presentation marks credential Used (P6 Case 3). */
  singleUse?: boolean;
  issuanceVerification?: IssuanceVerificationConfig;
  issuanceConfirmation?: IssuanceConfirmationConfig;
};

const FALLBACK_SCHEMA: CardSchemaConfig = {
  type: "__fallback__",
  title: "Credential",
  documentTitle: "DIGITAL DOCUMENT",
  issuerName: "Unknown Issuer",
  primaryColor: THEME.gray700,
  imageKey: "profile",
  displayFields: [],
};

const SCHEMAS: CardSchemaConfig[] = [
  {
    type: "ThaiNationalID",
    title: "บัตรประชาชน",
    documentTitle: "ID CARD",
    issuerName: "กรมการปกครอง",
    primaryColor: THEME.navy,
    imageKey: "id",
    issuerLogoKey: "thaid",
    displayFields: [
      { key: "givenName", label: "Given Name" },
      { key: "familyName", label: "Family Name" },
      {
        key: "fullName",
        label: "Full Name",
        presentationLabel: "ชื่อ-นามสกุล",
        aliases: ["full_name", "name"],
      },
      {
        key: "birthDate",
        label: "Date of Birth",
        presentationLabel: "วันเดือนปีเกิด",
        aliases: [
          "birthdate",
          "birth_date",
          "dateOfBirth",
          "date_of_birth",
          "dob",
        ],
      },
      {
        key: "nationalId",
        label: "ID Number",
        presentationLabel: "เลขบัตรประจำตัวประชาชน",
        aliases: ["id_number", "idNumber", "id_number_masked", "national_id"],
      },
      { key: "religion", label: "Religion", presentationLabel: "ศาสนา" },
      {
        key: "photo",
        label: "Photo",
        presentationLabel: "รูปถ่าย",
        aliases: ["portrait", "image"],
      },
      {
        key: "address",
        label: "Address",
        aliases: ["registeredAddress", "registered_address"],
      },
      {
        key: "issuanceDate",
        label: "Issue Date",
        aliases: ["issued", "issueDate", "issue_date"],
      },
      {
        key: "expiryDate",
        label: "Expiry Date",
        presentationLabel: "วันหมดอายุ",
        aliases: [
          "expiry_date",
          "expirationDate",
          "expiration_date",
          "validUntil",
          "valid_until",
        ],
      },
    ],
    summaryFields: [
      {
        key: "nationalId",
        label: "เลขบัตรประจำตัวประชาชน",
        aliases: ["national_id", "idNumber", "id_number"],
      },
      {
        key: "birthDate",
        label: "วันเดือนปีเกิด",
        aliases: ["birth_date", "dob"],
      },
    ],
    issuanceVerification: {
      providerLabel: "PID",
      imageKey: "thaid",
    },
    issuanceConfirmation: {
      documentLabel: "บัตรประชาชน",
      issuerLabel: "กรมการปกครอง",
      imageKey: "dopa",
      accent: "navy",
    },
  },
  {
    type: "DLTDrivingLicence",
    title: "ใบขับขี่",
    documentTitle: "DRIVER LICENSE",
    issuerName: "กรมการขนส่งทางบก",
    primaryColor: THEME.navyRoyal,
    imageKey: "car",
    issuerLogoKey: "dltt",
    displayFields: [
      {
        key: "givenName",
        label: "Given Name",
        presentationLabel: "ชื่อ",
        aliases: ["given_name"],
      },
      {
        key: "familyName",
        label: "Family Name",
        presentationLabel: "นามสกุล",
        aliases: ["family_name"],
      },
      {
        key: "fullName",
        label: "Full Name",
        presentationLabel: "ชื่อ-นามสกุล",
        aliases: ["full_name", "name"],
        matchAliases: [
          "givenName",
          "familyName",
          "given_name",
          "family_name",
          "firstName",
          "first_name",
          "lastName",
          "last_name",
        ],
      },
      {
        key: "birthDate",
        label: "Date of Birth",
        presentationLabel: "วันเดือนปีเกิด",
        aliases: [
          "birthdate",
          "birth_date",
          "dateOfBirth",
          "date_of_birth",
          "dob",
        ],
      },
      {
        key: "licenceNumber",
        label: "Licence Number",
        presentationLabel: "เลขที่ใบอนุญาตขับรถ",
        aliases: [
          "licence_number",
          "licenseNumber",
          "license_number",
          "document_number",
          "documentNumber",
        ],
      },
      {
        key: "licenceClass",
        label: "Class",
        presentationLabel: "ประเภทใบอนุญาต",
        aliases: [
          "licence_class",
          "licenseClass",
          "license_class",
          "license_type",
          "licence_type",
          "licenseType",
          "licenceType",
          "driving_privileges",
        ],
      },
      {
        key: "issuingCountry",
        label: "Issuing Country",
        presentationLabel: "ประเทศผู้ออก",
        aliases: ["issuing_country"],
      },
      {
        key: "issuingAuthority",
        label: "Issuing Authority",
        presentationLabel: "หน่วยงานผู้ออก",
        aliases: ["issuing_authority"],
      },
      {
        key: "issuanceDate",
        label: "Issue Date",
        presentationLabel: "วันที่ออกใบอนุญาต",
        aliases: ["issued", "issueDate", "issue_date"],
      },
      {
        key: "expiryDate",
        label: "Expiry Date",
        presentationLabel: "วันหมดอายุ",
        aliases: ["expiry_date", "expirationDate"],
      },
      {
        key: "photo",
        label: "Photo",
        presentationLabel: "รูปถ่าย",
        aliases: ["portrait", "image"],
      },
      {
        key: "unDistinguishingSign",
        label: "UN Distinguishing Sign",
        presentationLabel: "รหัสประเทศ",
        aliases: ["un_distinguishing_sign"],
      },
      {
        key: "ageOver18",
        label: "Over 18",
        presentationLabel: "อายุเกิน 18 ปี",
        aliases: ["age_over_18"],
      },
      {
        key: "sex",
        label: "Sex",
        presentationLabel: "เพศ",
        aliases: ["gender"],
      },
      {
        key: "nationality",
        label: "Nationality",
        presentationLabel: "สัญชาติ",
      },
      {
        key: "residentAddress",
        label: "Resident Address",
        presentationLabel: "ที่อยู่",
        aliases: ["resident_address"],
      },
      {
        key: "birthPlace",
        label: "Place of Birth",
        presentationLabel: "สถานที่เกิด",
        aliases: ["birth_place"],
      },
      {
        key: "height",
        label: "Height",
        presentationLabel: "ส่วนสูง",
      },
      {
        key: "weight",
        label: "Weight",
        presentationLabel: "น้ำหนัก",
      },
      {
        key: "eyeColour",
        label: "Eye Colour",
        presentationLabel: "สีตา",
        aliases: ["eye_colour", "eye_color"],
      },
      {
        key: "hairColour",
        label: "Hair Colour",
        presentationLabel: "สีผม",
        aliases: ["hair_colour", "hair_color"],
      },
    ],
    summaryFields: [
      {
        key: "licenceNumber",
        label: "Licence Number",
        aliases: [
          "licence_number",
          "licenseNumber",
          "license_number",
          "document_number",
          "documentNumber",
        ],
      },
      {
        key: "licenceClass",
        label: "Class",
        aliases: ["licence_class", "licenseClass", "license_class"],
      },
      {
        key: "expiryDate",
        label: "Expiry Date",
        aliases: ["expiry_date", "expirationDate"],
      },
    ],
    issuanceConfirmation: {
      documentLabel: "ใบอนุญาตขับขี่",
      issuerLabel: "กรมการขนส่งทางบก",
      imageKey: "dltt",
      accent: "navy",
    },
  },
  {
    type: "ChulalongkornUniversityTranscript",
    title: "ใบแสดงผลการเรียน",
    documentTitle: "TRANSCRIPT",
    issuerName: "มหาวิทยาลัยจุฬาลงกรณ์",
    primaryColor: THEME.navyRoyal,
    imageKey: "transcript",
    issuerLogoKey: "chulalongkorn",
    displayFields: [
      { key: "givenName", label: "Given Name" },
      { key: "familyName", label: "Family Name" },
      {
        key: "fullName",
        label: "Full Name",
        presentationLabel: "ชื่อ-นามสกุล",
        aliases: ["full_name", "name"],
        presentationDisclosure: { md: true },
      },
      {
        key: "birthDate",
        label: "Date of Birth",
        presentationLabel: "วันเดือนปีเกิด",
        aliases: [
          "birthdate",
          "birth_date",
          "dateOfBirth",
          "date_of_birth",
          "dob",
        ],
      },
      {
        key: "studentId",
        label: "Student ID",
        presentationLabel: "รหัสนักศึกษา",
        aliases: ["student_id", "studentID", "student_number", "studentNumber"],
        presentationDisclosure: { md: true },
      },
      {
        key: "degree",
        label: "Degree",
        presentationLabel: "วุฒิการศึกษา",
        aliases: ["degreeName", "degree_name", "program", "programName"],
        presentationDisclosure: { md: true },
      },
      {
        key: "faculty",
        label: "Faculty",
        presentationLabel: "คณะ / สาขาวิชา",
        aliases: ["facultyName", "faculty_name", "school", "schoolName"],
        presentationDisclosure: { md: true },
      },
      {
        key: "gpa",
        label: "GPA",
        presentationLabel: "เกรดเฉลี่ย",
        aliases: ["GPAX", "gradePointAverage", "grade_point_average"],
        presentationDisclosure: { sd: true },
      },
      {
        key: "grades",
        label: "Grades",
        presentationLabel: "ผลการเรียน",
        aliases: ["grade_list", "gradeList"],
        presentationDisclosure: { sd: true },
      },
      {
        key: "graduationYear",
        label: "Graduation Year",
        presentationLabel: "วันสำเร็จการศึกษา",
        aliases: [
          "graduation_year",
          "gradYear",
          "grad_year",
          "graduationDate",
          "graduation_date",
        ],
        presentationDisclosure: { sd: true },
      },
      {
        key: "institutionName",
        label: "Institution Name",
        presentationLabel: "ชื่อสถาบัน",
        aliases: [
          "institution_name",
          "university",
          "universityName",
          "university_name",
        ],
        presentationDisclosure: { md: true, sd: false },
      },
      {
        key: "expiryDate",
        label: "Expiry Date",
        presentationLabel: "วันหมดอายุ",
        aliases: [
          "expiry_date",
          "expirationDate",
          "expiration_date",
          "validUntil",
          "valid_until",
        ],
      },
    ],
    summaryFields: [
      {
        key: "studentId",
        label: "เลขประจำตัวนิสิต",
        aliases: ["student_id", "studentID", "student_number", "studentNumber"],
      },
      {
        key: "faculty",
        label: "คณะ",
        aliases: ["facultyName", "faculty_name", "school", "schoolName"],
      },
      {
        key: "degree",
        label: "สาขาวิชา",
        aliases: ["degreeName", "degree_name", "program", "programName"],
      },
    ],
    summaryRows: [
      [
        {
          key: "university",
          label: "มหาวิทยาลัย",
          staticValue: "มหาวิทยาลัยกรุงเทพ",
        },
        {
          key: "gpa",
          label: "เกรดเฉลี่ยสะสม",
          aliases: ["GPA", "gradePointAverage", "grade_point_average"],
        },
      ],
      [
        {
          key: "studyStatus",
          label: "Education Status",
          staticValue: "สำเร็จการศึกษา",
        },
        { key: "issuedAt", label: "Issue Date" },
      ],
    ],
    summaryRowDivider: "both",
    hideSummaryValidityFooter: true,
    issuanceConfirmation: {
      documentLabel: "ใบแสดงผลการเรียน",
      issuerLabel: "จุฬาลงกรณ์มหาวิทยาลัย",
      imageKey: "chulalongkorn",
      accent: "pink",
    },
  },
  {
    type: "MedicalCertificate",
    title: "Medical Certificate",
    documentTitle: "MEDICAL CERTIFICATE",
    issuerName: "Licensed Medical Practitioner",
    primaryColor: THEME.success,
    imageKey: "profile",
    singleUse: true,
    displayFields: [
      {
        key: "fullName",
        label: "Patient Name",
        presentationLabel: "ชื่อ-นามสกุลผู้ป่วย",
        aliases: ["full_name", "name", "givenName", "familyName"],
      },
      {
        key: "diagnosis",
        label: "Diagnosis",
        presentationLabel: "การวินิจฉัย",
        aliases: ["diagnosis_text", "condition"],
      },
      {
        key: "issuedAt",
        label: "Issue Date",
        presentationLabel: "วันที่ออกใบรับรอง",
        aliases: ["issuanceDate", "issuance_date", "issue_date"],
      },
      {
        key: "expiryDate",
        label: "Expiry Date",
        presentationLabel: "วันหมดอายุ",
        aliases: ["expiry_date", "expirationDate", "validUntil", "valid_until"],
      },
    ],
    issuanceConfirmation: {
      documentLabel: "ใบรับรองแพทย์",
      issuerLabel: "โรงพยาบาล",
      imageKey: "profile",
      accent: "navy",
    },
  },
];

const SCHEMA_MAP = new Map<string, CardSchemaConfig>(
  SCHEMAS.map((s) => [s.type, s]),
);

import {
  normalizeClaimKey,
  readMdocElementIdentifier,
} from '@/src/utils/claimKeyNormalization';

export { normalizeClaimKey as normalizeClaimLabelKey };

function matchDisplayField(
  fields: DisplayField[],
  claimKey: string,
): DisplayField | undefined {
  const normalizedKey = normalizeClaimKey(claimKey);
  return fields.find(
    (field) =>
      normalizeClaimKey(field.key) === normalizedKey ||
      (field.aliases ?? []).some(
        (alias) => normalizeClaimKey(alias) === normalizedKey,
      ),
  );
}

export function findDisplayFieldForClaimKey(
  fields: DisplayField[],
  claimKey: string,
): DisplayField | undefined {
  return (
    matchDisplayField(fields, claimKey) ??
    matchDisplayField(fields, readMdocElementIdentifier(claimKey))
  );
}

export function collectDisplayFieldMatchKeys(field: DisplayField): string[] {
  return [field.key, ...(field.aliases ?? []), ...(field.matchAliases ?? [])];
}

export function resolvePresentationDisclosureLabel(
  documentType: string,
  claimKey: string,
): string {
  const field = findDisplayFieldForClaimKey(
    getCardSchema(documentType).displayFields,
    claimKey,
  );
  return field?.presentationLabel ?? field?.label ?? claimKey;
}

export function getCardSchema(type: string): CardSchemaConfig {
  return SCHEMA_MAP.get(type) ?? FALLBACK_SCHEMA;
}

export function getAllCardSchemas(): CardSchemaConfig[] {
  return SCHEMAS;
}

export function getCardSchemaForConfigurationId(
  configurationId?: string,
): CardSchemaConfig {
  if (!configurationId) return FALLBACK_SCHEMA;

  const normalized = configurationId.toLowerCase();
  if (normalized.includes("transcript"))
    return getCardSchema("ChulalongkornUniversityTranscript");
  if (
    normalized.includes("medical") ||
    normalized.includes("medicine") ||
    normalized.includes("medcert")
  ) {
    return getCardSchema("MedicalCertificate");
  }
  if (
    normalized.includes("driving") ||
    normalized.includes("licence") ||
    normalized.includes("license") ||
    normalized.includes("mdl") ||
    normalized.includes("1801351mdl")
  ) {
    return getCardSchema("DLTDrivingLicence");
  }
  if (
    normalized.includes("thai") ||
    normalized.includes("national") ||
    normalized.includes("idcard") ||
    normalized.includes("id_card")
  ) {
    return getCardSchema("ThaiNationalID");
  }

  return FALLBACK_SCHEMA;
}
