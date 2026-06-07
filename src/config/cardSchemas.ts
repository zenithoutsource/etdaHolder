export type DisplayField = {
  key: string
  label: string
  aliases?: string[]
}

export type CardSchemaConfig = {
  type: string
  title: string
  issuerName: string
  primaryColor: string
  logo?: string
  displayFields: DisplayField[]
}

const FALLBACK_SCHEMA: CardSchemaConfig = {
  type: '__fallback__',
  title: 'Credential',
  issuerName: 'Unknown Issuer',
  primaryColor: '#374151',
  displayFields: [],
}

const SCHEMAS: CardSchemaConfig[] = [
  {
    type: 'ThaiNationalID',
    title: 'Thai National ID',
    issuerName: 'Department of Provincial Administration',
    primaryColor: '#002887',
    displayFields: [
      { key: 'givenName', label: 'Given Name' },
      { key: 'familyName', label: 'Family Name' },
      { key: 'birthDate', label: 'Date of Birth' },
      { key: 'nationalId', label: 'ID Number' },
    ],
  },
  {
    type: 'DLTDrivingLicence',
    title: 'Driving Licence',
    issuerName: 'Department of Land Transport',
    primaryColor: '#7c3aed',
    displayFields: [
      { key: 'givenName', label: 'Given Name' },
      { key: 'familyName', label: 'Family Name' },
      { key: 'licenceNumber', label: 'Licence Number' },
      { key: 'licenceClass', label: 'Class' },
      { key: 'expiryDate', label: 'Expiry Date' },
    ],
  },
  {
    type: 'BangkokUniversityTranscript',
    title: 'Academic Transcript',
    issuerName: 'Bangkok University',
    primaryColor: '#b45309',
    displayFields: [
      { key: 'givenName', label: 'Given Name' },
      { key: 'familyName', label: 'Family Name' },
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
