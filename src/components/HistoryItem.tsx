import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  Image,
  Pressable,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import { AppButton } from "./AppButton";
import { StatusBadge } from "./StatusBadge";
import { getCardSchemaForConfigurationId } from "../config/cardSchemas";
import type { WalletHistoryRow } from "../services/history/walletHistory";

import { THEME } from '../config/themeColors'

const trashCanImage =
  require("../../assets/images/trash_can.png") as ImageSourcePropType;

const issuerLogoImages: Record<
  NonNullable<ReturnType<typeof getCardSchemaForConfigurationId>["issuerLogoKey"]>,
  ImageSourcePropType
> = {
  thaid: require("../../assets/images/thaid.png"),
  dltt: require("../../assets/images/dltt.png"),
  chulalongkorn: require("../../assets/images/chulalongkorn.png"),
};

type MaterialIconName = keyof typeof MaterialCommunityIcons.glyphMap;

function formatDateParts(value: string): { date: string; time: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: "" };

  return {
    date: new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  };
}

function readIssuerIcon(documentType: string): MaterialIconName {
  if (/driving|licence|license/i.test(documentType))
    return "card-account-details-outline";
  if (/transcript|academic/i.test(documentType)) return "school-outline";
  if (/id|national/i.test(documentType)) return "account-card-outline";
  return "file-document-outline";
}

function readStatusConfig(status: WalletHistoryRow["status"]) {
  switch (status) {
    case "cancelled":
      return { label: "ปฏิเสธแล้ว", color: THEME.slate, bg: THEME.gray200 };
    case "failed":
      return { label: "ไม่สำเร็จ", color: THEME.danger, bg: THEME.dangerTint };
    case "revoked":
      return { label: "ถูกระงับ", color: THEME.danger, bg: THEME.dangerTint };
    case "deleted":
      return { label: "ถูกลบ", color: THEME.danger, bg: THEME.dangerTint };
    default:
      return { label: "สำเร็จ", color: THEME.successDeep, bg: THEME.successTint };
  }
}

type HistoryItemProps = {
  item: WalletHistoryRow;
  onPress: () => void;
  onSuspendAccess?: () => void;
};

export function HistoryItem({ item, onPress, onSuspendAccess }: HistoryItemProps) {
  const dateParts = formatDateParts(item.occurredAt);
  const statusConfig = readStatusConfig(item.status);
  const issuerLogoKey = getCardSchemaForConfigurationId(item.documentType).issuerLogoKey;

  return (
    <Pressable
      onPress={onPress}
      className="overflow-hidden rounded-[12px] bg-white"
      style={{
        elevation: 2,
        shadowColor: THEME.navyShadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      }}
    >
      <View className="flex-row">
        <View className="w-1.5 bg-wallet-navy" />
        <View className="min-w-0 flex-1 px-3.5 py-3.5">
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-blue-tint">
              {issuerLogoKey ? (
                <Image
                  testID="history-item-issuer-logo"
                  source={issuerLogoImages[issuerLogoKey]}
                  className="h-10 w-10"
                  resizeMode="contain"
                  accessibilityLabel={`${item.partyName} logo`}
                />
              ) : (
                <View testID="history-item-issuer-icon">
                  <MaterialCommunityIcons
                    name={readIssuerIcon(item.documentType)}
                    size={24}
                    color={THEME.navy}
                  />
                </View>
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text
                className="text-[13px] font-semibold text-navy"
                numberOfLines={1}
              >
                {item.partyName}
              </Text>
              <View className="mt-2 flex-row flex-wrap items-center gap-x-2 gap-y-1">
                <Text className="text-[11px] text-gray500">
                  {dateParts.date}
                </Text>
                {dateParts.time ? (
                  <Text className="text-[11px] text-gray500">
                    {dateParts.time} น.
                  </Text>
                ) : null}
              </View>
            </View>
            <StatusBadge
              label={statusConfig.label}
              backgroundColor={statusConfig.bg}
              color={statusConfig.color}
              className=""
              textClassName="text-[11px] font-semibold"
            />
          </View>

          <View className="mt-3 rounded-lg bg-gray-300/50 px-3 py-2.5">
            <Text className="text-[11px] font-semibold text-gray500">
              {item.infoBoxLabel}
            </Text>
            <Text
              className="mt-1 text-[12px] font-bold text-gray-700"
              numberOfLines={2}
            >
              {item.infoBoxValue}
            </Text>
            <Text className="mt-2 text-[11px] text-black" numberOfLines={2}>
              {item.actionLabel} — {item.subtitle}
            </Text>
          </View>

          {onSuspendAccess ? (
            <View className="flex-row justify-center items-center">
              <AppButton
                label="ขอให้ระงับสิทธิ์เข้าถึงข้อมูลของฉันทันที"
                variant="outline-danger"
                icon={trashCanImage}
                onPress={onSuspendAccess}
                className="mt-3 px-4 py-3"
                textClassName="text-[11px] font-semibold text-center"
              />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
