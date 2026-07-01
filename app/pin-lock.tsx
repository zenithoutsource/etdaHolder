import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PinKeypad } from "../src/components/PinKeypad";
import { isBiometricDisabledForTesting } from "../src/config/runtimeFlags";
import { verifyWalletPin } from "../src/services/auth/walletPin";
import {
  confirmWalletUnlockBiometric,
  isWalletUnlockBiometricCancellation,
} from "../src/services/auth/walletUnlockBiometric";
import {
  logWalletError,
  logWalletStep,
} from "../src/services/debug/walletLogger";
import { provisionStoragePinFallback } from "../src/services/storage/storage";
import { useAuthStore } from "../src/store/authStore";

const PIN_LENGTH = 6;
const BIOMETRIC_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("WalletUnlockBiometricTimeout"));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export default function PinLockScreen() {
  const router = useRouter();
  const setPinVerified = useAuthStore((s) => s.setPinVerified);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBiometricUnlocking, setIsBiometricUnlocking] = useState(false);
  const biometricAttemptRef = useRef(0);

  const cancelBiometricAttempt = useCallback(() => {
    biometricAttemptRef.current += 1;
    setIsBiometricUnlocking(false);
  }, []);

  const completeUnlock = useCallback(() => {
    cancelBiometricAttempt();
    logWalletStep("wallet-unlock", "pin-lock-unlock-complete");
    setPinVerified(true);
  }, [cancelBiometricAttempt, setPinVerified]);

  const handleBiometricUnlock = useCallback(async () => {
    if (Platform.OS === "web") return;

    const attemptId = biometricAttemptRef.current + 1;
    biometricAttemptRef.current = attemptId;
    setIsBiometricUnlocking(true);
    setError(null);

    try {
      logWalletStep("wallet-unlock", "pin-lock-biometric-request");
      await withTimeout(confirmWalletUnlockBiometric(), BIOMETRIC_TIMEOUT_MS);
      if (attemptId !== biometricAttemptRef.current) return;
      completeUnlock();
    } catch (err) {
      if (attemptId !== biometricAttemptRef.current) return;
      if (isWalletUnlockBiometricCancellation(err)) {
        logWalletStep("wallet-unlock", "pin-lock-biometric-cancelled");
        return;
      }

      logWalletError("wallet-unlock", "pin-lock-biometric-failed", err);
      setError("Biometric verification failed. Enter your PIN instead.");
    } finally {
      if (attemptId === biometricAttemptRef.current) {
        setIsBiometricUnlocking(false);
      }
    }
  }, [completeUnlock]);

  useFocusEffect(
    useCallback(() => {
      setPin("");
      setError(null);
      cancelBiometricAttempt();

      return () => {
        cancelBiometricAttempt();
      };
    }, [cancelBiometricAttempt]),
  );

  function handleDigit(digit: string) {
    if (pin.length >= PIN_LENGTH) return;

    cancelBiometricAttempt();
    const next = pin + digit;
    setPin(next);
    setError(null);

    if (next.length === PIN_LENGTH) {
      if (Platform.OS !== "web" && verifyWalletPin(next)) {
        try {
          provisionStoragePinFallback(next);
        } catch (provisionError) {
          logWalletError(
            "wallet-unlock",
            "pin-fallback-provision-failed",
            provisionError,
          );
        }
        logWalletStep("wallet-unlock", "pin-lock-pin-verified");
        completeUnlock();
      } else {
        setPin("");
        setError("Incorrect PIN. Try again.");
      }
    }
  }

  function handleBackspace() {
    cancelBiometricAttempt();
    setPin((current) => current.slice(0, -1));
    setError(null);
  }

  function handleForgotPin() {
    cancelBiometricAttempt();
    router.push("/forgot-pin");
  }

  function handleFingerprintPress() {
    if (isBiometricDisabledForTesting()) {
      completeUnlock();
      return;
    }

    cancelBiometricAttempt();
    void handleBiometricUnlock();
  }

  return (
    <SafeAreaView className="flex-1 bg-[#eef1f4]" edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center px-5">
        <MaterialCommunityIcons name="lock" size={48} color="#f2c230" />
        <Text className="mt-3 text-2xl font-semibold text-[#1a2a42]">
          Enter PIN
        </Text>
        <Text className="mt-2 text-center text-xs text-[#8a9bb0]">
          โปรดระบุรหัส PIN 6 หลัก หรือใช้สแกนใบหน้า / ลายนิ้วมือ
        </Text>
        <View className="mt-7 flex-row gap-3">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <View
              key={i}
              className={`h-3 w-3 rounded-full ${i < pin.length ? "bg-black" : "border border-[#8a9bb0]"}`}
            />
          ))}
        </View>
        {error ? (
          <Text className="mt-4 text-center text-sm font-medium text-[#c00000]">
            {error}
          </Text>
        ) : null}
        {isBiometricUnlocking ? (
          <Text className="mt-4 text-sm text-[#6d7a8d]">
            Verifying biometric…
          </Text>
        ) : null}
        <PinKeypad
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          onFingerprint={handleFingerprintPress}
        />
        <Pressable className="mt-8" onPress={handleForgotPin}>
          <Text className="text-sm font-medium text-wallet-navy">
            ลืมรหัสผ่าน?
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
