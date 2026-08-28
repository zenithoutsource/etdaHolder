import {
  normalizeMdocNamespaceKey,
  readApprovedMdocNamespaceKeysForPresentation,
  readRequestedMdocNamespaceKeys,
} from './mdocNamespaceKeys'
import type { ResolvedPresentationRequest } from './presentationService'

describe('mdocNamespaceKeys', () => {
  test('normalizes dotted ISO keys to namespace/identifier', () => {
    expect(normalizeMdocNamespaceKey('org.iso.18013.5.1.given_name')).toBe(
      'org.iso.18013.5.1/given_name',
    )
  })

  test('reads requested namespace keys from DCQL claim paths', () => {
    expect(
      readRequestedMdocNamespaceKeys({
        id: '0',
        format: 'mso_mdoc',
        claims: [
          { path: ['org.iso.18013.5.1', 'given_name'] },
          { path: ['org.iso.18013.5.1', 'family_name'] },
        ],
      }),
    ).toEqual([
      'org.iso.18013.5.1/given_name',
      'org.iso.18013.5.1/family_name',
    ])
  })

  test('filters approved keys by holder selection', () => {
    const request = {
      dcqlQuery: {
        credentials: [{
          id: '0',
          format: 'mso_mdoc',
          claims: [
            { path: ['org.iso.18013.5.1', 'given_name'] },
            { path: ['org.iso.18013.5.1', 'family_name'] },
          ],
        }],
      },
      matchedCredential: { id: 'mdoc-1', rawVc: 'mdoc:AQIDBA' },
    } as unknown as ResolvedPresentationRequest

    expect(
      readApprovedMdocNamespaceKeysForPresentation(request, ['org.iso.18013.5.1.given_name']),
    ).toEqual(['org.iso.18013.5.1/given_name'])
  })
})
