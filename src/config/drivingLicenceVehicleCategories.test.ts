import { resolveDrivingLicenceVehicleType, formatDrivingLicenceVehicleTypeDisplay } from './drivingLicenceVehicleCategories'

describe('resolveDrivingLicenceVehicleType', () => {
  test('maps ISO category B to Thai and English vehicle type names', () => {
    expect(resolveDrivingLicenceVehicleType('B')).toEqual({
      thai: 'รถยนต์ส่วนบุคคล',
      english: 'Private Motor Car',
    })
  })

  test('maps ISO category A to motorcycle labels', () => {
    expect(resolveDrivingLicenceVehicleType('A')).toEqual({
      thai: 'รถจักรยานยนต์',
      english: 'Motorcycle',
    })
  })

  test('maps ISO categories C and D', () => {
    expect(resolveDrivingLicenceVehicleType('C')).toEqual({
      thai: 'รถบรรทุก',
      english: 'Goods Vehicle',
    })
    expect(resolveDrivingLicenceVehicleType('D')).toEqual({
      thai: 'รถโดยสาร',
      english: 'Bus',
    })
  })

  test('normalizes lowercase codes', () => {
    expect(resolveDrivingLicenceVehicleType('b')?.thai).toBe('รถยนต์ส่วนบุคคล')
  })

  test('resolves an already-Thai licence class via reverse lookup', () => {
    expect(resolveDrivingLicenceVehicleType('รถยนต์ส่วนบุคคล')).toEqual({
      thai: 'รถยนต์ส่วนบุคคล',
      english: 'Private Motor Car',
    })
  })

  test('returns undefined for joined codes and unknown values', () => {
    expect(resolveDrivingLicenceVehicleType('A, B')).toBeUndefined()
    expect(resolveDrivingLicenceVehicleType('Z')).toBeUndefined()
    expect(resolveDrivingLicenceVehicleType(undefined)).toBeUndefined()
  })
})

describe('formatDrivingLicenceVehicleTypeDisplay', () => {
  test('maps ISO category B to the Thai vehicle type', () => {
    expect(formatDrivingLicenceVehicleTypeDisplay('B')).toBe('รถยนต์ส่วนบุคคล')
  })

  test('maps ISO category A to the Thai motorcycle label', () => {
    expect(formatDrivingLicenceVehicleTypeDisplay('A')).toBe('รถจักรยานยนต์')
  })

  test('maps joined ISO categories to Thai names', () => {
    expect(formatDrivingLicenceVehicleTypeDisplay('A, B')).toBe('รถจักรยานยนต์, รถยนต์ส่วนบุคคล')
  })

  test('leaves unknown and English issuer text unchanged', () => {
    expect(formatDrivingLicenceVehicleTypeDisplay('Z')).toBe('Z')
    expect(formatDrivingLicenceVehicleTypeDisplay('Private Car')).toBe('Private Car')
    expect(formatDrivingLicenceVehicleTypeDisplay(undefined)).toBeUndefined()
  })
})
