import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCardSchema } from '../../src/config/cardSchemas';
import { useScreenCaptureGuard } from '../../src/hooks/useScreenCaptureGuard';
import {
  acquireCredentialRecord,
  resolveOffer,
  saveCredentialRecord,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from '../../src/services/vci/exchangeService';
import { readCredentialInformationRows } from '../../src/services/vci/qrIssuanceFlow';

type ScanPhase =
  | { tag: 'scanning' }
  | { tag: 'resolving' }
  | { tag: 'txCode'; offer: ResolvedCredentialOffer }
  | { tag: 'acquiring' }
  | { tag: 'preview'; record: VerifiableCredentialRecord }
  | { tag: 'saving' }
  | { tag: 'error'; message: string }

function readPreviewTitle(type: string): string {
  if (type === 'BangkokUniversityTranscript') return 'TRANSCRIPT';
  if (type === 'DLTDrivingLicence') return 'DRIVING LICENSE';
  if (type === 'ThaiNationalID') return 'ID CARD';
  return 'DIGITAL DOCUMENT';
}

function readPreviewImage(type: string): ImageSourcePropType {
  if (type === 'BangkokUniversityTranscript') return require('../../assets/images/transcript.png');
  if (type === 'DLTDrivingLicence') return require('../../assets/images/car.png');
  return require('../../assets/images/user_profile.png');
}

export default function ScanScreen() {
  useScreenCaptureGuard();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<ScanPhase>({ tag: 'scanning' });
  const [txCode, setTxCode] = useState('');
  const processingRef = useRef(false);
  const router = useRouter();

  const resetScanner = useCallback(() => {
    setPhase({ tag: 'scanning' });
    setTxCode('');
    processingRef.current = false;
  }, []);

  useFocusEffect(
    useCallback(() => {
      resetScanner();
    }, [resetScanner]),
  );

  async function acquireForPreview(offer: ResolvedCredentialOffer, code?: string) {
    setPhase({ tag: 'acquiring' });
    try {
      const record = await acquireCredentialRecord(offer, { tx_code: code });
      setPhase({ tag: 'preview', record });
    } catch (err) {
      setPhase({ tag: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleBarcode(uri: string) {
    if (processingRef.current) return;
    if (!uri.startsWith('openid-credential-offer://')) return;
    processingRef.current = true;

    setPhase({ tag: 'resolving' });
    try {
      const offer = await resolveOffer(uri);
      setTxCode('');
      if (offer.txCode) {
        setPhase({ tag: 'txCode', offer });
        return;
      }

      await acquireForPreview(offer);
    } catch (err) {
      setPhase({ tag: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function handleTxCodeSubmit(offer: ResolvedCredentialOffer) {
    void acquireForPreview(offer, txCode.trim() || undefined);
  }

  function handleSave(record: VerifiableCredentialRecord) {
    setPhase({ tag: 'saving' });
    try {
      saveCredentialRecord(record);
      router.replace({ pathname: '/(tabs)/credential/[id]', params: { id: record.id } });
    } catch (err) {
      setPhase({ tag: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!permission) {
    return <View style={styles.center} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permissionText}>Camera access is required to scan QR codes.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow Camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (phase.tag === 'txCode') {
    const canContinue = txCode.trim().length > 0;

    return (
      <SafeAreaView style={styles.previewRoot} edges={['top', 'bottom']}>
        <View style={styles.previewHeader}>
          <Pressable style={styles.headerBackButton} onPress={resetScanner} accessibilityLabel="Back to scanner">
            <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Wallet</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.previewScreen}>
          <View style={styles.txCodeCard}>
            <Text style={styles.txCodeTitle}>Transaction code</Text>
            <TextInput
              value={txCode}
              onChangeText={setTxCode}
              keyboardType={phase.offer.txCode?.input_mode === 'numeric' ? 'number-pad' : 'default'}
              placeholder="Enter transaction code"
              placeholderTextColor="#9aa1ad"
              secureTextEntry
              style={styles.txCodeInput}
            />
            <Pressable
              style={[styles.confirmButton, !canContinue ? styles.confirmButtonDisabled : null]}
              disabled={!canContinue}
              onPress={() => handleTxCodeSubmit(phase.offer)}>
              <Text style={styles.confirmButtonText}>Continue</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={resetScanner}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.tag === 'preview') {
    const { record } = phase;
    const schema = getCardSchema(record.type);
    const rows = readCredentialInformationRows(record, schema.displayFields);

    return (
      <SafeAreaView style={styles.previewRoot} edges={['top', 'bottom']}>
        <View style={styles.previewHeader}>
          <Pressable style={styles.headerBackButton} onPress={resetScanner} accessibilityLabel="Back to scanner">
            <MaterialCommunityIcons name="chevron-left" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Wallet</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.previewScreen}>
          <ScrollView contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false}>
            <View style={styles.previewCard}>
              <View style={styles.previewCardBand}>
                <Text style={styles.previewCardBandText}>{readPreviewTitle(record.type)}</Text>
              </View>

              <View style={styles.previewCardBody}>
                <View style={styles.previewImageWrap}>
                  <Image source={readPreviewImage(record.type)} style={styles.previewImage} resizeMode="contain" />
                </View>

                <View style={styles.previewRows}>
                  <Text style={styles.infoSectionTitle}>Information to receive</Text>
                  {rows.map((row) => (
                    <View key={row.key} style={styles.previewDataRow}>
                      <Text style={styles.previewDataLabel}>{row.label}</Text>
                      <Text style={styles.previewDataValue}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                <Pressable style={styles.confirmButton} onPress={() => handleSave(record)}>
                  <Text style={styles.confirmButtonText}>Confirm</Text>
                </Pressable>
                <Pressable style={styles.cancelButton} onPress={resetScanner}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.tag === 'error') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{phase.message}</Text>
        <Pressable style={styles.button} onPress={resetScanner}>
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const isLoading = phase.tag === 'resolving' || phase.tag === 'acquiring' || phase.tag === 'saving';

  return (
    <View style={styles.camera}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={isLoading ? undefined : ({ data }) => { void handleBarcode(data); }}
      />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <Text style={styles.scanTitle}>Scan QR Code</Text>
        <View style={styles.reticle} />
        {isLoading ? (
          <ActivityIndicator size="large" color="#fff" style={styles.spinner} />
        ) : (
          <Text style={styles.scanHint}>Point at a credential offer QR code</Text>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f4f6fa' },
  previewRoot: { flex: 1, backgroundColor: '#002887' },
  previewHeader: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#002887',
    paddingHorizontal: 16,
  },
  headerBackButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff',
    borderRadius: 18,
  },
  headerTitle: { flex: 1, paddingRight: 36, color: '#fff', textAlign: 'center', fontSize: 20, fontWeight: '700' },
  headerSpacer: { width: 0 },
  previewScreen: { flex: 1, backgroundColor: '#eef1f4', paddingHorizontal: 16, paddingTop: 24 },
  previewContent: { flexGrow: 1, paddingBottom: 32 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 48,
  },
  scanTitle: { fontSize: 20, fontWeight: '600', color: '#fff' },
  reticle: { width: 240, height: 240, borderWidth: 2, borderColor: '#fff', borderRadius: 16 },
  scanHint: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  spinner: { marginTop: 16 },
  permissionText: { fontSize: 15, color: '#374151', textAlign: 'center', marginBottom: 20 },
  previewCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#0f2849',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  previewCardBand: { backgroundColor: '#123b8c', paddingHorizontal: 20, paddingVertical: 12 },
  previewCardBandText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  previewCardBody: { paddingHorizontal: 28, paddingTop: 28, paddingBottom: 24 },
  previewImageWrap: { alignItems: 'center' },
  previewImage: { width: 92, height: 104 },
  previewRows: { marginTop: 20 },
  previewDataRow: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 12 },
  previewDataLabel: { color: '#9aa1ad', fontSize: 12, lineHeight: 16 },
  previewDataValue: { color: '#071f5f', fontSize: 13, fontWeight: '700', lineHeight: 20 },
  infoSectionTitle: { color: '#071f5f', fontSize: 16, fontWeight: '800', lineHeight: 22 },
  txCodeCard: { borderRadius: 8, backgroundColor: '#fff', padding: 24 },
  txCodeTitle: { color: '#071f5f', fontSize: 16, fontWeight: '800' },
  txCodeInput: {
    minHeight: 44,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#071f5f',
    fontSize: 15,
    fontWeight: '600',
  },
  confirmButton: {
    width: 112,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderRadius: 18,
    backgroundColor: '#18a05d',
  },
  confirmButtonDisabled: { opacity: 0.45 },
  confirmButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  cancelButton: { width: 112, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  cancelButtonText: { color: '#6d7a8d', fontSize: 13, fontWeight: '700' },
  button: { backgroundColor: '#002887', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  errorText: { fontSize: 14, color: '#dc2626', textAlign: 'center', marginBottom: 20 },
});
