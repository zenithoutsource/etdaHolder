/** P3 renewal ribbon and status pill overlay on credential cards. */

import { Image, Text, View } from "react-native";

import type { CredentialRenewalState } from "../services/credentials/credentialKeyRenewal";
import type { CredentialInactiveState } from "../services/credentials/credentialInactiveState";
import { shouldShowCredentialRenewalRibbon } from "../services/credentials/credentialRenewalPresentation";
import { readCredentialStatusBadge } from "../services/credentials/credentialStatusBadge";
import { readWalletHomeBadgeLabel, WALLET_HOME_COPY } from "../services/credentials/walletHomeCopy";
import type { VerifiableCredentialRecord } from "../services/vci/exchangeService";
import { StatusBadge } from "./StatusBadge";

const ribbonBadgeActiveImage = require("../../assets/images/ribbon_badge.png");
const ribbonBadgeInactiveImage = require("../../assets/images/ribbon_badge_inactive.png");

type CredentialRenewalOverlayProps = {
  inactiveState: CredentialInactiveState;
  badgeLabel?: string;
  renewalState?: CredentialRenewalState;
  showInactiveRosette?: boolean;
  credential?: VerifiableCredentialRecord;
};

/**
 * P3 renewal ribbon + status pill on credential detail cards.
 * Grey inactive asset for waiting states; full-color green asset for renewed-active.
 * Calendar warning uses ใกล้หมดอายุ without the grey ribbon.
 */
export function CredentialRenewalOverlay({
  inactiveState,
  badgeLabel,
  renewalState,
  showInactiveRosette = true,
  credential,
}: CredentialRenewalOverlayProps) {
  const statusBadge = readCredentialStatusBadge({
    inactiveState,
    credential,
    isRenewedActive: renewalState === "renewed-active",
  });
  const showRibbon = shouldShowCredentialRenewalRibbon(inactiveState, renewalState);
  const expiringSoon = statusBadge?.label === WALLET_HOME_COPY.expiringSoonBadge;
  const keyTtlExpired =
    inactiveState.kind === "active" &&
    statusBadge?.label === WALLET_HOME_COPY.documentExpiredBadge;

  if (!showRibbon && !expiringSoon && !keyTtlExpired) {
    return null;
  }

  if (inactiveState.kind === "active" && renewalState === "renewed-active" && !expiringSoon && !keyTtlExpired) {
    const label = badgeLabel ?? readWalletHomeBadgeLabel("active");

    return (
      <>
        <View
          testID="credential-renewal-rosette-active"
          className="absolute -right-10 -top-8 z-20"
          pointerEvents="none"
        >
          <Image
            source={ribbonBadgeActiveImage}
            style={{ width: 148, height: 148 }}
            resizeMode="contain"
          />
        </View>
        <View
          testID="credential-renewal-active-badge"
          className="absolute bottom-3 right-12 z-20 bg-green-600 px-6 py-1.5"
        >
          <Text className="text-xs font-bold text-white">{label}</Text>
        </View>
      </>
    );
  }

  if (expiringSoon) {
    return (
      <View className="absolute bottom-3 right-12 z-20" testID="credential-expiring-soon-badge">
        <StatusBadge
          label={WALLET_HOME_COPY.expiringSoonBadge}
          className="bg-warning px-4 py-1.5"
        />
      </View>
    );
  }

  if (keyTtlExpired) {
    return (
      <View className="absolute bottom-3 right-12 z-20" testID="credential-key-ttl-expired-badge">
        <StatusBadge
          label={WALLET_HOME_COPY.documentExpiredBadge}
          className="bg-gray-badge px-4 py-1.5"
        />
      </View>
    );
  }

  if (!showRibbon || inactiveState.kind === "active") {
    return null;
  }

  return (
    <>
      {showInactiveRosette ? (
        <View
          testID="credential-renewal-rosette-inactive"
          className="absolute -right-10 -top-8 z-20"
          pointerEvents="none"
        >
          <Image
            source={ribbonBadgeInactiveImage}
            style={{ width: 148, height: 148 }}
            resizeMode="contain"
          />
        </View>
      ) : null}
      <View
        testID="credential-renewal-inactive-badge"
        className="absolute bottom-3 right-12 z-20 bg-gray-200 px-4 py-1.5"
      >
        <Text className="text-xs font-bold text-red-500">
          {statusBadge?.label ?? badgeLabel ?? inactiveState.badgeLabel}
        </Text>
      </View>
    </>
  );
}
