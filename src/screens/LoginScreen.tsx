import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView,
  Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform, Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';

const REMEMBER_KEY   = 'venuesv_remembered_email';

function friendlyAuthError(err: any): string {
  const code = err?.code || '';
  const message = err?.message || '';
  // Supabase sign-in errors
  if (message.includes('Invalid login credentials')) return 'Incorrect email or password. Please try again.';
  if (message.includes('Email not confirmed')) return 'Please verify your email address before signing in. Check your inbox.';
  if (code === 'validation_failed' || message.includes('invalid')) return "That email address doesn't look right.";
  if (message.includes('disabled')) return 'This account has been disabled. Contact hello@venuesv.com.';
  if (message.includes('rate limit') || message.includes('too many')) return 'Too many attempts. Please wait a moment and try again.';
  if (message.includes('network') || message.includes('fetch')) return 'Network error. Check your connection and try again.';
  return 'Could not sign in. Please try again.';
}

export default function LoginScreen() {
  const { login } = useAuth();
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [resetting,  setResetting]  = useState(false);

  // Load remembered email on mount
  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY).then(saved => {
      if (saved) { setEmail(saved); setRememberMe(true); }
    }).catch(() => {});
  }, []);

  const handleLogin = async () => {
    const cleanEmail    = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    if (!cleanEmail || !cleanPassword) {
      Alert.alert('Missing fields', 'Please enter email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(cleanEmail, cleanPassword);
      // Persist or clear remembered email after successful login
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_KEY, cleanEmail).catch(() => {});
      } else {
        await AsyncStorage.removeItem(REMEMBER_KEY).catch(() => {});
      }
    } catch (err: any) {
      Alert.alert('Login Failed', friendlyAuthError(err));
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      Alert.alert('Email required', 'Enter your email address above first, then tap "Forgot password?" again.');
      return;
    }
    Alert.alert(
      'Reset Password',
      `Send a password reset link to ${cleanEmail}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Link',
          onPress: async () => {
            setResetting(true);
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
                redirectTo: 'https://venuesv.com/accept-invite',
              });
              if (error) throw error;
            } catch (err: any) {
              // Supabase returns success even if email doesn't exist (security best practice)
            }
            Alert.alert('Check your email', `If an account exists for ${cleanEmail}, a password reset link has been sent.`);
            setResetting(false);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Logo */}
          <View style={styles.logoWrap}>
            <Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="contain"/>
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
            autoCorrect={false}
            returnKeyType="next"
          />
          <View style={styles.pwWrap}>
            <TextInput
              style={styles.pwInput}
              placeholder="Password"
              placeholderTextColor="#6e7a8a"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.pwToggle} activeOpacity={0.7}>
              <Text style={styles.pwToggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>

          {/* Remember Me + Forgot Password row */}
          <View style={styles.row}>
            <TouchableOpacity style={styles.rememberRow} onPress={() => setRememberMe(v => !v)} activeOpacity={0.7}>
              <View style={[styles.checkbox, rememberMe && styles.checkboxOn]}>
                {rememberMe && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleForgotPassword} disabled={resetting}>
              {resetting
                ? <ActivityIndicator color="#00c896" size="small"/>
                : <Text style={styles.forgotText}>Forgot password?</Text>
              }
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#000"/>
              : <Text style={styles.loginBtnText}>SIGN IN →</Text>
            }
          </TouchableOpacity>

          <Text style={styles.hint}>
            Don't have an account? Contact your venue owner to get access.
          </Text>

          <View style={{ height:40 }}/>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#080a0e' },
  scroll:       { padding:24, paddingTop:60 },
  logoWrap:     { alignItems:'center', marginBottom:40 },
  logoImage:    { width:80, height:80, marginBottom:14 },
  logoText:     { fontSize:36, fontWeight:'800', color:'#eef0f4', letterSpacing:2 },
  logoSub:      { fontSize:14, color:'#6e7a8a', marginTop:4 },
  welcomeText:  { fontSize:22, fontWeight:'800', color:'#eef0f4', marginBottom:4 },
  welcomeSub:   { fontSize:14, color:'#6e7a8a', marginBottom:28 },
  input:        { backgroundColor:'#161b24', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderRadius:10, padding:14, color:'#eef0f4', fontSize:15, marginBottom:12 },
  row:          { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:20, marginTop:-4 },
  rememberRow:  { flexDirection:'row', alignItems:'center', gap:8 },
  checkbox:     { width:18, height:18, borderRadius:5, borderWidth:1.5, borderColor:'#3a4252', alignItems:'center', justifyContent:'center' },
  checkboxOn:   { backgroundColor:'#00c896', borderColor:'#00c896' },
  checkmark:    { fontSize:11, color:'#000', fontWeight:'800', lineHeight:14 },
  rememberText: { fontSize:13, color:'#6e7a8a', fontWeight:'500' },
  forgotText:   { color:'#00c896', fontSize:13, fontWeight:'600' },
  pwWrap:       { backgroundColor:'#161b24', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderRadius:10, flexDirection:'row', alignItems:'center', marginBottom:12 },
  pwInput:      { flex:1, padding:14, color:'#eef0f4', fontSize:15 },
  pwToggle:     { paddingHorizontal:14, paddingVertical:14 },
  pwToggleText: { color:'#00c896', fontSize:13, fontWeight:'600' },
  loginBtn:     { backgroundColor:'#00c896', borderRadius:10, padding:15, alignItems:'center', marginTop:4 },
  loginBtnText: { color:'#000', fontSize:15, fontWeight:'800', letterSpacing:1.5 },
  hint:         { textAlign:'center', fontSize:12, color:'#3a4252', marginTop:20, lineHeight:18 },
});