import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Modal, Pressable, Text, View } from "react-native";

import { AppButton } from "./AppButton";
import { WALLET_HOME_COPY } from "../services/credentials/walletHomeCopy";

import { THEME } from '../config/themeColors'

type WalletKeyExpiredModalProps = {
  visible: boolean;
  isRotating?: boolean;
  onCreateNewKey: () => void;
  onDismiss?: () => void;
};

export function WalletKeyExpiredModal({
  visible,
  isRotating = false,
  onCreateNewKey,
  onDismiss,
}: WalletKeyExpiredModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/45 px-6"
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss wallet key expiry dialog"
      >
        <Pressable
          className="w-full max-w-[340px] rounded-[16px] bg-white px-6 py-7"
          onPress={(event) => event.stopPropagation()}
        >
          <View className="mb-4 items-center">
            <View className="h-18 w-18 items-center justify-center">
              <MaterialCommunityIcons name="alert" size={64} color={THEME.goldDark} />
            </View>
          </View>
          <Text className="text-center text-xl font-bold text-black">
            {WALLET_HOME_COPY.walletKeyExpiredTitle}
          </Text>
          <View className="mt-6 justify-center items-center">
            <AppButton
              variant="solid-block"
              label={WALLET_HOME_COPY.createNewWalletKey}
              onPress={onCreateNewKey}
              disabled={isRotating}
              className="rounded-full w-36 py-2"
              textClassName="text-center text-sm font-bold"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
