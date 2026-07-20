import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity, ScrollView, Alert, Modal,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const OWNER_MENU = [
  { icon:'people-outline',    label:'Team',     desc:'Manage site managers, cleaners and staff', color:'#2c7ef7', screen:'Team'     },
  { icon:'bar-chart-outline', label:'Reports',  desc:'Download weekly reports per venue',         color:'#00c896', screen:'Reports'  },
  { icon:'add-circle-outline',label:'Add Venue',desc:'Register a new venue',                      color:'#a855f7', screen:'AddVenue' },
  { icon:'card-outline',      label:'Billing',  desc:'View your subscription and usage',          color:'#f5a623', screen:'Billing'  },
];

const MANAGER_MENU = [
  { icon:'people-outline',    label:'Team',     desc:'View your venue team',                      color:'#2c7ef7', screen:'Team'     },
  { icon:'bar-chart-outline', label:'Reports',  desc:'View venue performance',                    color:'#00c896', screen:'Reports'  },
  { icon:'add-circle-outline',label:'Add Venue',desc:'Register a new venue',  color:'#a855f7', screen:'AddVenue' }
];

const CLEANER_MENU = [
  { icon:'help-circle-outline', label:'Help',    desc:'How to use Venues V',                      color:'#2c7ef7', screen:null },
  { icon:'shield-outline',      label:'Privacy', desc:'Data and privacy settings',                color:'#6e7a8a', screen:null },
];

export default function MoreScreen() {
  const { user, logout, isLocked, trialDaysLeft } = useAuth();
  const navigation = useNavigation<any>();

  const [pwdModalOpen,     setPwdModalOpen]     = useState(false);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [currentPwd, setCurrentPwd]     = useState('');
  const [newPwd, setNewPwd]             = useState('');
  const [confirmPwd, setConfirmPwd]     = useState('');
  const [changing, setChanging]         = useState(false);

  const isOwner   = user?.role === 'owner';
  const isManager = user?.role === 'manager';
  const isWorker  = user?.role === 'cleaner' || user?.role === 'staff';

  const MENU_ITEMS = isOwner ? OWNER_MENU : isManager ? MANAGER_MENU : CLEANER_MENU;

  const ROLE_COLOR: Record<string,string> = {
    owner:'#f5a623', manager:'#2c7ef7', cleaner:'#00c896', staff:'#a855f7',
  };

  const ROLE_LABEL: Record<string,string> = {
    owner:'Owner', manager:'Site Manager', cleaner:'Cleaner', staff:'Staff',
  };

  const roleColor = ROLE_COLOR[user?.role||'cleaner'] || '#00c896';

  const openPasswordModal = () => {
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    setPwdModalOpen(true);
  };

  const handleChangePassword = async () => {
    if (!newPwd || !confirmPwd) {
      Alert.alert('Missing fields', 'Please fill in the new password fields.');
      return;
    }
    if (newPwd.length < 6) {
      Alert.alert('Password too short', 'New password must be at least 6 characters.');
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert('Passwords don\'t match', 'New password and confirmation must match.');
      return;
    }

    setChanging(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPwd
      });

      if (error) throw error;

      setPwdModalOpen(false);
      Alert.alert('✅ Password Changed', 'Your password has been updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to change password.');
    }
    setChanging(false);
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>

        <View style={s.header}>
          <Text style={s.heading}>More</Text>
        </View>

        {/* User card */}
        <View style={s.userCard}>
          <View style={[s.avatar, { backgroundColor: roleColor+'33' }]}>
            <Text style={[s.avatarText, { color: roleColor }]}>
              {(user?.name || user?.email || 'User').split(' ').map((n:string) => n[0]).join('').slice(0,2)}
            </Text>
          </View>
          <View style={s.userInfo}>
            <Text style={s.userName}>{user?.name || user?.name}</Text>
            <Text style={s.userEmail}>{user?.email}</Text>
          </View>
          <View style={[s.roleBadge, { backgroundColor: roleColor+'22' }]}>
            <Text style={[s.roleText, { color: roleColor }]}>
              {ROLE_LABEL[user?.role||'cleaner']}
            </Text>
          </View>
        </View>

        {/* Menu items */}
        <View style={s.menuList}>
          {MENU_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[s.menuItem, i === MENU_ITEMS.length - 1 && s.menuItemLast]}
              onPress={() => {
                if (item.screen === 'Billing') { setBillingModalOpen(true); return; }
                if (item.screen) navigation.navigate(item.screen);
                else Alert.alert(item.label, `${item.label} coming soon!`);
              }}
            >
              <View style={[s.menuIcon, { backgroundColor: item.color + '18' }]}>
                <Ionicons name={item.icon as any} color={item.color} size={20} />
              </View>
              <View style={s.menuText}>
                <Text style={s.menuLabel}>{item.label}</Text>
                <Text style={s.menuDesc}>{item.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" color="#3a4252" size={16} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Account section */}
        <View style={s.menuList}>
          <TouchableOpacity style={[s.menuItem, s.menuItemLast]} onPress={openPasswordModal}>
            <View style={[s.menuIcon, { backgroundColor: '#00c89618' }]}>
              <Ionicons name="key-outline" color="#00c896" size={20} />
            </View>
            <View style={s.menuText}>
              <Text style={s.menuLabel}>Change Password</Text>
              <Text style={s.menuDesc}>Update your account password</Text>
            </View>
            <Ionicons name="chevron-forward" color="#3a4252" size={16} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={s.logoutBtn}
          onPress={() => Alert.alert('Log Out', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Out', style: 'destructive', onPress: logout },
          ])}
        >
          <Ionicons name="log-out-outline" color="#f24e6e" size={18} />
          <Text style={s.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={s.version}>Venues V v1.0.0</Text>

      </ScrollView>

      {/* Billing Modal */}
      <Modal visible={billingModalOpen} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Billing & Subscription</Text>
              <TouchableOpacity onPress={()=>setBillingModalOpen(false)}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Status row */}
            <View style={s.billingStatus}>
              <View style={[s.billingDot, {backgroundColor: user?.subscriptionStatus==='active'?'#00c896':isLocked?'#f24e6e':'#f5a623'}]}/>
              <Text style={s.billingStatusText}>
                {user?.subscriptionStatus === 'active'
                  ? 'Active subscription'
                  : isLocked
                  ? 'Trial ended — action required'
                  : trialDaysLeft !== null && trialDaysLeft <= 3
                  ? `Trial ending soon — ${trialDaysLeft} day${trialDaysLeft===1?'':'s'} left`
                  : 'Free trial active'}
              </Text>
            </View>

            {/* Price breakdown — only show when subscribed */}
            {user?.subscriptionStatus === 'active' && (
              <View style={s.billingBreakdown}>
                <View style={s.billingRow}>
                  <Text style={s.billingLabel}>Venues</Text>
                  <Text style={s.billingVal}>{user?.venueCount ?? 1}</Text>
                </View>
                <View style={s.billingRow}>
                  <Text style={s.billingLabel}>Price per venue</Text>
                  <Text style={s.billingVal}>$19.95 / week</Text>
                </View>
                <View style={[s.billingRow, {borderBottomWidth:0, paddingTop:12}]}>
                  <Text style={[s.billingLabel, {fontSize:15, fontWeight:'700', color:'#eef0f4'}]}>Total per week</Text>
                  <Text style={[s.billingVal, {fontSize:22, color:'#00c896'}]}>${((user?.venueCount ?? 1) * 19.95).toFixed(2)}</Text>
                </View>
              </View>
            )}

            {/* CTA */}
            <TouchableOpacity
              style={[s.sendBtn, {marginTop:8}]}
              onPress={()=>{ setBillingModalOpen(false); Linking.openURL('https://venuesv.com/subscribe'); }}
            >
              <Text style={s.sendBtnText}>
                {user?.subscriptionStatus==='active' ? 'Manage subscription →' : 'Subscribe now →'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.cancelBtn, {marginTop:10}]} onPress={()=>setBillingModalOpen(false)}>
              <Text style={s.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={pwdModalOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Change Password</Text>
                <TouchableOpacity onPress={()=>setPwdModalOpen(false)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.fieldLabel}>NEW PASSWORD</Text>
              <TextInput
                style={s.input}
                placeholder="At least 6 characters"
                placeholderTextColor="#6e7a8a"
                value={newPwd}
                onChangeText={setNewPwd}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={s.fieldLabel}>CONFIRM NEW PASSWORD</Text>
              <TextInput
                style={s.input}
                placeholder="Re-enter new password"
                placeholderTextColor="#6e7a8a"
                value={confirmPwd}
                onChangeText={setConfirmPwd}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleChangePassword}
              />

              <View style={s.twoBtn}>
                <TouchableOpacity style={s.cancelBtn} onPress={()=>setPwdModalOpen(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.sendBtn} onPress={handleChangePassword} disabled={changing}>
                  {changing?<ActivityIndicator color="#000"/>:<Text style={s.sendBtnText}>Update Password</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#080a0e' },
  scroll:       { padding:24, gap:16 },
  header:       { marginBottom:4 },
  heading:      { fontSize:28, fontWeight:'800', color:'#eef0f4' },
  userCard:     { backgroundColor:'#0f1218', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderRadius:16, padding:16, flexDirection:'row', alignItems:'center', gap:14 },
  subCard:      { backgroundColor:'#0f1218', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderRadius:16, padding:16, gap:14 },
  subCardTop:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  subCardTitle: { fontSize:15, fontWeight:'700', color:'#eef0f4', marginBottom:4 },
  subCardStatus:{ fontSize:13, color:'#6e7a8a', fontWeight:'500' },
  subBadge:     { backgroundColor:'rgba(0,200,150,.1)', borderWidth:1, borderColor:'rgba(0,200,150,.2)', borderRadius:99, paddingHorizontal:10, paddingVertical:4 },
  subBadgeText: { fontSize:10, fontWeight:'800', color:'#00c896', letterSpacing:.5 },
  subPriceRow:  { flexDirection:'row', backgroundColor:'#080a0e', borderRadius:12, overflow:'hidden' },
  subPriceItem: { flex:1, padding:14, alignItems:'center' },
  subPriceDivider:{ width:1, backgroundColor:'rgba(255,255,255,.06)' },
  subPriceVal:  { fontSize:20, fontWeight:'900', color:'#00c896', letterSpacing:-.5 },
  subPriceLabel:{ fontSize:11, color:'#6e7a8a', marginTop:4, fontWeight:'500' },
  subBtn:       { backgroundColor:'rgba(0,200,150,.08)', borderWidth:1, borderColor:'rgba(0,200,150,.2)', borderRadius:10, padding:12, alignItems:'center' },
  subBtnText:   { fontSize:13, color:'#00c896', fontWeight:'700' },
  avatar:       { width:52, height:52, borderRadius:26, alignItems:'center', justifyContent:'center' },
  avatarText:   { fontSize:18, fontWeight:'800' },
  userInfo:     { flex:1 },
  userName:     { fontSize:16, fontWeight:'700', color:'#eef0f4' },
  userEmail:    { fontSize:12, color:'#6e7a8a', marginTop:3 },
  roleBadge:    { paddingHorizontal:10, paddingVertical:4, borderRadius:99 },
  roleText:     { fontSize:11, fontWeight:'700' },
  menuList:     { backgroundColor:'#0f1218', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderRadius:16, overflow:'hidden' },
  menuItem:     { flexDirection:'row', alignItems:'center', gap:14, padding:16, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,.05)' },
  menuItemLast: { borderBottomWidth:0 },
  menuIcon:     { width:40, height:40, borderRadius:10, alignItems:'center', justifyContent:'center' },
  menuText:     { flex:1 },
  menuLabel:    { fontSize:14, fontWeight:'600', color:'#eef0f4' },
  menuDesc:     { fontSize:12, color:'#6e7a8a', marginTop:2 },
  logoutBtn:    { backgroundColor:'rgba(242,78,110,.1)', borderWidth:1, borderColor:'rgba(242,78,110,.3)', borderRadius:12, padding:15, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:8 },
  logoutText:   { color:'#f24e6e', fontWeight:'700', fontSize:14 },
  version:       { textAlign:'center', fontSize:12, color:'#3a4252' },
  billingStatus: { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'rgba(255,255,255,.04)', borderRadius:10, padding:12, marginBottom:14 },
  billingDot:    { width:8, height:8, borderRadius:4 },
  billingStatusText:{ fontSize:13, color:'#eef0f4', fontWeight:'500', flex:1 },
  billingBreakdown:{ backgroundColor:'#080a0e', borderRadius:12, overflow:'hidden', marginBottom:14 },
  billingRow:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:14, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,.06)' },
  billingLabel:  { fontSize:13, color:'#6e7a8a' },
  billingVal:    { fontSize:14, fontWeight:'700', color:'#eef0f4' },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,.75)', justifyContent:'flex-end' },
  modalBox:     { backgroundColor:'#0f1218', borderTopLeftRadius:20, borderTopRightRadius:20, padding:24 },
  modalHeader:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:18 },
  modalTitle:   { fontSize:18, fontWeight:'800', color:'#eef0f4' },
  modalClose:   { fontSize:18, color:'#6e7a8a', padding:4 },
  fieldLabel:   { fontSize:11, fontWeight:'600', color:'#6e7a8a', letterSpacing:.5, marginBottom:8 },
  input:        { backgroundColor:'#161b24', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderRadius:10, padding:13, color:'#eef0f4', fontSize:14, marginBottom:14 },
  twoBtn:       { flexDirection:'row', gap:12, marginTop:4 },
  cancelBtn:    { flex:1, backgroundColor:'transparent', borderWidth:1, borderColor:'rgba(255,255,255,.1)', borderRadius:10, padding:13, alignItems:'center' },
  cancelBtnText:{ color:'#6e7a8a', fontWeight:'600' },
  sendBtn:      { flex:1, backgroundColor:'#00c896', borderRadius:10, padding:13, alignItems:'center' },
  sendBtnText:  { color:'#000', fontWeight:'700', fontSize:14 },
});