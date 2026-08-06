import type { ImageSourcePropType } from 'react-native'

export type DrivingLicenceSample = Readonly<{
  documentTitle: string
  thaiName: string
  englishName: string
  birthDate: string
  type: string
  englishType: string
  licenceNumber: string
  issueDate: string
  expiryDate: string
}>

export const DRIVING_LICENCE_SAMPLE: DrivingLicenceSample = {
  documentTitle: 'DRIVING LICENSE',
  thaiName: '\u0e19\u0e32\u0e07\u0e2a\u0e32\u0e27 \u0e1e\u0e34\u0e0a\u0e0d\u0e32 \u0e23\u0e38\u0e48\u0e07\u0e40\u0e23\u0e37\u0e2d\u0e07\u0e01\u0e34\u0e15',
  englishName: 'Ms. Pichaya Rungruangkit',
  birthDate: '15 \u0e1e\u0e24\u0e29\u0e20\u0e32\u0e04\u0e21 2530',
  type: '\u0e23\u0e16\u0e22\u0e19\u0e15\u0e4c\u0e2a\u0e48\u0e27\u0e19\u0e1a\u0e38\u0e04\u0e04\u0e25',
  englishType: 'Private Motor Car',
  licenceNumber: '54002891',
  issueDate: '20 \u0e21\u0e01\u0e23\u0e32\u0e04\u0e21 2565',
  expiryDate: '20 \u0e21\u0e01\u0e23\u0e32\u0e04\u0e21 2570',
}

export const DRIVING_LICENCE_IMAGE = require('../../assets/images/user_profile.png') as ImageSourcePropType
