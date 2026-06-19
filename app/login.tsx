import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '../src/components/AppButton';
import { hasWalletPin } from '../src/services/auth/walletPin';
import { readPostLoginRoute } from '../src/services/auth/walletPinNavigation';
import { useAuthStore } from '../src/store/authStore';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Enter email and password.');
      return;
    }
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace(readPostLoginRoute({ platform: Platform.OS, hasWalletPin: hasWalletPin() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f4f6fa]">
      <KeyboardAvoidingView
        className="flex-1 justify-center p-6"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <View className="mb-10">
          <Text className="text-center text-[28px] font-bold text-wallet-navy">ETDA Wallet</Text>
          <Text className="mt-2 text-center text-[15px] text-[#6d7a8d]">Sign in to your account</Text>
        </View>

        <View
          className="gap-4 rounded-[18px] bg-white p-6"
          style={{ elevation: 3, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 10 }}>
          <TextInput
            className="rounded-[10px] border border-[#e2e8f0] p-[14px] text-[15px] text-[#1a2a42]"
            placeholder="Email"
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            className="rounded-[10px] border border-[#e2e8f0] p-[14px] text-[15px] text-[#1a2a42]"
            placeholder="Password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
          />

          {error ? (
            <Text className="text-center text-[13px] text-[#dc2626]">{error}</Text>
          ) : null}

          <AppButton
            variant="solid-block"
            label="Sign In"
            onPress={handleLogin}
            disabled={isLoading}
            loading={isLoading}
            className={`rounded-xl py-[14px] ${isLoading ? 'opacity-70' : ''}`}
            textClassName="text-[15px] font-semibold"
          />
        </View>

        <Pressable className="mt-5 items-center" onPress={() => router.push('/register')}>
          <Text className="text-sm text-[#6d7a8d]">
            Create an account <Text className="font-semibold text-wallet-navy">Register</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
