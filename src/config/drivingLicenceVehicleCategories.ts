export type DrivingLicenceVehicleType = Readonly<{
  thai: string
  english: string
}>

const DRIVING_LICENCE_VEHICLE_TYPES: Readonly<Record<string, DrivingLicenceVehicleType>> = {
  A: { thai: 'รถจักรยานยนต์', english: 'Motorcycle' },
  B: { thai: 'รถยนต์ส่วนบุคคล', english: 'Private Motor Car' },
  C: { thai: 'รถบรรทุก', english: 'Goods Vehicle' },
  D: { thai: 'รถโดยสาร', english: 'Bus' },
}

export function resolveDrivingLicenceVehicleType(
  licenceClass?: string,
): DrivingLicenceVehicleType | undefined {
  if (!licenceClass) return undefined

  const trimmed = licenceClass.trim()
  if (!trimmed) return undefined

  const byCode = DRIVING_LICENCE_VEHICLE_TYPES[trimmed.toUpperCase()]
  if (byCode) return byCode

  return Object.values(DRIVING_LICENCE_VEHICLE_TYPES).find((entry) => entry.thai === trimmed)
}

/** Holder-facing Thai vehicle type; unknown or non-ISO text is left unchanged. */
export function formatDrivingLicenceVehicleTypeDisplay(value?: string): string | undefined {
  if (!value) return undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined

  const tokens = trimmed.split(',').map((part) => part.trim()).filter(Boolean)
  if (tokens.length === 0) return undefined

  const mapped = tokens.map((token) => resolveDrivingLicenceVehicleType(token)?.thai)
  if (mapped.every((name): name is string => Boolean(name))) {
    return mapped.join(', ')
  }

  return trimmed
}
