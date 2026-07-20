import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/tokens';

const REMEMBER_KEY = 'venuesv_remembered_email';

function friendlyAuthError(err: any): string {
  const msg = err?.message || '';
  if (msg.includes('Invalid login')) return 'Incorrect email or password. Please try again.';
  if (msg.includes('Email not confirmed')) return 'Please verify email – check inbox + spam. OTP template must have {{ .Token }}.';
  if (msg.includes('disabled')) return 'Account disabled. Contact hello@venuesv.com.';
  if (msg.includes('rate limit')||msg.includes('too many')) return 'Too many attempts. Wait 60s.';
  if (msg.includes('network')||msg.includes('fetch')) return 'Network error. Check connection.';
  return 'Could not sign in. Try again.';
}

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(()=>{ AsyncStorage.getItem(REMEMBER_KEY).then(v=>{ if(v){ setEmail(v); setRememberMe(true);} }).catch(()=>{}); },[]);

  const handleLogin = async () => {
    const e = email.trim().toLowerCase();
    const p = password.trim();
    if (!e||!p){ Alert.alert('Missing','Enter email and password'); return; }
    setLoading(true);
    try {
      await login(e,p);
      if (rememberMe) await AsyncStorage.setItem(REMEMBER_KEY,e).catch(()=>{});
      else await AsyncStorage.removeItem(REMEMBER_KEY).catch(()=>{});
    } catch (err:any){ Alert.alert('Login Failed', friendlyAuthError(err)); setLoading(false); }
  };

  const handleForgot = () => {
    const e = email.trim().toLowerCase();
    if (!e){ Alert.alert('Email required','Enter email above first'); return; }
    Alert.alert('Reset Password',`Send reset link to ${e}?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Send Link',onPress: async()=>{
        setResetting(true);
        try { await supabase.auth.resetPasswordForEmail(e,{redirectTo:'https://venuesv.com/accept-invite'}); }
        catch{} Alert.alert('Check email',`If account exists for ${e}, reset link sent. Check spam.`); setResetting(false);
      }}
    ]);
  };

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.hero}>
            <View style={s.logoRing}><Image source={require('../../assets/icon.png')} style={s.logoImg} resizeMode="contain"/></View>
            <Text style={s.brand}>Venues V</Text>
            <View style={s.badgeRow}><View style={s.badge}><Text style={s.badgeText}>OS v1.0</Text></View><View style={s.badge}><Text style={s.badgeText}>RLS Secured</Text></View><View style={s.badge}><Text style={s.badgeText}>AUSTRALIA</Text></View></View>
          </View>

          <View style={s.card}>
            <View style={s.cardHead}>
              <View><Text style={s.welcome}>Welcome back</Text><Text style={s.welcomeSub}>Sign in to your ops command center</Text></View>
              <View style={s.liveDot}><View style={s.dot}/><Text style={s.liveText}>Live</Text></View>
            </View>

            <Text style={s.label}>WORK EMAIL</Text>
            <View style={s.inputWrap}>
              <Ionicons name="mail-outline" size={16} color={Colors.textMuted}/>
              <TextInput style={s.input} placeholder="you@yourpub.com.au" placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="next"/>
            </View>

            <Text style={s.label}>PASSWORD</Text>
            <View style={s.inputWrap}>
              <Ionicons name="lock-closed-outline" size={16} color={Colors.textMuted}/>
              <TextInput style={s.input} placeholder="Your secure password" placeholderTextColor={Colors.textMuted} value={password} onChangeText={setPassword} secureTextEntry={!showPw} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={handleLogin}/>
              <TouchableOpacity onPress={()=>setShowPw(v=>!v)}><Text style={s.showText}>{showPw?'Hide':'Show'}</Text></TouchableOpacity>
            </View>

            <View style={s.row}>
              <TouchableOpacity style={s.remember} onPress={()=>setRememberMe(v=>!v)}><View style={[s.check, rememberMe&&s.checkOn]}>{rememberMe&&<Ionicons name="checkmark" size={12} color={Colors.black}/>}</View><Text style={s.rememberText}>Remember me</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleForgot} disabled={resetting}>{resetting?<ActivityIndicator size="small" color={Colors.brand}/>:<Text style={s.forgot}>Forgot?</Text>}</TouchableOpacity>
            </View>

            <TouchableOpacity style={[s.loginBtn, loading&&{opacity:0.7}]} onPress={handleLogin} disabled={loading}>{loading?<ActivityIndicator color={Colors.black}/>:<><Text style={s.loginText}>SIGN IN TO OS →</Text><Ionicons name="arrow-forward" size={16} color={Colors.black}/></>}</TouchableOpacity>

            <View style={s.secureRow}><Ionicons name="shield-checkmark-outline" size={12} color={Colors.brand}/><Text style={s.secureText}>Supabase RLS • Stripe PCI • Encrypted at rest • AU data</Text></View>
          </View>

          <View style={s.hintCard}>
            <View style={s.hintIcon}><Ionicons name="people-outline" size={16} color={Colors.blue}/></View>
            <View style={{flex:1}}><Text style={s.hintTitle}>Team member?</Text><Text style={s.hintSub}>Ask your owner for invite. No cost per user – $19.95 per venue only. Check spam for invite link.</Text></View>
          </View>

          <Text style={s.footer}>VenuesV OS • Built for Australian hospitality • hello@venuesv.com</Text>
          <View style={{height:30}}/>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1, backgroundColor: Colors.canvas},
  scroll:{padding:20, paddingTop:40},
  hero:{alignItems:'center', marginBottom:24, gap:12},
  logoRing:{width:72,height:72,borderRadius:18, backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, alignItems:'center', justifyContent:'center'},
  logoImg:{width:48,height:48, borderRadius:10},
  brand:{fontSize:28,fontWeight:'900',color:Colors.text, letterSpacing:-0.8, marginTop:4},
  badgeRow:{flexDirection:'row', gap:6},
  badge:{backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius:99, paddingHorizontal:10, paddingVertical:4},
  badgeText:{fontSize:9,fontWeight:'800',color:Colors.textMuted, letterSpacing:0.5, textTransform:'uppercase'},
  card:{backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius: Radius.xl, padding:20, gap:14},
  cardHead:{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'},
  welcome:{fontSize:20,fontWeight:'900',color:Colors.text, letterSpacing:-0.4},
  welcomeSub:{fontSize:12,color:Colors.textMuted, marginTop:3},
  liveDot:{flexDirection:'row', alignItems:'center', gap:6, backgroundColor: Colors.brandSoft, borderWidth:1, borderColor: Colors.brand+'30', borderRadius:99, paddingHorizontal:10, paddingVertical:5},
  dot:{width:6,height:6,borderRadius:3, backgroundColor: Colors.brand},
  liveText:{fontSize:10,fontWeight:'800',color:Colors.brand},
  label:{fontSize:10,fontWeight:'800',color:Colors.textMuted, letterSpacing:0.6, textTransform:'uppercase', marginTop:2},
  inputWrap:{flexDirection:'row', alignItems:'center', gap:10, backgroundColor: Colors.surfaceRaised, borderWidth:1, borderColor: Colors.border, borderRadius:12, paddingHorizontal:12, paddingVertical:2},
  input:{flex:1, color:Colors.text, fontSize:14, paddingVertical:12},
  showText:{color: Colors.brand, fontSize:12, fontWeight:'700'},
  row:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:2},
  remember:{flexDirection:'row', alignItems:'center', gap:8},
  check:{width:18,height:18,borderRadius:6, borderWidth:1.5, borderColor: Colors.border, alignItems:'center', justifyContent:'center', backgroundColor: Colors.surfaceRaised},
  checkOn:{backgroundColor: Colors.brand, borderColor: Colors.brand},
  rememberText:{fontSize:12,color:Colors.textMuted, fontWeight:'500'},
  forgot:{color: Colors.brand, fontSize:12, fontWeight:'700'},
  loginBtn:{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor: Colors.brand, borderRadius:12, padding:15, marginTop:4},
  loginText:{color:Colors.black, fontSize:14, fontWeight:'900', letterSpacing:0.8},
  secureRow:{flexDirection:'row', alignItems:'center', gap:6, justifyContent:'center', marginTop:4},
  secureText:{fontSize:9,color:Colors.textMuted, textAlign:'center'},
  hintCard:{flexDirection:'row', gap:12, backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius: Radius.lg, padding:14, marginTop:4},
  hintIcon:{width:32,height:32,borderRadius:9, backgroundColor: Colors.blue+'14', borderWidth:1, borderColor: Colors.blue+'20', alignItems:'center', justifyContent:'center'},
  hintTitle:{fontSize:13,fontWeight:'700',color:Colors.text},
  hintSub:{fontSize:11,color:Colors.textMuted, marginTop:2, lineHeight:15},
  footer:{textAlign:'center', fontSize:10, color: Colors.textMuted, marginTop:20, opacity:0.6},
});
