export async function sendPinResetOtp(email: string, otp: string): Promise<void> {
  console.info(`[pin-reset] OTP for ${email}: ${otp}`)
}
