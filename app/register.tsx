import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '../src/components/AppButton';
import { useAppDialog } from '../src/components/AppDialog';
import { useAuthStore } from '../src/store/authStore';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const register = useAuthStore((s) => s.register);
  const isLoading = useAuthStore((s) => s.isLoading);
  const router = useRouter();
  const { showDialog } = useAppDialog();

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password) {
      setError('All fields are required.');
      return;
    }
    if (!/^[a-zA-Z\s''-]+$/.test(name.trim())) {
      setError('Full name must be in English only.');
      return;
    }
    setError(null);
    try {
      await register(email.trim(), password, name.trim());
      showDialog({
        title: 'Account created',
        message: 'You can now sign in.',
        icon: 'success',
        actions: [
          { label: 'Sign In', onPress: () => router.replace('/login') },
        ],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f4f6fa]">
      <KeyboardAvoidingView
        className="flex-1 justify-center p-6"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <View
          className="gap-4 rounded-[18px] bg-white p-6"
          style={{ elevation: 3, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 10 }}>
          <TextInput
            className="rounded-[10px] border border-[#e2e8f0] p-[14px] text-[15px] text-[#1a2a42]"
            placeholder="Full Name (English only)"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
            value={name}
            onChangeText={setName}
          />
          <Text className="-mt-2 text-xs text-[#9ca3af]">
            Please enter your name in English only (e.g. John Smith)
          </Text>
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
          <View className="flex-row items-center rounded-[10px] border border-[#e2e8f0]">
            <TextInput
              className="flex-1 p-[14px] text-[15px] text-[#1a2a42]"
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleRegister}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              className="px-[14px]"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
              <MaterialCommunityIcons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color="#9ca3af"
              />
            </Pressable>
          </View>

          {error ? (
            <Text className="text-center text-[13px] text-[#dc2626]">{error}</Text>
          ) : null}

          <AppButton
            variant="solid-block"
            label="Create Account"
            onPress={handleRegister}
            disabled={isLoading}
            loading={isLoading}
            className={`rounded-xl py-[14px] ${isLoading ? 'opacity-70' : ''}`}
            textClassName="text-[15px] font-semibold"
          />
        </View>

        <Pressable className="mt-5 items-center" onPress={() => router.back()}>
          <Text className="text-sm text-[#6d7a8d]">
            Already have an account? <Text className="font-semibold text-wallet-navy">Sign In</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
