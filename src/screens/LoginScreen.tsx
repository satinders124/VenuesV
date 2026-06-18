import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView,
  Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Image
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
  if (!email || !password) {
    Alert.alert('Missing fields', 'Please enter email and password.');
    return;
  }
  setLoading(true);
  try {
    await login(email, password);
  } catch (err: any) {
    Alert.alert('Login Failed', err.message);
    setLoading(false);
  }
  // Don't setLoading(false) on success — AuthContext handles it
};

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
<View style={styles.logoWrap}>
  <Image
    source={require('../../assets/icon.png')}
    style={styles.logoImage}
    resizeMode="contain"
  />
  <Text style={styles.logoText}>Venues V</Text>
  <Text style={styles.logoSub}>Venue Operations Platform</Text>
</View>

<Text style={styles.welcomeText}>Welcome back</Text>
<Text style={styles.welcomeSub}>Sign in to your account</Text>

          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor="#6e7a8a"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#6e7a8a"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.loginBtnText}>SIGN IN →</Text>
            }
          </TouchableOpacity>

          <Text style={styles.hint}>
            Don't have an account? Contact your venue owner to get access.
          </Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#080a0e' },
  logoImage: { width:80, height:80, marginBottom:14 },
  scroll:       { padding:24, paddingTop:60 },
  logoWrap:     { alignItems:'center', marginBottom:40 },
  logoIcon:     { width:72, height:72, borderRadius:20, backgroundColor:'#00c896', alignItems:'center', justifyContent:'center', marginBottom:14 },
  logoEmoji:    { fontSize:36 },
  logoText:     { fontSize:36, fontWeight:'800', color:'#eef0f4', letterSpacing:2 },
  logoSub:      { fontSize:14, color:'#6e7a8a', marginTop:4 },
  welcomeText:  { fontSize:22, fontWeight:'800', color:'#eef0f4', marginBottom:4 },
  welcomeSub:   { fontSize:14, color:'#6e7a8a', marginBottom:28 },
  input:        { backgroundColor:'#161b24', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderRadius:10, padding:14, color:'#eef0f4', fontSize:15, marginBottom:12 },
  loginBtn:     { backgroundColor:'#00c896', borderRadius:10, padding:15, alignItems:'center', marginTop:4 },
  loginBtnText: { color:'#000', fontSize:15, fontWeight:'800', letterSpacing:1.5 },
  hint:         { textAlign:'center', fontSize:12, color:'#3a4252', marginTop:20, lineHeight:18 },
});