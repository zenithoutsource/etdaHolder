import type { DcqlClaimsQuery } from './presentationService'

/**
 * Map a DCQL claim query to SD-JWT disclosure claim keys.
 * EUDI PID age claims use path ["age_equal_or_over", "21"] but the SD-JWT
 * disclosure array names the nested element ("21"), not the parent path.
 */
export function readSdJwtDisclosureKeysForDcqlClaim(claim: DcqlClaimsQuery): string[] {
  const keys = new Set<string>()
  if (claim.id) keys.add(claim.id)
  for (const segment of claim.path) {
    if (segment) keys.add(segment)
  }
  return [...keys]
}

export function expandDcqlSelectedKeysForSdJwt(
  claims: readonly DcqlClaimsQuery[],
  selectedKeys: readonly string[],
): string[] {
  const claimByHolderKey = new Map<string, DcqlClaimsQuery>()
  for (const claim of claims) {
    const holderKey = claim.path[0]
    if (holderKey) claimByHolderKey.set(holderKey, claim)
    if (claim.id) claimByHolderKey.set(claim.id, claim)
  }

  const expanded = new Set<string>()
  for (const key of selectedKeys) {
    const claim = claimByHolderKey.get(key)
    if (claim) {
      for (const disclosureKey of readSdJwtDisclosureKeysForDcqlClaim(claim)) {
        expanded.add(disclosureKey)
      }
      continue
    }
    expanded.add(key)
  }

  return [...expanded]
}
