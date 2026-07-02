import { Tabs } from 'expo-router';
import React from 'react';
import { Image, type ImageSourcePropType } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { WalletKeyExpiryHost } from '@/src/components/WalletKeyExpiryHost';
import { CredentialExpiryHost } from '@/src/components/CredentialExpiryHost';

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
  return (
    <>
      <WalletKeyExpiryHost />
      <CredentialExpiryHost />
      <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#002887',
        tabBarInactiveTintColor: '#6d7a8d',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e5e7eb',
          borderTopWidth: 1,
          elevation: 8,
          height: 66,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerShown: false,
        tabBarButton: HapticTab,
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
