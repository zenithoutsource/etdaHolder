import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CredentialDocumentDetailCard } from "../../../src/components/CredentialDocumentDetailCard";
import { PinKeypad } from "../../../src/components/PinKeypad";
import { getHolderDid } from "../../../src/services/crypto/crypto";
import {
  recordCredentialLifecycleAction,
  type CredentialLifecycleAction,
} from "../../../src/services/credentials/credentialLifecycle";
import { readCredentialDetailDisplay } from "../../../src/services/credentials/credentialDisplay";
import { shouldResetCredentialDetailSession } from "../../../src/services/credentials/credentialDetailSession";
import { hasWalletPin, setWalletPin, verifyWalletPin } from "../../../src/services/auth/walletPin";
import { useStoredCredentials } from "../../../src/hooks/useStoredCredentials";

type DetailPhase =
  | { tag: "detail" }
  | { tag: "security"; action: CredentialLifecycleAction; mode: "setup" | "confirm" | "verify"; initialPin?: string }
  | { tag: "approve"; action: CredentialLifecycleAction }

function formatDateTime(value = new Date()): { date: string; time: string } {
  return {
    date: new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value),
    time: new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(value),
  };
}

function readHolderDidForDisplay(): string {
  try {
    return getHolderDid();
  } catch {
    return "Holder DID unavailable";
  }
}

function Header({
  title,
  onBack,
}: {
  title: string
  onBack: () => void
}) {
  return (
    <View className="h-[70px] flex-row items-center bg-wallet-navy px-4">
      <Pressable
        className="h-9 w-9 items-center justify-center rounded-full border border-white"
        onPress={onBack}
        accessibilityLabel="Back"
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color="#ffffff" />
      </Pressable>
      <Text className="min-w-0 flex-1 pr-9 text-center text-xl font-semibold text-white">
        {title}
      </Text>
    </View>
  )
}

export default function CredentialDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { credentials, error } = useStoredCredentials();
  const [phase, setPhase] = useState<DetailPhase>({ tag: "detail" });
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const previousCredentialIdRef = useRef<string | undefined>(id);
  const credential = credentials.find((record) => record.id === id);
  const display = credential
    ? readCredentialDetailDisplay(credential)
    : undefined;
  const isTranscript = credential?.type === "BangkokUniversityTranscript";

  useEffect(() => {
    if (!shouldResetCredentialDetailSession(previousCredentialIdRef.current, id)) {
      previousCredentialIdRef.current = id;
      return;
    }

    previousCredentialIdRef.current = id;
    setPhase({ tag: "detail" });
    setIsActionMenuOpen(false);
    setPin("");
    setPinError(null);
  }, [id]);

  function beginAction(action: CredentialLifecycleAction) {
    setIsActionMenuOpen(false);
    setPin("");
    setPinError(null);
    setPhase({
      tag: "security",
      action,
      mode: hasWalletPin() ? "verify" : "setup",
    });
  }

  function handleKeyPress(value: string) {
    const nextPin = `${pin}${value}`.slice(0, 6);
    setPin(nextPin);
    if (nextPin.length === 6 && phase.tag === "security") {
      if (phase.mode === "setup") {
        setPin("");
        setPinError(null);
        setPhase({ tag: "security", action: phase.action, mode: "confirm", initialPin: nextPin });
        return;
      }

      if (phase.mode === "confirm") {
        if (nextPin !== phase.initialPin) {
          setPin("");
          setPinError("PIN does not match. Try again.");
          setPhase({ tag: "security", action: phase.action, mode: "setup" });
          return;
        }
        setWalletPin(nextPin);
        setPhase({ tag: "approve", action: phase.action });
        return;
      }

      if (verifyWalletPin(nextPin)) {
        setPhase({ tag: "approve", action: phase.action });
        return;
      }

      setPin("");
      setPinError("Incorrect PIN. Try again.");
    }
  }

  function handleFingerprintBypass() {
    if (phase.tag !== "security") return;
    if (__DEV__) {
      setPhase({ tag: "approve", action: phase.action });
      return;
    }
    setPinError("Fingerprint approval is not available in this build.");
  }

  function approveAction(action: CredentialLifecycleAction) {
    if (!credential) return;
    recordCredentialLifecycleAction(credential.id, action);
    router.push("/(tabs)/history");
  }

  if (phase.tag === "security") {
    const titleByMode = {
      setup: "Set PIN",
      confirm: "Confirm PIN",
      verify: "Enter Password",
    }[phase.mode];
    const messageByMode = {
      setup: "Create a 6-digit Wallet PIN before approving protected actions.",
      confirm: "Enter the same 6-digit PIN again to confirm.",
      verify: "Enter your 6-digit PIN to approve this wallet action.",
    }[phase.mode];

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
        <Header title="Security Access" onBack={() => setPhase({ tag: "detail" })} />
        <View className="flex-1 items-center bg-[#eef1f4] px-5 pt-8">
          <MaterialCommunityIcons name="lock" size={48} color="#f2c230" />
          <Text className="mt-3 text-2xl font-semibold text-[#1a2a42]">{titleByMode}</Text>
          <Text className="mt-2 text-center text-xs text-[#8a9bb0]">
            {messageByMode}
          </Text>
          <View className="mt-7 flex-row gap-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <View
                key={index}
                className={`h-3 w-3 rounded-full ${index < pin.length ? "bg-black" : "border border-[#8a9bb0]"}`}
              />
            ))}
          </View>
          {pinError ? (
            <Text className="mt-4 text-center text-sm font-medium text-[#c00000]">{pinError}</Text>
          ) : null}
          <PinKeypad
            onDigit={handleKeyPress}
            onBackspace={() => setPin((value) => value.slice(0, -1))}
            onFingerprint={handleFingerprintBypass}
          />
          <Text className="mt-8 text-xs text-[#8a9bb0]">Forgot PIN?</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.tag === "approve" && display) {
    const { date, time } = formatDateTime();
    const holderDid = readHolderDidForDisplay();
    const platformLabel = Platform.OS === "ios" ? "iOS device" : Platform.OS === "android" ? "Android device" : "Web preview";

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
        <Header title="Wallet" onBack={() => setPhase({ tag: "detail" })} />
        <View className="flex-1 bg-[#eef1f4]">
          <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8 pt-4">
            <CredentialDocumentDetailCard
              display={display}
              onOpenQr={() => router.push("/(tabs)/qr")}
            />

            <View className="mt-4 rounded-[8px] bg-white p-4">
              <Text className="text-base font-semibold text-[#1a2a42]">Approve by Wallet</Text>
              <View className="mt-3 flex-row items-center gap-3">
                <MaterialCommunityIcons name="cellphone-key" size={24} color="#002887" />
                <View>
                  <Text className="text-sm font-semibold text-[#1a2a42]">{platformLabel}</Text>
                  <Text className="text-xs text-[#8a9bb0]">Credential ID: {credential?.id ?? "unknown"}</Text>
                </View>
              </View>
              <View className="mt-4 flex-row justify-between border-t border-[#eef2f8] pt-3">
                <View>
                  <Text className="text-[11px] text-[#8a9bb0]">Date</Text>
                  <Text className="mt-1 text-xs font-semibold text-[#002887]">{date}</Text>
                </View>
                <View>
                  <Text className="text-[11px] text-[#8a9bb0]">Time</Text>
                  <Text className="mt-1 text-xs font-semibold text-[#002887]">{time}</Text>
                </View>
              </View>
            </View>

            <View className="mt-4">
              <Text className="text-sm font-semibold text-[#002887]">PoP Evidence (Proof of Possession)</Text>
              <View className="mt-2 rounded-[8px] bg-[#10356f] p-3">
                <Text className="text-xs font-semibold text-white">ECDSA - 256</Text>
                <Text className="mt-2 text-[10px] leading-4 text-white/70">
                  Action: {phase.action}
                  {"\n"}Credential ID: {credential?.id ?? "unknown"}
                  {"\n"}Holder DID: {holderDid}
                </Text>
                <View className="mt-3 self-end rounded bg-[#315487] px-2 py-1">
                  <Text className="text-[10px] font-semibold text-white">SHA256</Text>
                </View>
              </View>
            </View>

            <View className="mt-5 flex-row gap-3">
              <Pressable
                className="flex-1 rounded-full bg-wallet-navy py-3"
                onPress={() => approveAction(phase.action)}
              >
                <Text className="text-center text-sm font-bold text-white">Approve</Text>
              </Pressable>
              <Pressable
                className="flex-1 rounded-full bg-[#b00000] py-3"
                onPress={() => setPhase({ tag: "detail" })}
              >
                <Text className="text-center text-sm font-bold text-white">Not approve</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
      <Header title="Wallet" onBack={() => router.back()} />

      <View className="flex-1 bg-[#eef1f4]">
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pb-8 pt-6"
          showsVerticalScrollIndicator={false}
        >
          {display ? (
            <View>
              <CredentialDocumentDetailCard
                display={display}
                onOpenQr={() => router.push("/(tabs)/qr")}
              />
              {isTranscript ? (
                <View className="absolute right-3 top-3">
                  <Pressable
                    className="h-9 w-9 items-center justify-center rounded-full bg-white"
                    onPress={() => setIsActionMenuOpen((value) => !value)}
                    accessibilityLabel="Open transcript actions"
                  >
                    <MaterialCommunityIcons name="dots-vertical" size={22} color="#002887" />
                  </Pressable>
                  {isActionMenuOpen ? (
                    <View className="absolute right-0 top-10 w-[184px] overflow-hidden rounded-[8px] bg-white shadow-md">
                      <Pressable
                        className="flex-row items-center gap-2 border-b border-[#eef2f8] px-3 py-3"
                        onPress={() => beginAction("Revoke")}
                      >
                        <MaterialCommunityIcons name="file-cancel-outline" size={18} color="#c00000" />
                        <Text className="text-sm font-semibold text-[#c00000]">Revoke</Text>
                      </Pressable>
                      <Pressable
                        className="flex-row items-center gap-2 px-3 py-3 opacity-40"
                        disabled
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color="#6d7a8d" />
                        <Text className="text-sm font-semibold text-[#6d7a8d]">Delete this document</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : (
            <View className="rounded-[8px] bg-white px-5 py-6">
              <Text className="text-center text-base font-semibold text-[#1a2a42]">
                ไม่มีบัตรหรือเอกสารดิจิทัลใน Wallet
              </Text>
              {error ? (
                <Text className="mt-3 text-center text-sm text-red-600">
                  {error}
                </Text>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
