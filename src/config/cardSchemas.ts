export type DisplayField = {
  key: string
  label: string
  aliases?: string[]
}

export type CardSchemaConfig = {
  type: string
  title: string
  documentTitle: string
  issuerName: string
  primaryColor: string
  imageKey: 'profile' | 'id' | 'car' | 'transcript'
  displayFields: DisplayField[]
  summaryFields?: DisplayField[]
}

const FALLBACK_SCHEMA: CardSchemaConfig = {
  type: '__fallback__',
  title: 'Credential',
  documentTitle: 'DIGITAL DOCUMENT',
  issuerName: 'Unknown Issuer',
  primaryColor: '#374151',
  imageKey: 'profile',
  displayFields: [],
}

const SCHEMAS: CardSchemaConfig[] = [
  {
    type: 'ThaiNationalID',
    title: 'Thai National ID',
    documentTitle: 'ID CARD',
    issuerName: 'Department of Provincial Administration',
    primaryColor: '#002887',
    imageKey: 'id',
    displayFields: [
      { key: 'givenName', label: 'Given Name' },
      { key: 'familyName', label: 'Family Name' },
      { key: 'birthDate', label: 'Date of Birth' },
      { key: 'nationalId', label: 'ID Number' },
    ],
    summaryFields: [
      { key: 'nationalId', label: 'ID card', aliases: ['national_id', 'idNumber', 'id_number'] },
      { key: 'birthDate', label: 'Date of Birth', aliases: ['birth_date', 'dob'] },
    ],
  },
  {
    type: 'DLTDrivingLicence',
    title: 'Driving Licence',
    documentTitle: 'DRIVING LICENSE',
    issuerName: 'Department of Land Transport',
    primaryColor: '#123b8c',
    imageKey: 'car',
    displayFields: [
      { key: 'givenName', label: 'Given Name' },
      { key: 'familyName', label: 'Family Name' },
      { key: 'licenceNumber', label: 'Licence Number', aliases: ['licence_number', 'licenseNumber', 'license_number'] },
      { key: 'licenceClass', label: 'Class', aliases: ['licence_class', 'licenseClass', 'license_class'] },
      { key: 'expiryDate', label: 'Expiry Date', aliases: ['expiry_date', 'expirationDate'] },
    ],
    summaryFields: [
      { key: 'licenceNumber', label: 'Licence Number', aliases: ['licence_number', 'licenseNumber', 'license_number'] },
      { key: 'licenceClass', label: 'Class', aliases: ['licence_class', 'licenseClass', 'license_class'] },
      { key: 'expiryDate', label: 'Expiry Date', aliases: ['expiry_date', 'expirationDate'] },
    ],
  },
  {
    type: 'BangkokUniversityTranscript',
    title: 'Academic Transcript',
    documentTitle: 'TRANSCRIPT',
    issuerName: 'Bangkok University',
    primaryColor: '#123b8c',
    imageKey: 'transcript',
    displayFields: [
      { key: 'givenName', label: 'Given Name' },
      { key: 'familyName', label: 'Family Name' },
      { key: 'studentId', label: 'Student ID', aliases: ['student_id', 'studentID', 'student_number', 'studentNumber'] },
      { key: 'degree', label: 'Degree', aliases: ['degreeName', 'degree_name', 'program', 'programName'] },
      { key: 'faculty', label: 'Faculty', aliases: ['facultyName', 'faculty_name', 'school', 'schoolName'] },
      { key: 'gpa', label: 'GPA', aliases: ['GPA', 'gradePointAverage', 'grade_point_average'] },
    ],
    summaryFields: [
      { key: 'studentId', label: 'Student ID', aliases: ['student_id', 'studentID', 'student_number', 'studentNumber'] },
      { key: 'degree', label: 'Degree', aliases: ['degreeName', 'degree_name', 'program', 'programName'] },
      { key: 'faculty', label: 'Faculty', aliases: ['facultyName', 'faculty_name', 'school', 'schoolName'] },
      { key: 'gpa', label: 'GPA', aliases: ['GPA', 'gradePointAverage', 'grade_point_average'] },
    ],
  },
]

const SCHEMA_MAP = new Map<string, CardSchemaConfig>(
  SCHEMAS.map((s) => [s.type, s])
)

export function getCardSchema(type: string): CardSchemaConfig {
  return SCHEMA_MAP.get(type) ?? FALLBACK_SCHEMA
}

export function getAllCardSchemas(): CardSchemaConfig[] {
  return SCHEMAS
}
