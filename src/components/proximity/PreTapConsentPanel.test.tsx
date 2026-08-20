import { fireEvent, render, screen } from '@testing-library/react-native'

import { getReaderProfileById } from '@/src/config/readerProfiles'

import { PreTapConsentPanel } from './PreTapConsentPanel'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockIcon() {
    return null
  }
})

describe('PreTapConsentPanel', () => {
  const profile = getReaderProfileById('mdl-acr1311u-n2-mdoc-only')

  test('shows reader-profile party, ceiling labels, and tap-time Face ID note', () => {
    expect(profile).toBeDefined()
    if (!profile) return

    render(<PreTapConsentPanel profile={profile} onAccept={jest.fn()} onDecline={jest.fn()} />)

    expect(screen.getByText('ข้อมูลที่เครื่องอ่านต้องการ')).toBeTruthy()
    expect(screen.queryByText(/mDL \(ACR1311U-N2, mdoc-only\)/)).toBeNull()
    expect(screen.getByText('ชื่อ')).toBeTruthy()
    expect(screen.getByText('นามสกุล')).toBeTruthy()
    expect(screen.getByText('วันเดือนปีเกิด')).toBeTruthy()
    expect(screen.getByText('ประเภทใบอนุญาต')).toBeTruthy()
    expect(screen.getByText('วันที่ออกใบอนุญาต')).toBeTruthy()
    expect(screen.getByText('วันหมดอายุ')).toBeTruthy()
    expect(screen.getByText(/เมื่อแตะเครื่องอ่าน/)).toBeTruthy()
    expect(screen.queryByText(/Vendor:/)).toBeNull()
    expect(screen.queryByText(/Mode:/)).toBeNull()
    expect(screen.queryByTestId('presentation-consent-verifier-logo')).toBeNull()
  })

  test('Accept and Decline fire without a field list for waiting copy', () => {
    expect(profile).toBeDefined()
    if (!profile) return

    const onAccept = jest.fn()
    const onDecline = jest.fn()
    render(<PreTapConsentPanel profile={profile} onAccept={onAccept} onDecline={onDecline} />)

    fireEvent.press(screen.getByText('รับทราบและยินยอมส่งข้อมูล'))
    fireEvent.press(screen.getByText('ไม่ยินยอม'))
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onDecline).toHaveBeenCalledTimes(1)
  })

  test('hides religion and shows given name above family name', () => {
    expect(profile).toBeDefined()
    if (!profile) return

    render(
      <PreTapConsentPanel
        profile={{
          ...profile,
          mdocFields: [
            { namespace: 'org.iso.18013.5.1', identifier: 'family_name' },
            { namespace: 'org.iso.18013.5.1', identifier: 'religion' },
            { namespace: 'org.iso.18013.5.1', identifier: 'given_name' },
          ],
        }}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
      />,
    )

    expect(screen.getByText('ชื่อ')).toBeTruthy()
    expect(screen.getByText('นามสกุล')).toBeTruthy()
    expect(screen.queryByText('ศาสนา')).toBeNull()
    const json = JSON.stringify(screen.toJSON())
    expect(json.indexOf('"ชื่อ"')).toBeLessThan(json.indexOf('"นามสกุล"'))
  })
})
