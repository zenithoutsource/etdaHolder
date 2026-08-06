import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  WALLET_HISTORY_FILTER_OPTIONS,
  type WalletHistoryFilter,
} from '../services/history/walletHistoryFilters';

import { THEME } from '../config/themeColors'

type HistoryFilterChipsProps = {
  value: WalletHistoryFilter;
  onChange: (value: WalletHistoryFilter) => void;
};

export function HistoryFilterChips({ value, onChange }: HistoryFilterChipsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-1">
      <View className="flex-row gap-2">
        {WALLET_HISTORY_FILTER_OPTIONS.map((option) => {
          const selected = option.id === value;
          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              className={`rounded-full px-3.5 py-2 ${selected ? 'bg-wallet-navy' : 'bg-white'}`}
              style={
                selected
                  ? undefined
                  : {
                      elevation: 1,
                      shadowColor: THEME.navyShadow,
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.06,
                      shadowRadius: 4,
                    }
              }
            >
              <Text
                className={`text-[12px] font-semibold ${selected ? 'text-white' : 'text-navy'}`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
