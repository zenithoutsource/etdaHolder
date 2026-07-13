import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppButton } from "../AppButton";
import { AUTH_PIN_LENGTH, PinEntryStep } from "./PinEntryStep";
import {
  displayNameValidationMessage,
  isValidEmailFormat,
  normalizeDisplayName,
  pinValidationMessage,
} from "../../services/auth/authValidation";
import { readPostLoginRoute } from "../../services/auth/walletPinNavigation";
import { useAuthStore } from "../../store/authStore";
import {
  readPendingCredentialOfferRoute,
  useDeeplinkStore,
} from "../../store/deeplinkStore";

import { THEME } from '../../config/themeColors'

type AuthStep = "email" | "name" | "pin-enter" | "pin-confirm" | "login-pin";

export function AuthWizard() {
  const router = useRouter();
  const checkEmailStatus = useAuthStore((s) => s.checkEmailStatus);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const isLoading = useAuthStore((s) => s.isLoading);
  const pendingDeeplinkUri = useDeeplinkStore((s) => s.pendingUri);
  const dismissedDeeplinkUri = useDeeplinkStore((s) => s.dismissedUri);

  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function resetPinEntry() {
    setPin("");
    setFirstPin("");
    setError(null);
  }

  function goToEmailStep() {
    setStep("email");
    resetPinEntry();
    setError(null);
  }

  async function routeAfterAuth() {
    const pendingRoute = readPendingCredentialOfferRoute({
      pendingUri: pendingDeeplinkUri,
      dismissedUri: dismissedDeeplinkUri,
      isAuthenticated: true,
      platform: Platform.OS,
      hasWalletPin: true,
    });
    if (pendingRoute) {
      router.replace(pendingRoute);
      return;
    }
    router.replace(
      readPostLoginRoute({ platform: Platform.OS, hasWalletPin: true }),
    );
  }

  async function handleEmailContinue() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmailFormat(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    setError(null);
    try {
      const status = await checkEmailStatus(normalizedEmail);
      setEmail(normalizedEmail);
      setStep(status.exists ? "login-pin" : "name");
      resetPinEntry();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify email");
    }
  }

  async function handleNameContinue() {
    const normalizedName = normalizeDisplayName(name);
    const nameError = displayNameValidationMessage(normalizedName);
    if (nameError) {
      setError(nameError);
      return;
    }

    setName(normalizedName);
    setError(null);
    setStep("pin-enter");
    resetPinEntry();
  }

  function handlePinDigit(digit: string) {
    if (pin.length >= AUTH_PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    setError(null);

    if (next.length !== AUTH_PIN_LENGTH) return;

    if (step === "pin-enter") {
      const pinError = pinValidationMessage(next);
      if (pinError) {
        setPin("");
        setError(pinError);
        return;
      }
      setFirstPin(next);
      setPin("");
      setStep("pin-confirm");
      return;
    }

    if (step === "pin-confirm") {
      if (next !== firstPin) {
        setPin("");
        setFirstPin("");
        setStep("pin-enter");
        setError("PIN does not match. Try again.");
        return;
      }
      void completeRegistration(next);
      return;
    }

    if (step === "login-pin") {
      void completeLogin(next);
    }
  }

  function handlePinBackspace() {
    setPin((current) => current.slice(0, -1));
    setError(null);
  }

  async function completeRegistration(confirmedPin: string) {
    try {
      await register(name, email, confirmedPin);
      await routeAfterAuth();
    } catch (err) {
      resetPinEntry();
      setStep("pin-enter");
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  async function completeLogin(enteredPin: string) {
    try {
      await login(email, enteredPin);
      await routeAfterAuth();
    } catch (err) {
      resetPinEntry();
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-soft">
      <KeyboardAvoidingView
        className="flex-1 justify-center p-6"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="mb-8">
          <Text className="text-center text-[28px] font-bold text-wallet-navy">
            Digital Wallet
          </Text>
          <Text className="mt-2 text-center text-[15px] text-slate">
            {step === "login-pin"
              ? "Welcome back"
              : "Create or access your wallet"}
          </Text>
        </View>

        {step === "email" ? (
          <View
            className="gap-4 rounded-[18px] bg-white p-6"
            style={{
              elevation: 3,
              shadowColor: THEME.navyShadow,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.1,
              shadowRadius: 10,
            }}
          >
            <TextInput
              className="rounded-[10px] border border-surface-edge p-[14px] text-[15px] text-ink"
              placeholder="Email"
              placeholderTextColor={THEME.gray400}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => void handleEmailContinue()}
            />
            {error ? (
              <Text className="text-center text-[13px] text-red600">
                {error}
              </Text>
            ) : null}
            <AppButton
              variant="solid-block"
              label="Continue"
              onPress={() => void handleEmailContinue()}
              disabled={isLoading}
              loading={isLoading}
              className={`rounded-xl py-[14px] ${isLoading ? "opacity-70" : ""}`}
              textClassName="text-[15px] font-semibold"
            />
          </View>
        ) : null}

        {step === "name" ? (
          <View
            className="gap-4 rounded-[18px] bg-white p-6"
            style={{
              elevation: 3,
              shadowColor: THEME.navyShadow,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.1,
              shadowRadius: 10,
            }}
          >
            <Text className="text-sm text-slate">{email}</Text>
            <TextInput
              className="rounded-[10px] border border-surface-edge p-[14px] text-[15px] text-ink"
              placeholder="Display name (English only)"
              placeholderTextColor={THEME.gray400}
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
              onSubmitEditing={() => void handleNameContinue()}
            />
            <Text className="-mt-2 text-xs text-gray400">
              Use English letters only (e.g. John Smith)
            </Text>
            {error ? (
              <Text className="text-center text-[13px] text-red600">
                {error}
              </Text>
            ) : null}
            <AppButton
              variant="solid-block"
              label="Continue"
              onPress={() => void handleNameContinue()}
              disabled={isLoading}
              loading={isLoading}
              className={`rounded-xl py-[14px] ${isLoading ? "opacity-70" : ""}`}
              textClassName="text-[15px] font-semibold"
            />
            <Pressable className="items-center" onPress={goToEmailStep}>
              <Text className="text-sm text-slate">
                Use a different email
              </Text>
            </Pressable>
          </View>
        ) : null}

        {step === "pin-enter" ||
        step === "pin-confirm" ||
        step === "login-pin" ? (
          <View className="items-center">
            {step !== "login-pin" ? (
              <Text className="mb-4 text-sm text-slate">{email}</Text>
            ) : (
              <Text className="mb-4 text-sm text-slate">{email}</Text>
            )}
            <PinEntryStep
              title={
                step === "login-pin"
                  ? "Enter PIN"
                  : step === "pin-enter"
                    ? "Set PIN"
                    : "Confirm PIN"
              }
              subtitle={
                step === "login-pin"
                  ? "Enter your 6-digit wallet PIN"
                  : step === "pin-enter"
                    ? "Create a 6-digit PIN for your wallet"
                    : "Enter the same PIN again to confirm"
              }
              pin={pin}
              error={error}
              onDigit={handlePinDigit}
              onBackspace={handlePinBackspace}
              showFingerprint={false}
            />
            {isLoading ? (
              <Text className="mt-4 text-sm text-slate">
                Please wait...
              </Text>
            ) : null}
            {step === "login-pin" ? (
              <Pressable
                className="mt-6"
                onPress={() =>
                  router.push(`/forgot-pin?email=${encodeURIComponent(email)}`)
                }
              >
                <Text className="text-sm font-medium text-wallet-navy">
                  ลืมรหัสผ่าน?
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              className={step === "login-pin" ? "mt-3" : "mt-6"}
              onPress={goToEmailStep}
            >
              <Text className="text-sm text-slate">
                Use a different email
              </Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
