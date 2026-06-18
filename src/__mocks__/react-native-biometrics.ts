export default class ReactNativeBiometrics {
  async simplePrompt(_opts?: { promptMessage?: string; cancelButtonText?: string }) {
    return { success: true }
  }

  async isSensorAvailable() {
    return { available: true, biometryType: 'FaceID' }
  }
}
