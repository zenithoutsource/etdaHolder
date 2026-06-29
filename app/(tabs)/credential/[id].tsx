import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppButton } from "../../../src/components/AppButton";
import { useAppDialog } from "../../../src/components/AppDialog";
import { ProximityPresentButton } from "../../../src/components/proximity/ProximityPresentButton";
import { CredentialDocumentDetailCard } from "../../../src/components/CredentialDocumentDetailCard";
import { CredentialActionMenu } from "../../../src/components/CredentialActionMenu";
import { PinKeypad } from "../../../src/components/PinKeypad";
import { PresentationApprovalDeviceCard } from "../../../src/components/PresentationApprovalDeviceCard";
import { PresentationPopCard } from "../../../src/components/PresentationPopCard";
import { WalletHeader } from "../../../src/components/WalletHeader";
import { getWalletKeyRegisteredAt } from "../../../src/services/crypto/crypto";
import {
  readCredentialInactiveState,
  resolveCredentialRevokeBehavior,
} from "../../../src/services/credentials/credentialInactiveState";
import {
  readCredentialLifecycleStatuses,
  recordCredentialLifecycleAction,
  type CredentialLifecycleAction,
} from "../../../src/services/credentials/credentialLifecycle";
import {
  readCredentialRenewal,
  readCredentialRenewalStatuses,
} from "../../../src/services/credentials/credentialKeyRenewal";
import {
  confirmOldCredentialCleanup,
  refreshAndCompleteRenewals,
  submitRenewalRequest,
} from "../../../src/services/credentials/credentialRenewalService";
import { canSubmitCredentialRenewal } from "../../../src/services/credentials/credentialGuard";
import {
  isRenewalAwaitingHolderCleanup,
} from "../../../src/services/credentials/renewalCleanupNotification";
import { WALLET_HOME_COPY, readWalletHomeBadgeLabel } from "../../../src/services/credentials/walletHomeCopy";
import {
  shouldHideCredentialActionMenu,
  shouldShowRenewedActiveBadge,
} from "../../../src/services/credentials/credentialRenewalPresentation";
import { logWalletError } from "../../../src/services/debug/walletLogger";
import { readCredentialDetailDisplay, readCredentialHolderProfile } from "../../../src/services/credentials/credentialDisplay";
import { shouldResetCredentialDetailSession } from "../../../src/services/credentials/credentialDetailSession";
import {
  acknowledgeIssuerSuspension,
  readIssuerSuspension,
} from "../../../src/services/credentials/issuerSuspension";
import { hasWalletPin, setWalletPin, verifyWalletPin } from "../../../src/services/auth/walletPin";
import { useStoredCredentials } from "../../../src/hooks/useStoredCredentials";
import { readCompactTokenSignature } from "../../../src/services/vp/presentationEvidence";

type DetailPhase =
  | { tag: "detail" }
  | { tag: "issuerAck" }
  | { tag: "renewalProcessing" }
  | { tag: "security"; action: CredentialLifecycleAction; mode: "setup" | "confirm" | "verify"; initialPin?: string }
  | { tag: "approve"; action: CredentialLifecycleAction }

export default function CredentialDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const { credentials, error, refresh } = useStoredCredentials();
  const [phase, setPhase] = useState<DetailPhase>({ tag: "detail" });
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [renewalRefreshTick, setRenewalRefreshTick] = useState(0);
  const previousCredentialIdRef = useRef<string | undefined>(id);
  const credential = credentials.find((record) => record.id === id);
  const display = credential
    ? readCredentialDetailDisplay(credential)
    : undefined;
  const isTranscript = credential?.type === "BangkokUniversityTranscript";
  const thaiIdCredential = credentials.find((record) => record.type === "ThaiNationalID");
  const thaiIdHolderProfile = useMemo(
    () => (thaiIdCredential ? readCredentialHolderProfile(thaiIdCredential) : undefined),
    [thaiIdCredential],
  );
  const currentHolderProfile = useMemo(
    () => (credential ? readCredentialHolderProfile(credential) : undefined),
    [credential],
  );
  const holderProfile = useMemo(
    () => ({
      ...currentHolderProfile,
      ...thaiIdHolderProfile,
    }),
    [currentHolderProfile, thaiIdHolderProfile],
  );

  const suspensionStatus = credential ? readIssuerSuspension(credential.id) : undefined;
  const renewalStatuses = useMemo(() => {
    void renewalRefreshTick;
    return readCredentialRenewalStatuses(credentials);
  }, [credentials, renewalRefreshTick]);
  const renewalStatus = credential ? renewalStatuses[credential.id] : undefined;
  const lifecycleStatuses = readCredentialLifecycleStatuses(credentials);
  const lifecycleStatus = credential ? lifecycleStatuses[credential.id] : undefined;
  const inactiveState = readCredentialInactiveState({
    lifecycleStatus,
    suspensionStatus,
    renewalStatus,
  });
  const showRenewedActiveBadge = credential
    ? shouldShowRenewedActiveBadge(credential.type, renewalStatus)
    : false;
  const renewalBadgeLabel = showRenewedActiveBadge
    ? readWalletHomeBadgeLabel("active")
    : undefined;
  const hideCredentialActionMenu = shouldHideCredentialActionMenu(renewalStatus);
  const canRequestRenewal = credential
    ? canSubmitCredentialRenewal(credential.id, credentials, renewalStatuses)
    : false;
  const isRenewalBlocked =
    inactiveState.kind === "renewal-required" ||
    inactiveState.kind === "renewal-processing" ||
    inactiveState.kind === "old-revoked" ||
    inactiveState.kind === "cleanup-pending";
  const showRenewalCleanupCta = isRenewalAwaitingHolderCleanup(renewalStatus);

  useEffect(() => {
    if (hideCredentialActionMenu) {
      setIsActionMenuOpen(false);
    }
  }, [hideCredentialActionMenu]);

  const resetDetailSession = useCallback(() => {
    setPhase({ tag: "detail" });
    setIsActionMenuOpen(false);
    setPin("");
    setPinError(null);
  }, []);

  const beginRenewalRequest = useCallback(async () => {
    if (!credential) return;
    setPhase({ tag: "renewalProcessing" });
    try {
      await submitRenewalRequest(credential.id);
      setPhase({ tag: "detail" });
      setRenewalRefreshTick((tick) => tick + 1);
    } catch (renewalError) {
      logWalletError("credential-detail", "renewal-request-failed", renewalError, {
        credentialId: credential.id,
      });
      showDialog({
        title: "ไม่สามารถขอเอกสารใหม่ได้",
        message: "กรุณาลองใหม่อีกครั้ง",
        icon: "danger",
        actions: [{ label: WALLET_HOME_COPY.cancel, variant: "secondary" }],
      });
      setPhase({ tag: "detail" });
    }
  }, [credential, showDialog]);

  const syncLocalRenewalState = useCallback(() => {
    refresh();
    setRenewalRefreshTick((tick) => tick + 1);
  }, [refresh]);

  const pollRenewalFromServer = useCallback(async () => {
    if (!id) return;

    const renewal = readCredentialRenewal(id);
    if (renewal?.state !== "renewal-processing") {
      syncLocalRenewalState();
      return;
    }

    await refreshAndCompleteRenewals();
    syncLocalRenewalState();
  }, [id, syncLocalRenewalState]);

  const showOldCredentialCleanupDialog = useCallback(() => {
    if (!credential || !isRenewalAwaitingHolderCleanup(renewalStatus)) return;

    showDialog({
      title: WALLET_HOME_COPY.renewalDeleteTitle,
      icon: "danger",
      actions: [
        {
          label: WALLET_HOME_COPY.cancel,
          variant: "secondary",
        },
        {
          label: WALLET_HOME_COPY.confirmDelete,
          variant: "danger",
          onPress: () => {
            confirmOldCredentialCleanup(credential.id);
            refresh();
            setRenewalRefreshTick((tick) => tick + 1);
            router.replace("/(tabs)");
          },
        },
      ],
    });
  }, [credential, refresh, renewalStatus, router, showDialog]);

  const hasRenewalProcessing = renewalStatus?.state === "renewal-processing";

  useEffect(() => {
    if (!hasRenewalProcessing) return;

    const timer = setInterval(() => {
      void pollRenewalFromServer();
    }, 4000);

    return () => clearInterval(timer);
  }, [hasRenewalProcessing, pollRenewalFromServer]);

  useEffect(() => {
    if (!shouldResetCredentialDetailSession(previousCredentialIdRef.current, id)) {
      previousCredentialIdRef.current = id;
      return;
    }

    previousCredentialIdRef.current = id;
    resetDetailSession();
  }, [id, resetDetailSession]);

  useFocusEffect(
    useCallback(() => {
      void pollRenewalFromServer();
      return () => {
        resetDetailSession();
      };
    }, [pollRenewalFromServer, resetDetailSession]),
  );

  function beginAction(action: CredentialLifecycleAction) {
    setIsActionMenuOpen(false);
    setPin("");
    setPinError(null);

    if (action === "Delete" && isRenewalAwaitingHolderCleanup(renewalStatus)) {
      showOldCredentialCleanupDialog();
      return;
    }

    if (action === "Revoke" && resolveCredentialRevokeBehavior(suspensionStatus) === "issuer-acknowledgment") {
      setPhase({ tag: "issuerAck" });
      return;
    }

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

  if (phase.tag === "renewalProcessing") {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
        <WalletHeader title="ขอเอกสารใหม่" onBack={() => setPhase({ tag: "detail" })} />
        <View className="flex-1 items-center justify-center bg-[#eef1f4] px-6">
          <ActivityIndicator size="large" color="#002887" />
          <Text className="mt-4 text-center text-sm text-[#6d7a8d]">
            กำลังส่งคำขอต่ออายุเอกสารไปยังผู้ออกเอกสาร
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.tag === "issuerAck" && display) {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
        <WalletHeader title="การระงับเอกสาร" onBack={() => setPhase({ tag: "detail" })} />
        <View className="flex-1 items-center bg-[#eef1f4] px-5 pt-10">
          <View className="w-full rounded-[12px] bg-white px-5 py-8">
            <View className="mb-4 items-center">
              <MaterialCommunityIcons name="alert-circle-outline" size={56} color="#c00000" />
            </View>
            <Text className="text-center text-lg font-bold text-[#1a2a42]">
              เอกสารถูกระงับ
            </Text>
            <Text className="mt-2 text-center text-sm text-[#6d7a8d]">
              เอกสาร {display.documentTitle} ถูกระงับโดยผู้ออกเอกสาร
            </Text>
            {suspensionStatus?.reasonCode ? (
              <Text className="mt-1 text-center text-xs text-[#8a9bb0]">
                เหตุผล: {suspensionStatus.reasonCode}
              </Text>
            ) : null}
            <View className="mt-6">
              <AppButton
                variant="solid-block"
                label="รับทราบการระงับ"
                onPress={() => {
                  if (credential) {
                    acknowledgeIssuerSuspension(credential.id);
                  }
                  setPhase({ tag: "detail" });
                  router.push("/(tabs)");
                }}
                className="w-full rounded-xl py-3"
                textClassName="text-center text-sm font-bold"
              />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.tag === "security") {
    const titleByMode = {
      setup: "Set PIN",
      confirm: "Confirm PIN",
      verify: "Enter Password",
    }[phase.mode];
    const messageByMode = {
      setup: "โปรดตั้งรหัส PIN 6 หลักของคุณเพื่อความปลอดภัย",
      confirm: "โปรดใส่รหัส PIN 6 หลักอีกครั้งเพื่อยืนยัน",
      verify: "โปรดระบุรหัส PIN 6 หลักเพื่อเข้าถึงข้อมูลของคุณ",
    }[phase.mode];

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
        <WalletHeader title="Security Access" onBack={() => setPhase({ tag: "detail" })} />
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
    const credentialSignature = credential
      ? readCompactTokenSignature(credential.rawVc) ?? "Signature unavailable"
      : "Signature unavailable";

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
        <WalletHeader onBack={() => setPhase({ tag: "detail" })} />
        <View className="flex-1 bg-[#eef1f4]">
          <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8 pt-4">
            <CredentialDocumentDetailCard
              display={display}
              holderProfile={display.imageKey === "id" || isTranscript ? holderProfile : undefined}
            />

            <View className="mt-4">
              <PresentationApprovalDeviceCard registeredAt={getWalletKeyRegisteredAt()} />
            </View>

            <View className="mt-4">
              <PresentationPopCard signature={credentialSignature} />
            </View>

            <View className="mt-5 flex-row gap-3">
              <AppButton
                variant="solid-block"
                label="Approve"
                onPress={() => approveAction(phase.action)}
                className="flex-1 border-0 py-3"
                textClassName="text-center text-sm font-bold"
              />
              <AppButton
                variant="solid-block"
                label="Not approve"
                onPress={() => setPhase({ tag: "detail" })}
                className="flex-1 border-0 bg-[#b00000] py-3"
                textClassName="text-center text-sm font-bold"
              />
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
      <WalletHeader onBack={() => router.back()} />

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
                holderProfile={display.imageKey === "id" || isTranscript ? holderProfile : undefined}
                inactiveState={inactiveState}
                renewalBadgeLabel={renewalBadgeLabel}
                renewalState={showRenewedActiveBadge ? "renewed-active" : undefined}
                onOpenQr={
                  isRenewalBlocked ? undefined : () => router.push("/(tabs)/qr")
                }
              />
              {canRequestRenewal ? (
                <View className="mt-4">
                  <AppButton
                    variant="solid-block"
                    label={WALLET_HOME_COPY.requestCredential}
                    onPress={() => {
                      void beginRenewalRequest();
                    }}
                    className="w-full rounded-xl py-3"
                    textClassName="text-center text-sm font-bold"
                  />
                </View>
              ) : null}
              {showRenewalCleanupCta ? (
                <View className="mt-4">
                  <AppButton
                    variant="solid-block"
                    label={WALLET_HOME_COPY.renewalCleanupCta}
                    onPress={showOldCredentialCleanupDialog}
                    className="w-full rounded-xl bg-[#b00000] py-3"
                    textClassName="text-center text-sm font-bold"
                  />
                </View>
              ) : null}
              {!isRenewalBlocked ? (
                <ProximityPresentButton
                  onPress={() => {
                    if (!credential) return;
                    router.push({
                      pathname: "/(tabs)/present",
                      params: { credentialId: credential.id },
                    });
                  }}
                />
              ) : null}
              {!hideCredentialActionMenu ? (
                <View className="absolute right-3 top-3 z-30">
                  <AppButton
                    variant="icon-circle"
                    iconName="dots-vertical"
                    iconSize={22}
                    iconColor="#002887"
                    className="h-9 w-9 bg-white"
                    onPress={() => setIsActionMenuOpen((value) => !value)}
                    accessibilityLabel="Open credential actions"
                  />
                  {isActionMenuOpen ? (
                    <CredentialActionMenu
                      onRevoke={() => beginAction("Revoke")}
                      onDelete={() => beginAction("Delete")}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : (
            <View className="rounded-[8px] bg-white px-5 py-6">
              <Text className="text-center text-base font-semibold">
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
