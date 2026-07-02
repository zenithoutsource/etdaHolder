import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text, View, type ImageSourcePropType } from "react-native";

import { AppButton } from "./AppButton";
import { StatusBadge } from "./StatusBadge";
import type { WalletHistoryEvent } from "../services/history/walletHistory";

const trashCanImage =
  require("../../assets/images/trash_can.png") as ImageSourcePropType;

type MaterialIconName = keyof typeof MaterialCommunityIcons.glyphMap;

function formatDateParts(value: string): { date: string; time: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: "" };

  return {
    date: new Intl.DateTimeFormat("th-TH", {
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

export function HistoryItem({ item }: { item: WalletHistoryEvent }) {
  const dateParts = formatDateParts(item.occurredAt);
  const statusConfig = {
    completed: { label: "สำเร็จ", color: "#118f4b", bg: "#e8f8ef" },
    revoked: { label: "ถูกระงับ", color: "#c00000", bg: "#fff0f0" },
    deleted: { label: "ถูกลบ", color: "#c00000", bg: "#fff0f0" },
  }[item.status];

  return (
    <View
      className="overflow-hidden rounded-[12px] bg-white"
      style={{
        elevation: 2,
        shadowColor: "#0f2849",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      }}
    >
      <View className="flex-row">
        <View className="w-1.5 bg-wallet-navy" />
        <View className="min-w-0 flex-1 px-3.5 py-3.5">
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-[#eef4ff]">
              <MaterialCommunityIcons
                name={readIssuerIcon(item.documentType)}
                size={24}
                color="#002887"
              />
            </View>
            <View className="min-w-0 flex-1">
              <Text
                className="text-[13px] font-semibold text-[#002887]"
                numberOfLines={1}
              >
                {item.issuerName}
              </Text>
              <View className="mt-2 flex-row flex-wrap items-center gap-x-2 gap-y-1">
                <Text className="text-[11px] text-[#6b7280]">
                  {dateParts.date}
                </Text>
                {dateParts.time ? (
                  <Text className="text-[11px] text-[#6b7280]">
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
            <Text
              className="text-[12px] font-bold text-gray-500"
              numberOfLines={2}
            >
              {item.actionLabel}
            </Text>
            <Text className="mt-1 text-[11px] text-black" numberOfLines={1}>
              {item.subtitle}
            </Text>
          </View>
          <View className="flex-row justify-center items-center">
            <AppButton
              label="ลบรายการ"
              variant="outline-danger"
              icon={trashCanImage}
              className="mt-3 px-20 py-4"
            />
          </View>
        </View>
      </View>
    </View>
  );
}
