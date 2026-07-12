import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Linking, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

const SUBSCRIBE_BASE = 'https://venuesv.com/subscribe';

export default function SubscriptionBanner() {
  const { isLocked, trialDaysLeft, user } = useAuth();
  const slideAnim = useRef(new Animated.Value(-80)).current;

  const shouldShow = user?.role === 'owner' && (isLocked || (trialDaysLeft !== null && trialDaysLeft <= 3));

  // useEffect MUST come before any conditional return
  useEffect(() => {
    if (!shouldShow) return;
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [shouldShow]);

  if (!shouldShow) return null;

  const openSubscribe = () => {
    // Pass uid+email as params so the subscribe page doesn't need
    // a browser Firebase session — browser and app are separate contexts.
    const params = new URLSearchParams();
    if (user?.uid)   params.set('uid',   user.uid);
    if (user?.email) params.set('email', user.email);
    const url = `${SUBSCRIBE_BASE}?${params.toString()}`;
    Linking.openURL(url).catch(() => {});
  };

  if (isLocked) {
    return (
      <Animated.View style={[styles.banner, styles.bannerLocked, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.left}>
          <Ionicons name="lock-closed" color="#f24e6e" size={16} />
          <View style={styles.textWrap}>
            <Text style={styles.titleLocked}>Trial ended</Text>
            <Text style={styles.sub}>Subscribe to unlock your account</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.btnLocked} onPress={openSubscribe} activeOpacity={0.8}>
          <Text style={styles.btnLockedText}>Subscribe →</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.banner, styles.bannerWarning, { transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.left}>
        <Ionicons name="time-outline" color="#f5a623" size={16} />
        <View style={styles.textWrap}>
          <Text style={styles.titleWarning}>
            {trialDaysLeft === 0 ? 'Trial ends today' : `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left`}
          </Text>
          <Text style={styles.sub}>Subscribe to keep full access</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.btnWarning} onPress={openSubscribe} activeOpacity={0.8}>
        <Text style={styles.btnWarningText}>Subscribe →</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner:        { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingVertical:10, gap:12 },
  bannerLocked:  { backgroundColor:'rgba(242,78,110,.12)', borderBottomWidth:1, borderBottomColor:'rgba(242,78,110,.25)' },
  bannerWarning: { backgroundColor:'rgba(245,166,35,.1)', borderBottomWidth:1, borderBottomColor:'rgba(245,166,35,.2)' },
  left:          { flexDirection:'row', alignItems:'center', gap:10, flex:1 },
  textWrap:      { flex:1 },
  titleLocked:   { fontSize:13, fontWeight:'700', color:'#f24e6e' },
  titleWarning:  { fontSize:13, fontWeight:'700', color:'#f5a623' },
  sub:           { fontSize:11, color:'#6e7a8a', marginTop:1 },
  btnLocked:     { backgroundColor:'#f24e6e', paddingHorizontal:14, paddingVertical:7, borderRadius:8, flexShrink:0 },
  btnLockedText: { fontSize:12, fontWeight:'800', color:'#fff' },
  btnWarning:    { backgroundColor:'rgba(245,166,35,.15)', borderWidth:1, borderColor:'rgba(245,166,35,.3)', paddingHorizontal:14, paddingVertical:7, borderRadius:8, flexShrink:0 },
  btnWarningText:{ fontSize:12, fontWeight:'800', color:'#f5a623' },
});