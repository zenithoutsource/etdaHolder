/**
 * Wallet home tab — lists stored credentials and request CTAs.
 * Journey: P1 home; P3 Inactive split + portal/Scan intake; P6 inactive split rows.
 * Copy: src/services/credentials/walletHomeCopy.ts
 * Layout: WalletCredentialSummaryCard, WalletDocumentMenuItem; fields in src/config/cardSchemas.ts
 * Next: app/(tabs)/credential/[id].tsx
 * Map: docs/CODEMAPS/frontend.md#wallet
 */

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
import { useScreenCaptureGuard } from "../../src/hooks/useScreenCaptureGuard";
import { useStoredCredentials } from "../../src/hooks/useStoredCredentials";
import { useWalletKeyExpired } from "../../src/hooks/useWalletKeyExpired";
import {
  clearNewCredentialBadge,
  readNewCredentialBadgeIds,
} from "../../src/services/credentials/credentialBadges";
import {
  canSubmitCredentialRenewal,
  pickPreferredHomeCredential,
} from "../../src/services/credentials/credentialGuard";
import {
  readCredentialInactiveState,
  type CredentialInactiveState,
} from "../../src/services/credentials/credentialInactiveState";
import {
  shouldNavigateInactiveCredentialToDetail,
  shouldShowInactivePortalRequestCta,
  shouldShowReadyRenewalReceiveCta,
  shouldSplitSuspendedHomeRow,
} from "../../src/services/credentials/credentialHomeNavigation";
import { shouldOfferDocumentReissueCta, shouldShowWalletKeyExpiredPrompt } from "../../src/services/credentials/documentReissueCtaGate";
import { usesWalletWideKeyRotation } from "../../src/components/WalletKeyExpiryHost";
import { performWalletKeyRotationWithDialog } from "../../src/services/crypto/walletKeyRotationFlow";
import { readWalletKeyExpiryLane } from "../../src/services/crypto/walletKeyExpiryLane";
import { readWalletKeyRotationRecord } from "../../src/services/crypto/walletKeyRotation";
import { isIssuerPortalCredentialType, resolveIssuerPortalCredentialTypeFromRecord } from "../../src/config/issuerPortalUrls";
import { requestCredentialViaPortalFlow } from "../../src/services/credentials/requestCredentialViaPortalFlow";
import { buildRenewalRequestFailureDialog } from "../../src/services/credentials/renewalRequestFailureUi";
import { readCredentialStatusBadge } from "../../src/services/credentials/credentialStatusBadge";
import {
  readCredentialLifecycleStatuses,
  type CredentialLifecycleStatus,
} from "../../src/services/credentials/credentialLifecycle";
import {
  readCredentialRenewalStatuses,
  type CredentialRenewalRecord,
} from "../../src/services/credentials/credentialKeyRenewal";
import {
  claimReadyRenewal,
  refreshCredentialRenewalStatuses,
} from "../../src/services/credentials/credentialRenewalService";
import {
  abortRenewalIssuerIntake,
  startRenewalIssuerIntake,
} from "../../src/services/credentials/renewalIssuerIntake";
import { shouldShowRenewedActiveBadge } from "../../src/services/credentials/credentialRenewalPresentation";
import { findSupersededOldCredentialForDisplay } from "../../src/services/credentials/credentialSupersededSibling";
import {
  isCatalogFirstPartyMatch,
  listUnregisteredHomeDocuments,
} from "../../src/services/credentials/unregisteredHomeDocuments";
import {
  hasPendingIssuerSuspensionAck,
  readIssuerSuspensionStatuses,
  refreshIssuerSuspensionsFromServer,
  type IssuerSuspensionRecord,
} from "../../src/services/credentials/issuerSuspension";
import { logWalletError, logWalletStep } from "../../src/services/debug/walletLogger";
import { WALLET_HOME_COPY } from "../../src/services/credentials/walletHomeCopy";
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
    credentialType: "ChulalongkornUniversityTranscript",
  },
  {
    label: "Medical certificate",
    icon: require("../../assets/images/doctor_bag.png"),
    iconStyle: { width: 40, height: 40 },
  },
];

export default function WalletHomeScreen() {
  useScreenCaptureGuard();
  const { credentials, error, refresh } = useStoredCredentials();
  const { isExpired: walletKeyExpired } = useWalletKeyExpired();
  const walletKeyExpiryLane = readWalletKeyExpiryLane({
    keyExpired: walletKeyExpired,
    hasRotationRecord: Boolean(readWalletKeyRotationRecord()),
  });
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
  const [receivingRenewalCredentialId, setReceivingRenewalCredentialId] =
    useState<string | null>(null);
  const [isRotatingWalletKey, setIsRotatingWalletKey] = useState(false);
  const lifecycleStatuses = readCredentialLifecycleStatuses(credentials);
  const summaryCredential = pickPreferredHomeCredential(
    credentials.filter((record) => isCatalogFirstPartyMatch(record, "ThaiNationalID")),
    renewalStatuses,
  );
  const unregisteredDocuments = useMemo(
    () => listUnregisteredHomeDocuments(credentials, renewalStatuses),
    [credentials, renewalStatuses],
  );

  const syncLocalCredentialStatuses = useCallback(() => {
    const latestCredentials = readStoredCredentials();
    logWalletStep("wallet-home", "sync-local-credential-statuses", {
      credentialCount: latestCredentials.length,
    });
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
      credential,
    });
  }

  function handleRequestCredentialViaPortal(credentialType?: string) {
    void requestCredentialViaPortalFlow({ credentialType, router, showDialog });
  }

  async function handleRenewalRequest(credentialId: string) {
    const record = credentials.find((entry) => entry.id === credentialId);
    const credentialType =
      record ? resolveIssuerPortalCredentialTypeFromRecord(record) : undefined;
    try {
      await startRenewalIssuerIntake(credentialId);
      const latestCredentials = readStoredCredentials();
      setRenewalStatuses(readCredentialRenewalStatuses(latestCredentials));
      refresh();
      setExpandedCredentialId(credentialId);

      let outcome: Awaited<ReturnType<typeof requestCredentialViaPortalFlow>>;
      try {
        outcome = await requestCredentialViaPortalFlow({
          credentialType,
          router,
          showDialog,
        });
      } catch (portalError) {
        await abortRenewalIssuerIntake(credentialId);
        throw portalError;
      }

      if (outcome === "abandoned" || outcome === "blocked") {
        await abortRenewalIssuerIntake(credentialId);
        const afterAbort = readStoredCredentials();
        setRenewalStatuses(readCredentialRenewalStatuses(afterAbort));
        refresh();
      }
    } catch (renewalError) {
      logWalletError("wallet-home", "renewal-request-failed", renewalError, {
        credentialId,
      });
      showDialog(
        buildRenewalRequestFailureDialog(renewalError, {
          onRequestNewCredential: credentialType
            ? () => {
                handleRequestCredentialViaPortal(credentialType);
              }
            : undefined,
        }),
      );
    }
  }

  async function handleReceiveReadyRenewal(credentialId: string) {
    if (receivingRenewalCredentialId === credentialId) return;

    setReceivingRenewalCredentialId(credentialId);
    try {
      await claimReadyRenewal(credentialId);
      await refreshCredentialStatuses();
    } catch (renewalError) {
      logWalletError("wallet-home", "renewal-receive-failed", renewalError, {
        credentialId,
      });
      showDialog({
        title: "Unable to receive new credential",
        message: "Please try again.",
        icon: "danger",
        actions: [{ label: WALLET_HOME_COPY.cancel, variant: "secondary" }],
      });
    } finally {
      setReceivingRenewalCredentialId(null);
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
            <WalletCredentialSummaryCard
              record={summaryCredential}
              inactiveState={readInactiveState(
                summaryCredential,
                lifecycleStatuses[summaryCredential.id],
              )}
            />
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
                    credentials.filter((r) =>
                      isCatalogFirstPartyMatch(r, item.credentialType!),
                    ),
                    renewalStatuses,
                  )
                : undefined;
              const supersededOld = credential
                ? findSupersededOldCredentialForDisplay({
                    preferredCredential: credential,
                    credentials,
                    renewalStatuses,
                  })
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
              const badge = readCredentialStatusBadge({
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
                credential,
              });

              const splitSuspendedRow =
                Boolean(credential) && shouldSplitSuspendedHomeRow(inactiveState);

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
                        void handleRequestCredentialViaPortal(
                          item.credentialType,
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
                        if (shouldSplitSuspendedHomeRow(inactiveState)) {
                          router.push({
                            pathname: "/(tabs)/credential/[id]",
                            params: { id: credential.id },
                          });
                          return;
                        }
                        if (
                          shouldNavigateInactiveCredentialToDetail(
                            inactiveState,
                            {
                              hasPendingSuspensionAck:
                                hasPendingIssuerSuspensionAck(
                                  issuerSuspensionStatuses[credential.id],
                                ),
                              renewalStatus,
                            },
                          )
                        ) {
                          router.push({
                            pathname: "/(tabs)/credential/[id]",
                            params: { id: credential.id },
                          });
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
                  onToggleExpand={
                    splitSuspendedRow && credential
                      ? () => {
                          handleInactiveCredentialPress(credential.id);
                        }
                      : undefined
                  }
                  oldCredentialLabel={
                    supersededOld &&
                    supersededOld.oldCredentialId !== credential?.id
                      ? `${WALLET_HOME_COPY.viewCredential} (เอกสารเดิม)`
                      : undefined
                  }
                  onViewOldCredential={
                    supersededOld &&
                    supersededOld.oldCredentialId !== credential?.id
                      ? () => {
                          router.push({
                            pathname: "/(tabs)/credential/[id]",
                            params: {
                              id: supersededOld.oldCredentialId,
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
                  showReceiveRenewalCta={shouldShowReadyRenewalReceiveCta(
                    isExpanded,
                    renewalStatus,
                  )}
                  receiveRenewalCtaLabel="Receive new document"
                  onReceiveRenewal={
                    credential
                      ? () => {
                          void handleReceiveReadyRenewal(credential.id);
                        }
                      : undefined
                  }
                  isReceivingRenewal={
                    receivingRenewalCredentialId === credential?.id
                  }
                  showDocumentReissueCta={
                    isExpanded &&
                    shouldShowInactivePortalRequestCta(inactiveState) &&
                    isIssuerPortalCredentialType(item.credentialType) &&
                    (inactiveState.kind !== "document-expired" ||
                      shouldOfferDocumentReissueCta({
                        lane: walletKeyExpiryLane,
                        documentExpired: true,
                        renewalState: renewalStatus?.state,
                      }))
                  }
                  documentReissueCtaLabel={WALLET_HOME_COPY.requestNewCredential}
                  onDocumentReissue={() => {
                    void handleRequestCredentialViaPortal(item.credentialType);
                  }}
                  showWalletKeyExpiredPrompt={
                    isExpanded &&
                    inactiveState.kind === "document-expired" &&
                    shouldShowWalletKeyExpiredPrompt(
                      walletKeyExpiryLane,
                      usesWalletWideKeyRotation(),
                    )
                  }
                  isRotatingWalletKey={isRotatingWalletKey}
                  onCreateWalletKey={() => {
                    setIsRotatingWalletKey(true);
                    void performWalletKeyRotationWithDialog({
                      showDialog,
                      onSuccess: () => {
                        void refreshCredentialStatuses();
                      },
                      navigateToCredential: (credentialId) => {
                        router.push(`/(tabs)/credential/${credentialId}`);
                      },
                    }).finally(() => {
                      setIsRotatingWalletKey(false);
                    });
                  }}
                />
              );
            })}
            {unregisteredDocuments.map((item) => {
              const credential = item.record;
              const isNewCredential = newCredentialIds.includes(credential.id);
              const isVerifiedCredential = verifiedCredentialIds.includes(
                credential.id,
              );
              const lifecycleStatus = lifecycleStatuses[credential.id];
              const inactiveState = readInactiveState(
                credential,
                lifecycleStatus,
              );
              const badge = readCredentialStatusBadge({
                inactiveState,
                isVerifiedCredential,
                isNewCredential,
                isRenewedActive: false,
                credential,
              });

              const supersededOld = findSupersededOldCredentialForDisplay({
                preferredCredential: credential,
                credentials,
                renewalStatuses,
              });

              return (
                <WalletDocumentMenuItem
                  key={credential.id}
                  label={item.label}
                  icon={require("../../assets/images/profile.png")}
                  iconStyle={{ width: 41, height: 27 }}
                  hasCredential
                  isExpanded={false}
                  badge={badge}
                  requestLabel={WALLET_HOME_COPY.requestCredential}
                  oldCredentialLabel={
                    supersededOld
                      ? `${WALLET_HOME_COPY.viewCredential} (เอกสารเดิม)`
                      : undefined
                  }
                  onViewOldCredential={
                    supersededOld
                      ? () => {
                          router.push({
                            pathname: "/(tabs)/credential/[id]",
                            params: { id: supersededOld.oldCredentialId },
                          });
                        }
                      : undefined
                  }
                  onPress={() => {
                    if (isNewCredential) {
                      clearNewCredentialBadge(credential.id);
                      setNewCredentialIds((current) =>
                        current.filter((entryId) => entryId !== credential.id),
                      );
                    }
                    if (isVerifiedCredential) {
                      clearSuccessfulPresentationBadge(credential.id);
                      setVerifiedCredentialIds((current) =>
                        current.filter((entryId) => entryId !== credential.id),
                      );
                    }
                    router.push({
                      pathname: "/(tabs)/credential/[id]",
                      params: { id: credential.id },
                    });
                  }}
                />
              );
            })}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
