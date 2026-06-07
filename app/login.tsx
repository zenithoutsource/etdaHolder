import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f4f6fa' }}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'center', padding: 24 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <View style={{ marginBottom: 40 }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: '#002887', textAlign: 'center' }}>ETDA Wallet</Text>
          <Text style={{ fontSize: 15, color: '#6d7a8d', textAlign: 'center', marginTop: 8 }}>Sign in to your account</Text>
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, gap: 16, elevation: 3, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 10 }}>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 14, fontSize: 15, color: '#1a2a42' }}
            placeholder="Email"
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 14, fontSize: 15, color: '#1a2a42' }}
            placeholder="Password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
          />

          {error ? (
            <Text style={{ color: '#dc2626', fontSize: 13, textAlign: 'center' }}>{error}</Text>
          ) : null}

          <Pressable
            style={{ backgroundColor: '#002887', borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: isLoading ? 0.7 : 1 }}
            onPress={handleLogin}
            disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Sign In</Text>
            )}
          </Pressable>
        </View>

        <Pressable style={{ marginTop: 20, alignItems: 'center' }} onPress={() => router.push('/register')}>
          <Text style={{ color: '#6d7a8d', fontSize: 14 }}>
            Create an account <Text style={{ color: '#002887', fontWeight: '600' }}>Register</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
