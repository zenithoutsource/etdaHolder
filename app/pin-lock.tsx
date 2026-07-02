import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PinUnlockPrompt } from "../src/components/PinUnlockPrompt";
import { isBiometricDisabledForTesting } from "../src/config/runtimeFlags";
import { setWalletPin, verifyWalletPin } from "../src/services/auth/walletPin";
import {
  confirmWalletUnlockBiometric,
  isWalletUnlockBiometricCancellation,
} from "../src/services/auth/walletUnlockBiometric";
import {
  logWalletError,
  logWalletStep,
} from "../src/services/debug/walletLogger";
import { useAuthStore } from "../src/store/authStore";

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
  const [error, setError] = useState<string | null>(null);
  const biometricAttemptRef = useRef(0);

  const cancelBiometricAttempt = useCallback(() => {
    biometricAttemptRef.current += 1;
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
    }
  }, [completeUnlock]);

  useFocusEffect(
    useCallback(() => {
      setError(null);
      cancelBiometricAttempt();

      return () => {
        cancelBiometricAttempt();
      };
    }, [cancelBiometricAttempt]),
  );

  function handlePinInteraction() {
    cancelBiometricAttempt();
    setError(null);
  }

  function handlePinSubmit(next: string) {
    if (Platform.OS !== "web" && verifyWalletPin(next)) {
      logWalletStep("wallet-unlock", "pin-lock-pin-verified");
      completeUnlock();
      // setWalletPin() re-derives the PIN-wrapped storage-key fallback with a
      // 210k-iteration PBKDF2 (storage.ts). That's synchronous, JS-thread-blocking
      // work, so it runs after the unlock transition instead of gating it.
      setTimeout(() => {
        try {
          setWalletPin(next);
        } catch (provisionError) {
          logWalletError(
            "wallet-unlock",
            "pin-fallback-provision-failed",
            provisionError,
          );
        }
      }, 0);
    } else {
      setError("รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง");
    }
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
      <PinUnlockPrompt
        error={error}
        forgotPinLabel="ลืมรหัสผ่าน?"
        onSubmit={handlePinSubmit}
        onBiometricPress={handleFingerprintPress}
        onForgotPin={handleForgotPin}
        onInteraction={handlePinInteraction}
      />
    </SafeAreaView>
  );
}
