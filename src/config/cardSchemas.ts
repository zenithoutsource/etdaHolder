import { THEME } from './themeColors'
export type DisplayField = {
  key: string;
  label: string;
  presentationLabel?: string;
  aliases?: string[];
  staticValue?: string;
};

export type IssuanceVerificationConfig = {
  providerLabel: string;
  imageKey: "thaid";
};

export type IssuanceConfirmationConfig = {
  documentLabel: string;
  issuerLabel: string;
  imageKey: "dopa";
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
  /** Hide the Issue Date / Expiry Date footer row in PresentationCredentialSummaryCard. */
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
    title: "Thai National ID",
    documentTitle: "ID CARD",
    issuerName: "Department of Provincial Administration",
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
      providerLabel: "ThaID",
      imageKey: "thaid",
    },
    issuanceConfirmation: {
      documentLabel: "บัตรประชาชน",
      issuerLabel: "กรมการปกครอง",
      imageKey: "dopa",
    },
  },
  {
    type: "DLTDrivingLicence",
    title: "Driving Licence",
    documentTitle: "DRIVING LICENSE",
    issuerName: "Department of Land Transport",
    primaryColor: THEME.navyRoyal,
    imageKey: "car",
    issuerLogoKey: "dltt",
    displayFields: [
      {
        key: "givenName",
        label: "Given Name",
        aliases: ["given_name"],
      },
      {
        key: "familyName",
        label: "Family Name",
        aliases: ["family_name"],
      },
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
        aliases: ["licence_class", "licenseClass", "license_class"],
      },
      {
        key: "issuingCountry",
        label: "Issuing Country",
        aliases: ["issuing_country"],
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
  },
  {
    type: "BangkokUniversityTranscript",
    title: "Academic Transcript",
    documentTitle: "TRANSCRIPT",
    issuerName: "Chulalongkorn University",
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
      },
      {
        key: "degree",
        label: "Degree",
        presentationLabel: "วุฒิการศึกษา",
        aliases: ["degreeName", "degree_name", "program", "programName"],
      },
      {
        key: "faculty",
        label: "Faculty",
        presentationLabel: "คณะ / สาขาวิชา",
        aliases: ["facultyName", "faculty_name", "school", "schoolName"],
      },
      {
        key: "gpa",
        label: "GPA",
        presentationLabel: "เกรดเฉลี่ย",
        aliases: ["GPAX", "gradePointAverage", "grade_point_average"],
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
  },
];

const SCHEMA_MAP = new Map<string, CardSchemaConfig>(
  SCHEMAS.map((s) => [s.type, s]),
);

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
    return getCardSchema("BangkokUniversityTranscript");
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
