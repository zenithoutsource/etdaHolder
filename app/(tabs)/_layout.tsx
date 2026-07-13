import { Tabs } from 'expo-router';
import React from 'react';
import { Image, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WalletKeyExpiryHost } from '@/src/components/WalletKeyExpiryHost';
import { CredentialExpiryHost } from '@/src/components/CredentialExpiryHost';

import { THEME } from '../../src/config/themeColors'

type TabIconProps = {
  color: string;
  focused: boolean;
  source: ImageSourcePropType;
};

function TabAssetIcon({ color, focused, source }: TabIconProps) {
  return (
    <Image
      source={source}
      resizeMode="contain"
      style={{
        height: focused ? 27 : 25,
        opacity: focused ? 1 : 0.72,
        tintColor: color,
        width: focused ? 27 : 25,
      }}
    />
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <>
      <WalletKeyExpiryHost />
      <CredentialExpiryHost />
      <Tabs
      screenOptions={{
        tabBarActiveTintColor: THEME.navy,
        tabBarInactiveTintColor: THEME.slate,
        tabBarStyle: {
          backgroundColor: THEME.white,
          borderTopColor: THEME.gray200,
          borderTopWidth: 1,
          elevation: 8,
          height: 66 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color, focused }) => (
            <TabAssetIcon color={color} focused={focused} source={require('../../assets/images/wallet.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="qr"
        options={{
          title: 'My QR',
          tabBarIcon: ({ color, focused }) => (
            <TabAssetIcon color={color} focused={focused} source={require('../../assets/images/qr_code.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, focused }) => (
            <TabAssetIcon color={color} focused={focused} source={require('../../assets/images/scanner.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History Log',
          tabBarIcon: ({ color, focused }) => (
            <TabAssetIcon color={color} focused={focused} source={require('../../assets/images/history_log.png')} />
          ),
        }}
      />
      <Tabs.Screen
        name="history-event/[id]"
        options={{
          href: null,
          title: 'History Log',
        }}
      />
      <Tabs.Screen
        name="present"
        options={{
          href: null,
          title: 'Wallet',
        }}
      />
      <Tabs.Screen
        name="credential-offer"
        options={{
          href: null,
          title: 'Wallet',
        }}
      />
      <Tabs.Screen
        name="credential/[id]"
        options={{
          href: null,
          title: 'Wallet',
        }}
      />
    </Tabs>
    </>
  );
}
