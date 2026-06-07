import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
      Alert.alert('Account created', 'You can now sign in.', [
        { text: 'Sign In', onPress: () => router.replace('/login') },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f4f6fa' }}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'center', padding: 24 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, gap: 16, elevation: 3, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 10 }}>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 14, fontSize: 15, color: '#1a2a42' }}
            placeholder="Full Name (English only)"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
            value={name}
            onChangeText={setName}
          />
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: -8 }}>
            Please enter your name in English only (e.g. John Smith)
          </Text>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10 }}>
            <TextInput
              style={{ flex: 1, padding: 14, fontSize: 15, color: '#1a2a42' }}
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleRegister}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              style={{ paddingHorizontal: 14 }}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
              <MaterialCommunityIcons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color="#9ca3af"
              />
            </Pressable>
          </View>

          {error ? (
            <Text style={{ color: '#dc2626', fontSize: 13, textAlign: 'center' }}>{error}</Text>
          ) : null}

          <Pressable
            style={{ backgroundColor: '#002887', borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: isLoading ? 0.7 : 1 }}
            onPress={handleRegister}
            disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Create Account</Text>
            )}
          </Pressable>
        </View>

        <Pressable style={{ marginTop: 20, alignItems: 'center' }} onPress={() => router.back()}>
          <Text style={{ color: '#6d7a8d', fontSize: 14 }}>Already have an account? <Text style={{ color: '#002887', fontWeight: '600' }}>Sign In</Text></Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
