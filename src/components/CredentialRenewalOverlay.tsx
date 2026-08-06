import { Image, Text, View } from "react-native";

import type { CredentialRenewalState } from "../services/credentials/credentialKeyRenewal";
import type { CredentialInactiveState } from "../services/credentials/credentialInactiveState";
import { shouldShowCredentialRenewalRibbon } from "../services/credentials/credentialRenewalPresentation";
import { readWalletHomeBadgeLabel } from "../services/credentials/walletHomeCopy";

const ribbonBadgeActiveImage = require("../../assets/images/ribbon_badge.png");
const ribbonBadgeInactiveImage = require("../../assets/images/ribbon_badge_inactive.png");

type CredentialRenewalOverlayProps = {
  inactiveState: CredentialInactiveState;
  badgeLabel?: string;
  renewalState?: CredentialRenewalState;
};

/**
 * P3 renewal ribbon + status pill on credential detail cards.
 * Grey inactive asset for waiting states; full-color green asset for renewed-active.
 */
export function CredentialRenewalOverlay({
  inactiveState,
  badgeLabel,
  renewalState,
}: CredentialRenewalOverlayProps) {
  if (!shouldShowCredentialRenewalRibbon(inactiveState, renewalState)) {
    return null;
  }

  if (inactiveState.kind === "active") {
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

  return (
    <>
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
      <View
        testID="credential-renewal-inactive-badge"
        className="absolute bottom-3 right-12 z-20 bg-gray-200 px-4 py-1.5"
      >
        <Text className="text-xs font-bold text-red-500">
          {inactiveState.badgeLabel}
        </Text>
      </View>
    </>
  );
}
