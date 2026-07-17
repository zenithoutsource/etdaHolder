import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppButton } from "../../../src/components/AppButton";
import { useAppDialog } from "../../../src/components/AppDialog";
import { CredentialDocumentDetailCard } from "../../../src/components/CredentialDocumentDetailCard";
import { CredentialActionMenu } from "../../../src/components/CredentialActionMenu";
import { PinEntrySurface } from "../../../src/components/PinEntrySurface";
import { PresentationApprovalDeviceCard } from "../../../src/components/PresentationApprovalDeviceCard";
import { PresentationPopCard } from "../../../src/components/PresentationPopCard";
import { WalletHeader } from "../../../src/components/WalletHeader";
import { useScreenCaptureGuard } from "../../../src/hooks/useScreenCaptureGuard";
import { useWalletKeyExpired } from "../../../src/hooks/useWalletKeyExpired";
import { getWalletKeyRegisteredAt } from "../../../src/services/crypto/crypto";
import {
  readCredentialInactiveState,
  resolveCredentialRevokeBehavior,
} from "../../../src/services/credentials/credentialInactiveState";
import { deleteStoredCredentialAfterHolderApproval } from "../../../src/services/credentials/credentialDeletion";
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
  claimReadyRenewal,
  confirmOldCredentialCleanup,
  refreshAndCompleteRenewals,
  submitRenewalRequest,
} from "../../../src/services/credentials/credentialRenewalService";
import {
  HolderRevokeSigningCancelledError,
  submitHolderRevokeRequest,
} from "../../../src/services/credentials/holderRevokeService";
import { canSubmitCredentialRenewal } from "../../../src/services/credentials/credentialGuard";
import { isCredentialExpiringSoon } from "../../../src/services/credentials/credentialDocumentExpiry";
import {
  isRenewalAwaitingHolderCleanup,
} from "../../../src/services/credentials/renewalCleanupNotification";
import { WALLET_HOME_COPY, readWalletHomeBadgeLabel } from "../../../src/services/credentials/walletHomeCopy";
import { shouldOfferDocumentReissueCta } from "../../../src/services/credentials/documentReissueCtaGate";
import { readWalletKeyExpiryLane } from "../../../src/services/crypto/walletKeyExpiryLane";
import { readWalletKeyRotationRecord } from "../../../src/services/crypto/walletKeyRotation";
import {
  shouldHideCredentialActionMenu,
  shouldShowRenewedActiveBadge,
} from "../../../src/services/credentials/credentialRenewalPresentation";
import { logWalletError } from "../../../src/services/debug/walletLogger";
import { isStaleDocumentExpiryNotification } from "../../../src/services/notifications/notificationDocumentExpiryRoute";
import { resolveRenewalReadyReplacementRoute } from "../../../src/services/notifications/notificationRenewalRoute";
import { readCredentialDetailDisplay, readCredentialHolderProfile } from "../../../src/services/credentials/credentialDisplay";
import { shouldResetCredentialDetailSession } from "../../../src/services/credentials/credentialDetailSession";
import {
  acknowledgeIssuerSuspension,
  readIssuerSuspension,
} from "../../../src/services/credentials/issuerSuspension";
import { hasWalletPin, setWalletPin, verifyWalletPin } from "../../../src/services/auth/walletPin";
import { useStoredCredentials } from "../../../src/hooks/useStoredCredentials";
import { isProximityPresentationSupported } from "../../../src/services/proximity/proximityPresentation";
import {
  armProximityTestSession,
  NFC_TEST_ARM_WINDOW_SECONDS,
} from "../../../src/services/proximity/proximityArmSession";
import { hasStoredMdoc } from "../../../src/services/proximity/mdocStorage";
import { readCompactTokenSignature } from "../../../src/services/vp/presentationEvidence";
import { VpQrModal } from "../../../src/components/VpQrModal";
import { isCredentialPresentable } from "../../../src/services/credentials/credentialLifecycle";
import { isSdJwtCredential } from "../../../src/services/vp/walletInitiatedPresentation";

import { THEME } from '../../../src/config/themeColors'

type DetailPhase =
  | { tag: "detail" }
  | { tag: "issuerAck" }
  | { tag: "renewalProcessing" }
  | { tag: "revokeSubmitting" }
  | { tag: "security"; action: CredentialLifecycleAction; mode: "setup" | "confirm" | "verify"; initialPin?: string }
  | { tag: "approve"; action: CredentialLifecycleAction }

export default function CredentialDetailScreen() {
  useScreenCaptureGuard();
  const { isExpired: walletKeyExpired } = useWalletKeyExpired();
  const walletKeyExpiryLane = readWalletKeyExpiryLane({
    keyExpired: walletKeyExpired,
    hasRotationRecord: Boolean(readWalletKeyRotationRecord()),
  });
  const { id, notificationEvent } = useLocalSearchParams<{ id: string; notificationEvent?: string }>();
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const { credentials, error, refresh } = useStoredCredentials();
  const [phase, setPhase] = useState<DetailPhase>({ tag: "detail" });
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [renewalRefreshTick, setRenewalRefreshTick] = useState(0);
  const [vpQrVisible, setVpQrVisible] = useState(false);
  const previousCredentialIdRef = useRef<string | undefined>(id);
  const staleExpiryDialogShownRef = useRef(false);
  const credential = credentials.find((record) => record.id === id);
  const [hasMdoc, setHasMdoc] = useState(false);

  useEffect(() => {
    if (!credential) {
      setHasMdoc(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const stored = await hasStoredMdoc(credential.id);
      if (!cancelled) setHasMdoc(stored);
    })();

    return () => {
      cancelled = true;
    };
  }, [credential]);
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
    credential,
  });
  const showRenewedActiveBadge = credential
    ? shouldShowRenewedActiveBadge(credential.type, renewalStatus)
    : false;
  const renewalBadgeLabel = showRenewedActiveBadge
    ? readWalletHomeBadgeLabel("active")
    : undefined;
  const hideCredentialActionMenu = shouldHideCredentialActionMenu(renewalStatus, {
    inactiveState,
    renewalState: showRenewedActiveBadge ? "renewed-active" : undefined,
  });
  const canRequestRenewal = credential
    ? canSubmitCredentialRenewal(credential.id, credentials, renewalStatuses)
    : false;
  const isRenewalBlocked =
    inactiveState.kind === "renewal-required" ||
    inactiveState.kind === "renewal-processing" ||
    inactiveState.kind === "old-revoked" ||
    inactiveState.kind === "cleanup-pending" ||
    inactiveState.kind === "document-expired";
  const canRequestDocumentReissue =
    inactiveState.kind === "document-expired" &&
    shouldOfferDocumentReissueCta({
      lane: walletKeyExpiryLane,
      documentExpired: true,
    });
  const showExpiringSoonBanner =
    inactiveState.kind === "active" &&
    credential !== undefined &&
    isCredentialExpiringSoon(credential);
  const showRenewalCleanupCta = isRenewalAwaitingHolderCleanup(renewalStatus);
  const showVpQrButton =
    credential !== undefined &&
    isSdJwtCredential(credential) &&
    isCredentialPresentable(credential);

  useEffect(() => {
    if (hideCredentialActionMenu) {
      setIsActionMenuOpen(false);
    }
  }, [hideCredentialActionMenu]);

  useEffect(() => {
    if (!id) return;

    const replacementRoute = resolveRenewalReadyReplacementRoute({
      credentialId: id,
      notificationEvent,
      replacementCredentialId: renewalStatus?.replacementCredentialId,
    });
    if (replacementRoute) {
      router.replace(replacementRoute);
    }
  }, [id, notificationEvent, renewalStatus?.replacementCredentialId, router]);

  useEffect(() => {
    if (!credential || staleExpiryDialogShownRef.current) return;
    if (!isStaleDocumentExpiryNotification({ notificationEvent, credential })) {
      return;
    }

    staleExpiryDialogShownRef.current = true;
    showDialog({
      title: WALLET_HOME_COPY.staleExpiryNotificationTitle,
      message: WALLET_HOME_COPY.staleExpiryNotificationMessage,
      actions: [{ label: WALLET_HOME_COPY.acknowledge, variant: "secondary" }],
    });
  }, [credential, notificationEvent, showDialog]);

  const resetDetailSession = useCallback(() => {
    setPhase({ tag: "detail" });
    setIsActionMenuOpen(false);
    setPin("");
    setPinError(null);
  }, []);

  const handleTestNfc = useCallback(async () => {
    try {
      await armProximityTestSession();
      showDialog({
        title: "HCE armed",
        message: `Tap the reader now — armed for ~${NFC_TEST_ARM_WINDOW_SECONDS}s.`,
        actions: [{ label: WALLET_HOME_COPY.acknowledge, variant: "secondary" }],
      });
    } catch (nfcError) {
      logWalletError("credential-detail", "nfc-test-arm-failed", nfcError);
      showDialog({
        title: "Test NFC failed",
        message: nfcError instanceof Error ? nfcError.message : "Unknown error",
        icon: "danger",
        actions: [{ label: WALLET_HOME_COPY.acknowledge, variant: "secondary" }],
      });
    }
  }, [showDialog]);

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

  const receiveReadyRenewal = useCallback(async () => {
    if (
      !credential ||
      renewalStatus?.state !== "renewal-processing" ||
      !renewalStatus.readyOfferUri?.trim()
    ) {
      return;
    }

    setPhase({ tag: "renewalProcessing" });
    try {
      await claimReadyRenewal(credential.id);
    } catch (renewalError) {
      logWalletError("credential-detail", "renewal-receive-failed", renewalError, {
        credentialId: credential.id,
      });
      showDialog({
        title: "Unable to receive new document",
        message: "Please try again.",
        icon: "danger",
        actions: [{ label: WALLET_HOME_COPY.cancel, variant: "secondary" }],
      });
    } finally {
      syncLocalRenewalState();
      setPhase({ tag: "detail" });
    }
  }, [credential, renewalStatus, showDialog, syncLocalRenewalState]);

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
            void confirmOldCredentialCleanup(credential.id).then(() => {
              refresh();
              setRenewalRefreshTick((tick) => tick + 1);
              router.replace("/(tabs)");
            });
          },
        },
      ],
    });
  }, [credential, refresh, renewalStatus, router, showDialog]);

  const hasRenewalProcessing = renewalStatus?.state === "renewal-processing";
  const canReceiveReadyRenewal =
    hasRenewalProcessing && Boolean(renewalStatus?.readyOfferUri?.trim());

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
    staleExpiryDialogShownRef.current = false;
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

    if (action === "Revoke") {
      setPhase({ tag: "approve", action });
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

  async function approveAction(action: CredentialLifecycleAction) {
    if (!credential) return;
    if (action === "Revoke") {
      setPhase({ tag: "revokeSubmitting" });
      try {
        await submitHolderRevokeRequest(credential.id);
        recordCredentialLifecycleAction(credential.id, action);
        router.push("/(tabs)/history");
      } catch (error) {
        if (error instanceof HolderRevokeSigningCancelledError) {
          setPhase({ tag: "detail" });
          return;
        }
        logWalletError("credential-detail", "holder-revoke-failed", error, {
          credentialId: credential.id,
        });
        setPhase({ tag: "detail" });
        showDialog({
          title: "Unable to revoke document",
          message: "The issuer could not confirm this revoke request. Please try again.",
        });
      }
      return;
    }
    if (action === "Delete") {
      deleteStoredCredentialAfterHolderApproval(credential.id);
      router.push("/(tabs)/history");
      return;
    }
    recordCredentialLifecycleAction(credential.id, action);
    router.push("/(tabs)/history");
  }

  if (phase.tag === "revokeSubmitting") {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
        <WalletHeader title="ระงับเอกสาร" onBack={() => setPhase({ tag: "detail" })} />
        <View className="flex-1 items-center justify-center bg-surface px-6">
          <ActivityIndicator size="large" color={THEME.navy} />
          <Text className="mt-4 text-center text-sm text-slate">
            กำลังส่งคำขอระงับเอกสารไปยังผู้ออกเอกสาร
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.tag === "renewalProcessing") {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
        <WalletHeader title="ขอเอกสารใหม่" onBack={() => setPhase({ tag: "detail" })} />
        <View className="flex-1 items-center justify-center bg-surface px-6">
          <ActivityIndicator size="large" color={THEME.navy} />
          <Text className="mt-4 text-center text-sm text-slate">
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
        <View className="flex-1 items-center bg-surface px-5 pt-10">
          <View className="w-full rounded-[12px] bg-white px-5 py-8">
            <View className="mb-4 items-center">
              <MaterialCommunityIcons name="alert-circle-outline" size={56} color={THEME.danger} />
            </View>
            <Text className="text-center text-lg font-bold text-ink">
              เอกสารถูกระงับ
            </Text>
            <Text className="mt-2 text-center text-sm text-slate">
              เอกสาร {display.documentTitle} ถูกระงับโดยผู้ออกเอกสาร
            </Text>
            {suspensionStatus?.reasonCode ? (
              <Text className="mt-1 text-center text-xs text-blue-gray">
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
        <View className="flex-1 items-center bg-surface px-5 pt-8">
          <PinEntrySurface
            title={titleByMode}
            subtitle={messageByMode}
            pin={pin}
            error={pinError}
            onDigit={handleKeyPress}
            onBackspace={() => setPin((value) => value.slice(0, -1))}
            onFingerprint={handleFingerprintBypass}
          />
          <Text className="mt-8 text-xs text-blue-gray">ลืมรหัสผ่าน?</Text>
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
        <View className="flex-1 bg-surface">
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
                className="flex-1 border-0 bg-danger-dark py-3"
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

      <View className="flex-1 bg-surface">
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
                  isRenewalBlocked
                    ? undefined
                    : showVpQrButton
                      ? () => setVpQrVisible(true)
                      : () => router.push("/(tabs)/qr")
                }
                onPresentViaNfc={
                  !isRenewalBlocked && credential && hasMdoc && isProximityPresentationSupported()
                    ? () => {
                        router.push({
                          pathname: "/(tabs)/present",
                          params: { credentialId: credential.id },
                        });
                      }
                    : undefined
                }
              />
              {showExpiringSoonBanner ? (
                <View className="mt-4 rounded-xl bg-amber-tint px-4 py-3">
                  <Text className="text-center text-sm text-amber800">
                    {WALLET_HOME_COPY.documentExpiringSoonMessage}
                  </Text>
                </View>
              ) : null}
              {inactiveState.kind !== "active" ? (
                <View className="mt-4 rounded-xl bg-gray100 px-4 py-3">
                  <Text className="text-center text-sm text-gray600">
                    {inactiveState.panelMessage}
                  </Text>
                </View>
              ) : null}
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
              {canRequestDocumentReissue ? (
                <View className="mt-4">
                  <AppButton
                    variant="solid-block"
                    label={WALLET_HOME_COPY.requestNewCredential}
                    onPress={() => router.push("/(tabs)/scan")}
                    className="w-full rounded-xl py-3"
                    textClassName="text-center text-sm font-bold"
                  />
                </View>
              ) : null}
              {canReceiveReadyRenewal ? (
                <View className="mt-4">
                  <AppButton
                    variant="solid-block"
                    label="Receive new document"
                    onPress={() => {
                      void receiveReadyRenewal();
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
                    className="w-full rounded-xl bg-danger-dark py-3"
                    textClassName="text-center text-sm font-bold"
                  />
                </View>
              ) : null}
              {__DEV__ && isProximityPresentationSupported() ? (
                <View className="mt-4">
                  <AppButton
                    variant="solid-block"
                    label="Test NFC (arm HCE)"
                    iconName="nfc-variant"
                    onPress={() => {
                      void handleTestNfc();
                    }}
                    className="w-full rounded-xl bg-wallet-navy py-3"
                    textClassName="text-center text-sm font-bold"
                  />
                </View>
              ) : null}
              {!hideCredentialActionMenu ? (
                <View className="absolute right-3 top-3 z-30">
                  <AppButton
                    variant="icon-circle"
                    iconName="dots-vertical"
                    iconSize={22}
                    iconColor={THEME.navy}
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
      {credential && showVpQrButton ? (
        <VpQrModal
          visible={vpQrVisible}
          credential={credential}
          onClose={() => setVpQrVisible(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}
