import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native'

import type { CredentialDetailDisplay, CredentialDisplayRow } from '../services/credentials/credentialDisplay'

const credentialImages: Record<CredentialDetailDisplay['imageKey'], ImageSourcePropType> = {
  profile: require('../../assets/images/profile.png'),
  id: require('../../assets/images/user_profile.png'),
  car: require('../../assets/images/car.png'),
  transcript: require('../../assets/images/user_profile.png'),
}
const qrCodeIcon = require('../../assets/images/qr_code.png') as ImageSourcePropType

type Props = {
  display: CredentialDetailDisplay
  onOpenQr: () => void
}

const NAME_ROW_KEYS = new Set(['givenName', 'familyName'])
const PRIMARY_ID_KEYS = ['nationalId', 'licenceNumber', 'studentId', 'idNumber']

function pickPrimaryId(rows: CredentialDisplayRow[]): CredentialDisplayRow | undefined {
  return (
    PRIMARY_ID_KEYS.map((key) => rows.find((row) => row.key === key)).find(Boolean) ??
    rows.find((row) => /id|number|licen[cs]e/i.test(`${row.key} ${row.label}`))
  )
}

function splitRows(rows: CredentialDisplayRow[]): [CredentialDisplayRow[], CredentialDisplayRow[]] {
  const midpoint = Math.ceil(rows.length / 2)
  return [rows.slice(0, midpoint), rows.slice(midpoint)]
}

function DetailValue({ row }: { row: CredentialDisplayRow }) {
  const isExpiry = /expir|หมดอายุ/i.test(`${row.key} ${row.label}`)

  return (
    <View style={styles.detailItem}>
      <Text style={styles.label}>{row.label}</Text>
      <Text style={[styles.detailValue, isExpiry ? styles.expiryValue : null]}>{row.value}</Text>
    </View>
  )
}

export function CredentialDocumentDetailCard({ display, onOpenQr }: Props) {
  const primaryId = pickPrimaryId(display.primaryRows)
  const isPortraitArtwork = display.imageKey === 'id' || display.imageKey === 'transcript'
  const detailRows = [...display.primaryRows, ...display.extraRows].filter((row) => {
    if (NAME_ROW_KEYS.has(row.key)) return false
    if (primaryId && row.key === primaryId.key) return false
    return true
  })
  const [leftRows, rightRows] = splitRows(detailRows)

  return (
    <View>
      <View
        testID="document-detail-card"
        style={styles.card}>
        <View
          testID="document-detail-band-wrap"
          style={[styles.band, { backgroundColor: display.primaryColor || '#123b8c' }]}>
          <Text testID="document-detail-band" style={styles.bandText}>
            {display.documentTitle}
          </Text>
        </View>

        <View testID="document-detail-hero" style={styles.hero}>
          <View testID="document-detail-photo" style={styles.photoFrame}>
            <Image
              testID="document-detail-image"
              source={credentialImages[display.imageKey]}
              style={isPortraitArtwork ? styles.photo : styles.containedArtwork}
              resizeMode={isPortraitArtwork ? 'cover' : 'contain'}
              accessibilityLabel={display.title}
            />
          </View>

          <View style={styles.identityPanel}>
            <Text style={styles.label}>Name</Text>
            <Text testID="document-detail-name" style={styles.nameValue}>
              {display.primaryText}
            </Text>
            <Text style={styles.romanizedName}>{display.title}</Text>

            {primaryId ? (
              <>
                <Text style={styles.label}>{primaryId.label}</Text>
                <Text testID="document-detail-primary-id" style={styles.primaryIdValue}>
                  {primaryId.value}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.detailGrid}>
          <View testID="document-detail-left-column" style={[styles.detailColumn, styles.leftColumn]}>
            {leftRows.map((row) => (
              <DetailValue key={row.key} row={row} />
            ))}
          </View>
          <View testID="document-detail-right-column" style={styles.detailColumn}>
            {rightRows.map((row) => (
              <DetailValue key={row.key} row={row} />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.qrActionRow}>
        <Pressable
          testID="document-detail-my-qr"
          style={styles.qrAction}
          onPress={onOpenQr}
          accessibilityRole="button"
          accessibilityLabel="Open My QR">
          <Image source={qrCodeIcon} style={styles.qrIcon} resizeMode="contain" />
          <Text style={styles.qrActionText}>My QR</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    elevation: 4,
    overflow: 'hidden',
    shadowColor: '#0f2849',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  band: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    minHeight: 48,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 11,
    width: '100%',
  },
  bandText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.5,
    lineHeight: 24,
  },
  hero: {
    borderBottomColor: '#eef2f8',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: 148,
  },
  photoFrame: {
    alignItems: 'center',
    backgroundColor: '#c8d4e0',
    flexShrink: 0,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 120,
  },
  photo: {
    height: '100%',
    width: '100%',
  },
  containedArtwork: {
    height: 82,
    width: 82,
  },
  identityPanel: {
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    padding: 12,
  },
  label: {
    color: '#8a9bb0',
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 14,
  },
  nameValue: {
    color: '#002887',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  romanizedName: {
    color: '#8a9bb0',
    fontSize: 10.5,
    marginBottom: 6,
  },
  primaryIdValue: {
    color: '#002887',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    lineHeight: 18,
  },
  detailGrid: {
    flexDirection: 'row',
  },
  detailColumn: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  leftColumn: {
    borderRightColor: '#eef2f8',
    borderRightWidth: 1,
  },
  detailItem: {
    marginBottom: 8,
  },
  detailValue: {
    color: '#1a2a42',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  expiryValue: {
    color: '#e53935',
  },
  qrActionRow: {
    alignItems: 'flex-end',
    marginTop: 10,
  },
  qrAction: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 12,
    borderWidth: 1,
    elevation: 2,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#0f2849',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  qrIcon: {
    height: 26,
    tintColor: '#9aabbf',
    width: 26,
  },
  qrActionText: {
    color: '#002887',
    fontSize: 10,
    fontWeight: '600',
  },
})
