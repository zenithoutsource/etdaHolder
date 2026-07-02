import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppDialog } from "../../src/components/AppDialog";
import {
  WalletCredentialSummaryCard,
  WalletEmptyCredentialCard,
} from "../../src/components/WalletCredentialSummaryCard";
import { WalletDocumentMenuItem } from "../../src/components/WalletDocumentMenuItem";
import { WalletHeader } from "../../src/components/WalletHeader";
import { useStoredCredentials } from "../../src/hooks/useStoredCredentials";
import {
  clearNewCredentialBadge,
  readNewCredentialBadgeIds,
} from "../../src/services/credentials/credentialBadges";
import {
  canRequestCredentialType,
  canSubmitCredentialRenewal,
  hasUsablePidCredential,
  pickPreferredHomeCredential,
  readPidGateStatus,
} from "../../src/services/credentials/credentialGuard";
import {
  readCredentialInactiveState,
  type CredentialInactiveState,
} from "../../src/services/credentials/credentialInactiveState";
import {
  readCredentialLifecycleStatuses,
  type CredentialLifecycleStatus,
} from "../../src/services/credentials/credentialLifecycle";
import {
  readCredentialRenewalStatuses,
  type CredentialRenewalRecord,
} from "../../src/services/credentials/credentialKeyRenewal";
import {
  refreshCredentialRenewalStatuses,
  submitRenewalRequest,
} from "../../src/services/credentials/credentialRenewalService";
import { shouldShowRenewedActiveBadge } from "../../src/services/credentials/credentialRenewalPresentation";
import { findCleanupPendingForCredentialType } from "../../src/services/credentials/renewalCleanupNotification";
import { showPidGateDialog } from "../../src/services/credentials/pidGateDialog";
import {
  readIssuerSuspensionStatuses,
  refreshIssuerSuspensionsFromServer,
  type IssuerSuspensionRecord,
} from "../../src/services/credentials/issuerSuspension";
import { logWalletError } from "../../src/services/debug/walletLogger";
import {
  WALLET_HOME_COPY,
  readWalletHomeBadgeLabel,
} from "../../src/services/credentials/walletHomeCopy";
import {
  clearSuccessfulPresentationBadge,
  readSuccessfullyPresentedCredentialIds,
} from "../../src/services/history/presentationHistory";
import {
  readStoredCredentials,
  subscribeCredentialsChange,
} from "../../src/services/credentials/storedCredentials";
import type { VerifiableCredentialRecord } from "../../src/services/vci/exchangeService";

type DocumentMenuItem = {
  label: string;
  icon: ImageSourcePropType;
  iconStyle: { width: number; height: number };
  credentialType?: string;
};

const RENEWAL_STATUS_POLL_INTERVAL_MS = 4000

const documentMenuItems: DocumentMenuItem[] = [
  {
    label: "ID Card",
    icon: require("../../assets/images/profile.png"),
    iconStyle: { width: 41, height: 27 },
    credentialType: "ThaiNationalID",
  },
  {
    label: "Driving License",
    icon: require("../../assets/images/car.png"),
    iconStyle: { width: 40, height: 40 },
    credentialType: "DLTDrivingLicence",
  },
  {
    label: "Transcript",
    icon: require("../../assets/images/transcript.png"),
    iconStyle: { width: 40, height: 40 },
    credentialType: "BangkokUniversityTranscript",
  },
  {
    label: "Medical certificate",
    icon: require("../../assets/images/doctor_bag.png"),
    iconStyle: { width: 40, height: 40 },
  },
];

function readCredentialBadge({
  inactiveState,
  isVerifiedCredential,
  isNewCredential,
  isRenewedActive,
}: {
  inactiveState: CredentialInactiveState;
  isVerifiedCredential: boolean;
  isNewCredential: boolean;
  isRenewedActive: boolean;
}): { label: string; className: string } | undefined {
  if (inactiveState.kind !== "active") {
    return {
      label: inactiveState.badgeLabel,
      className: inactiveState.badgeClassName,
    };
  }

  if (isRenewedActive) {
    return {
      label: readWalletHomeBadgeLabel("active"),
      className: "bg-[#18a05d]",
    };
  }

  if (isVerifiedCredential) {
    return {
      label: readWalletHomeBadgeLabel("verified"),
      className: "bg-[#18a05d]",
    };
  }

  if (isNewCredential) {
    return {
      label: readWalletHomeBadgeLabel("new"),
      className: "bg-[#18a05d]",
    };
  }

  return undefined;
}

export default function WalletHomeScreen() {
  const { credentials, error, refresh } = useStoredCredentials();
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const [expandedCredentialId, setExpandedCredentialId] = useState<
    string | null
  >(null);
  const [newCredentialIds, setNewCredentialIds] = useState<string[]>([]);
  const [verifiedCredentialIds, setVerifiedCredentialIds] = useState<string[]>(
    [],
  );
  const [issuerSuspensionStatuses, setIssuerSuspensionStatuses] = useState<
    Record<string, IssuerSuspensionRecord>
  >({});
  const [renewalStatuses, setRenewalStatuses] = useState<
    Record<string, CredentialRenewalRecord>
  >({});
  const lifecycleStatuses = readCredentialLifecycleStatuses(credentials);
  const summaryCredential = pickPreferredHomeCredential(
    credentials.filter((record) => record.type === "ThaiNationalID"),
    renewalStatuses,
  );

  const syncLocalCredentialStatuses = useCallback(() => {
    const latestCredentials = readStoredCredentials();
    setNewCredentialIds(readNewCredentialBadgeIds());
    setVerifiedCredentialIds(readSuccessfullyPresentedCredentialIds());
    setIssuerSuspensionStatuses(
      readIssuerSuspensionStatuses(latestCredentials),
    );
    setRenewalStatuses(readCredentialRenewalStatuses(latestCredentials));
    refresh();
  }, [refresh]);

  const refreshCredentialStatuses = useCallback(async () => {
    syncLocalCredentialStatuses();

    const latestCredentials = readStoredCredentials();
    const statuses = readCredentialRenewalStatuses(latestCredentials);
    const needsServerPoll = Object.values(statuses).some(
      (record) => record.state === "renewal-processing",
    );
    if (!needsServerPoll) {
      return;
    }

    try {
      await refreshIssuerSuspensionsFromServer();
      await refreshCredentialRenewalStatuses();
    } finally {
      syncLocalCredentialStatuses();
    }
  }, [syncLocalCredentialStatuses]);

  useEffect(() => {
    return subscribeCredentialsChange(syncLocalCredentialStatuses);
  }, [syncLocalCredentialStatuses]);

  useEffect(() => {
    setIssuerSuspensionStatuses(readIssuerSuspensionStatuses(credentials));
    setRenewalStatuses(readCredentialRenewalStatuses(credentials));
  }, [credentials]);

  useEffect(() => {
    if (
      expandedCredentialId &&
      !credentials.some((record) => record.id === expandedCredentialId)
    ) {
      setExpandedCredentialId(null);
    }
  }, [credentials, expandedCredentialId]);

  useFocusEffect(
    useCallback(() => {
      syncLocalCredentialStatuses();
      void refreshCredentialStatuses();
    }, [refreshCredentialStatuses, syncLocalCredentialStatuses]),
  );

  const hasRenewalProcessing = useMemo(
    () =>
      Object.values(renewalStatuses).some(
        (record) => record.state === "renewal-processing",
      ),
    [renewalStatuses],
  );

  useEffect(() => {
    if (!hasRenewalProcessing) return;

    const timer = setInterval(() => {
      void refreshCredentialStatuses();
    }, RENEWAL_STATUS_POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [hasRenewalProcessing, refreshCredentialStatuses]);

  function handleInactiveCredentialPress(credentialId: string) {
    setExpandedCredentialId((current) =>
      current === credentialId ? null : credentialId,
    );
  }

  function readInactiveState(
    credential: VerifiableCredentialRecord | undefined,
    lifecycleStatus: CredentialLifecycleStatus | undefined,
  ): CredentialInactiveState {
    return readCredentialInactiveState({
      lifecycleStatus,
      suspensionStatus: credential
        ? issuerSuspensionStatuses[credential.id]
        : undefined,
      renewalStatus: credential ? renewalStatuses[credential.id] : undefined,
    });
  }

  async function handleRenewalRequest(credentialId: string) {
    try {
      await submitRenewalRequest(credentialId);
      const latestCredentials = readStoredCredentials();
      setRenewalStatuses(readCredentialRenewalStatuses(latestCredentials));
      refresh();
      setExpandedCredentialId(credentialId);
    } catch (renewalError) {
      logWalletError("wallet-home", "renewal-request-failed", renewalError, {
        credentialId,
      });
      showDialog({
        title: "ไม่สามารถขอเอกสารใหม่ได้",
        message: "กรุณาลองใหม่อีกครั้ง",
        icon: "danger",
        actions: [{ label: WALLET_HOME_COPY.cancel, variant: "secondary" }],
      });
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
      <WalletHeader />

      <View className="flex-1 bg-wallet-bg">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-3.5 px-4 pb-24 pt-5"
          showsVerticalScrollIndicator={false}
        >
          {summaryCredential ? (
            <WalletCredentialSummaryCard record={summaryCredential} />
          ) : (
            <WalletEmptyCredentialCard message={WALLET_HOME_COPY.emptyState} />
          )}

          {error ? (
            <View className="rounded-[14px] bg-red-50 px-5 py-4">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          <View className="gap-2.5">
            {documentMenuItems.map((item) => {
              // When both an old (old-revoked) and a new (renewed-active) credential
              // of the same type coexist after key renewal, prefer the renewed-active
              // one so the home screen reflects the latest state immediately.
              const credential = item.credentialType
                ? pickPreferredHomeCredential(
                    credentials.filter((r) => r.type === item.credentialType),
                    renewalStatuses,
                  )
                : undefined;
              const cleanupPendingForType = item.credentialType
                ? findCleanupPendingForCredentialType(item.credentialType)
                : undefined;
              const lifecycleStatus = credential
                ? lifecycleStatuses[credential.id]
                : undefined;
              const renewalStatus = credential
                ? renewalStatuses[credential.id]
                : undefined;
              const inactiveState = readInactiveState(
                credential,
                lifecycleStatus,
              );
              const isNewCredential = credential
                ? newCredentialIds.includes(credential.id)
                : false;
              const isVerifiedCredential = credential
                ? verifiedCredentialIds.includes(credential.id)
                : false;
              const isExpanded =
                credential?.id === expandedCredentialId &&
                inactiveState.kind !== "active";
              const badge = readCredentialBadge({
                inactiveState,
                isVerifiedCredential,
                isNewCredential,
                isRenewedActive:
                  credential && item.credentialType
                    ? shouldShowRenewedActiveBadge(
                        item.credentialType,
                        renewalStatus,
                      )
                    : false,
              });

              return (
                <WalletDocumentMenuItem
                  key={item.label}
                  label={item.label}
                  icon={item.icon}
                  iconStyle={item.iconStyle}
                  hasCredential={Boolean(credential)}
                  isExpanded={isExpanded}
                  badge={badge}
                  requestLabel={WALLET_HOME_COPY.requestCredential}
                  onPress={() => {
                      if (!credential) {
                        if (
                          canRequestCredentialType(
                            item.credentialType,
                            credentials,
                            renewalStatuses,
                          )
                        ) {
                          router.push("/(tabs)/scan");
                          return;
                        }
                        showPidGateDialog(
                          showDialog,
                          readPidGateStatus(credentials, renewalStatuses),
                          () => router.push("/(tabs)/scan"),
                        );
                        return;
                      }
                      if (isNewCredential) {
                        clearNewCredentialBadge(credential.id);
                        setNewCredentialIds((current) =>
                          current.filter(
                            (entryId) => entryId !== credential.id,
                          ),
                        );
                      }
                      if (isVerifiedCredential) {
                        clearSuccessfulPresentationBadge(credential.id);
                        setVerifiedCredentialIds((current) =>
                          current.filter(
                            (entryId) => entryId !== credential.id,
                          ),
                        );
                      }
                      if (inactiveState.kind !== "active") {
                        if (
                          item.credentialType !== "ThaiNationalID" &&
                          !hasUsablePidCredential(credentials, renewalStatuses)
                        ) {
                          showPidGateDialog(
                            showDialog,
                            readPidGateStatus(credentials, renewalStatuses),
                            () => router.push("/(tabs)/scan"),
                          );
                          return;
                        }
                        if (inactiveState.kind === "renewal-processing") {
                          router.push({
                            pathname: "/(tabs)/credential/[id]",
                            params: { id: credential.id },
                          });
                          return;
                        }
                        if (
                          inactiveState.kind === "renewal-required" ||
                          inactiveState.kind === "cleanup-pending"
                        ) {
                          handleInactiveCredentialPress(credential.id);
                          return;
                        }
                        handleInactiveCredentialPress(credential.id);
                        return;
                      }
                      if (renewalStatus?.state === "renewed-active") {
                        router.push({
                          pathname: "/(tabs)/credential/[id]",
                          params: { id: credential.id },
                        });
                        return;
                      }
                      router.push({
                        pathname: "/(tabs)/credential/[id]",
                        params: { id: credential.id },
                      });
                    }}
                  oldCredentialLabel={
                    cleanupPendingForType &&
                    cleanupPendingForType.oldCredentialId !== credential?.id
                      ? `${WALLET_HOME_COPY.viewCredential} (เอกสารเดิม)`
                      : undefined
                  }
                  onViewOldCredential={
                    cleanupPendingForType &&
                    cleanupPendingForType.oldCredentialId !== credential?.id
                      ? () => {
                          router.push({
                            pathname: "/(tabs)/credential/[id]",
                            params: {
                              id: cleanupPendingForType.oldCredentialId,
                            },
                          });
                        }
                      : undefined
                  }
                  inactivePanelMessage={
                    isExpanded ? inactiveState.panelMessage : undefined
                  }
                  showRenewalCta={
                    isExpanded &&
                    inactiveState.kind === "renewal-required" &&
                    credential
                      ? canSubmitCredentialRenewal(
                          credential.id,
                          credentials,
                          renewalStatuses,
                        )
                      : false
                  }
                  renewalCtaLabel={WALLET_HOME_COPY.requestCredential}
                  onRenewalRequest={
                    credential
                      ? () => {
                          void handleRenewalRequest(credential.id);
                        }
                      : undefined
                  }
                />
              );
            })}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
