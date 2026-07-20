import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Alert, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/tokens';

export default function MoreScreen() {
  const { user, logout, isLocked, trialDaysLeft } = useAuth();
  const navigation = useNavigation<any>();
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changing, setChanging] = useState(false);

  const isOwner = user?.role === 'owner';
  const ROLE_COLOR: Record<string,string> = { owner: Colors.amber, manager: Colors.blue, cleaner: Colors.brand, staff: '#a855f7' };
  const ROLE_LABEL: Record<string,string> = { owner:'Owner', manager:'Site Manager', cleaner:'Cleaner', staff:'Staff' };
  const roleColor = ROLE_COLOR[user?.role||'cleaner'] || Colors.brand;

  const OWNER_MENU = [
    { icon:'people-outline' as const, label:'Team OS', desc:`${user?.venueCount||1} venues • Manage managers, cleaners, staff`, color: Colors.blue, screen:'Team' },
    { icon:'bar-chart-outline' as const, label:'Reports & Analytics', desc:'Weekly ops reports, completion, issues', color: Colors.brand, screen:'Reports' },
    { icon:'add-circle-outline' as const, label:'Add Venue', desc:'New venue → auto zones + tasks', color: '#a855f7', screen:'AddVenue' },
    { icon:'shield-checkmark-outline' as const, label:'Billing & Subscription', desc: isLocked? 'Trial ended – action required' : user?.subscriptionStatus==='active' ? `$${((user?.venueCount||1)*19.95).toFixed(2)}/week • ${user?.venueCount||1} venues` : `${trialDaysLeft||14} days trial left`, color: isLocked? Colors.red : Colors.amber, screen:'Billing' },
  ];
  const MANAGER_MENU = [
    { icon:'people-outline' as const, label:'Team', desc:'View your venue team', color: Colors.blue, screen:'Team' },
    { icon:'bar-chart-outline' as const, label:'Reports', desc:'Venue performance', color: Colors.brand, screen:'Reports' },
    { icon:'add-circle-outline' as const, label:'Add Venue', desc:'Register new venue for your owner', color: '#a855f7', screen:'AddVenue' },
  ];
  const WORKER_MENU = [
    { icon:'help-circle-outline' as const, label:'How Ops Works', desc:'Tasks auto-reset daily, photo proof required', color: Colors.blue, screen:null },
    { icon:'shield-outline' as const, label:'Privacy & Security', desc:'RLS isolated • Your data is private', color: Colors.textMuted, screen:null },
  ];
  const MENU_ITEMS = isOwner ? OWNER_MENU : user?.role==='manager' ? MANAGER_MENU : WORKER_MENU;

  const trialProgress = (() => {
    if (!trialDaysLeft && trialDaysLeft!==0) return 100;
    return Math.max(0, Math.min(100, Math.round(((14 - (trialDaysLeft||0))/14)*100)));
  })();

  const openPwd = () => { setNewPwd(''); setConfirmPwd(''); setPwdModalOpen(true); };
  const handlePwd = async () => {
    if (!newPwd||!confirmPwd){ Alert.alert('Missing','Fill both fields'); return; }
    if (newPwd.length<6){ Alert.alert('Too short','Min 6 chars'); return; }
    if (newPwd!==confirmPwd){ Alert.alert('Mismatch','Passwords must match'); return; }
    setChanging(true);
    try { const {error}=await supabase.auth.updateUser({password:newPwd}); if(error) throw error; setPwdModalOpen(false); Alert.alert('✅ Password Changed'); }
    catch(e:any){ Alert.alert('Error', e.message||'Failed'); } finally { setChanging(false); }
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <Text style={s.heading}>Account OS</Text>
          <Text style={s.sub}>Profile, billing, team & security</Text>
        </View>

        {/* USER HERO */}
        <View style={s.heroCard}>
          <View style={s.heroTop}>
            <View style={[s.avatar,{backgroundColor: roleColor+'20', borderColor: roleColor+'30'}]}>
              <Text style={[s.avatarText,{color: roleColor}]}>{(user?.name||user?.email||'U').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</Text>
            </View>
            <View style={{flex:1, gap:3}}>
              <View style={{flexDirection:'row', alignItems:'center', gap:8}}><Text style={s.userName}>{user?.name||'User'}</Text><View style={[s.verifiedBadge]}><Ionicons name="checkmark-circle" size={12} color={Colors.brand}/><Text style={s.verifiedText}>Verified</Text></View></View>
              <Text style={s.userEmail}>{user?.email}</Text>
              <View style={{flexDirection:'row', gap:6, marginTop:4}}>
                <View style={[s.roleBadge,{backgroundColor: roleColor+'18', borderColor: roleColor+'30'}]}><Text style={[s.roleText,{color: roleColor}]}>{ROLE_LABEL[user?.role||'cleaner']}</Text></View>
                <View style={[s.roleBadge,{backgroundColor: Colors.surfaceRaised, borderColor: Colors.border}]}><Text style={[s.roleText,{color: Colors.textMuted}]}>{user?.subscriptionStatus==='active'?'Active':isLocked?'Locked':`Trial ${trialDaysLeft||14}d`}</Text></View>
              </View>
            </View>
          </View>

          {/* TRIAL / BILLING COMMAND CARD – Premium */}
          {isOwner && (
            <View style={[s.trialCard, isLocked?{borderColor: Colors.red+'40', backgroundColor: Colors.redSoft}: user?.subscriptionStatus==='active'?{borderColor: Colors.brand+'30', backgroundColor: Colors.brandSoft}: {borderColor: Colors.amber+'30', backgroundColor: 'rgba(247,184,75,0.08)'}]}>
              <View style={s.trialHeader}>
                <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
                  <View style={[s.trialDot,{backgroundColor: user?.subscriptionStatus==='active'?Colors.brand:isLocked?Colors.red:Colors.amber}]} />
                  <Text style={s.trialTitle}>{user?.subscriptionStatus==='active'?'Active Subscription':isLocked?'Trial Ended – Action Required':`Free Trial • ${trialDaysLeft||14} days left`}</Text>
                </View>
                <Text style={s.trialVenues}>{user?.venueCount||1} venue{(user?.venueCount||1)>1?'s':''}</Text>
              </View>
              {user?.subscriptionStatus!=='active' && !isLocked && (
                <>
                  <View style={s.progressTrack}><View style={[s.progressFill,{width:`${100-trialProgress}%`, backgroundColor: trialDaysLeft!==null && trialDaysLeft<=3? Colors.amber: Colors.brand}]}/></View>
                  <Text style={s.progressText}>{14-(trialDaysLeft||0)}/14 days used • {trialDaysLeft||14} remaining</Text>
                </>
              )}
              <View style={s.billingRow}>
                <View style={s.billingItem}><Text style={s.billingVal}>${((user?.venueCount||1)*19.95).toFixed(2)}</Text><Text style={s.billingLabel}>/week</Text></View>
                <View style={s.dividerV}/>
                <View style={s.billingItem}><Text style={s.billingVal}>{user?.venueCount||1}</Text><Text style={s.billingLabel}>venues</Text></View>
                <View style={s.dividerV}/>
                <View style={s.billingItem}><Text style={s.billingVal}>$19.95</Text><Text style={s.billingLabel}>per venue</Text></View>
              </View>
              <TouchableOpacity style={[s.trialBtn, isLocked?{backgroundColor: Colors.red}: user?.subscriptionStatus==='active'?{backgroundColor: Colors.surfaceRaised, borderWidth:1, borderColor: Colors.border}: {backgroundColor: Colors.brand}]} onPress={()=>{ setBillingModalOpen(false); Linking.openURL('https://venuesv.com/subscribe'); }}>
                <Text style={[s.trialBtnText, {color: user?.subscriptionStatus==='active'? Colors.text : isLocked? '#fff' : Colors.black}]}>{user?.subscriptionStatus==='active'?'Manage in Stripe →':isLocked?'Subscribe Now →':'View Billing →'}</Text>
              </TouchableOpacity>
              <View style={s.secureRow}><Ionicons name="lock-closed-outline" size={12} color={Colors.textMuted}/><Text style={s.secureText}>Stripe secure • Cancel anytime • RLS isolated • No per-user fees</Text></View>
            </View>
          )}
        </View>

        {/* OPS MENU */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Ops Control</Text>
          <View style={s.menuList}>
            {MENU_ITEMS.map((item,i)=>(
              <TouchableOpacity key={item.label} style={[s.menuItem, i===MENU_ITEMS.length-1&&{borderBottomWidth:0}]} onPress={()=>{
                if (item.screen==='Billing'){ setBillingModalOpen(true); return; }
                if (item.screen) navigation.navigate(item.screen); else Alert.alert(item.label, item.desc);
              }}>
                <View style={[s.menuIcon,{backgroundColor: item.color+'14', borderColor: item.color+'20'}]}><Ionicons name={item.icon} size={18} color={item.color}/></View>
                <View style={{flex:1, gap:2}}><Text style={s.menuLabel}>{item.label}</Text><Text style={s.menuDesc}>{item.desc}</Text></View>
                <Ionicons name="chevron-forward" size={14} color={Colors.textMuted}/>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* SECURITY */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Security & Account</Text>
          <View style={s.menuList}>
            <TouchableOpacity style={s.menuItem} onPress={openPwd}>
              <View style={[s.menuIcon,{backgroundColor: Colors.brandSoft, borderColor: Colors.brand+'20'}]}><Ionicons name="key-outline" size={18} color={Colors.brand}/></View>
              <View style={{flex:1, gap:2}}><Text style={s.menuLabel}>Change Password</Text><Text style={s.menuDesc}>Update password • Secure Supabase Auth</Text></View>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted}/>
            </TouchableOpacity>
            <View style={[s.menuItem, {borderBottomWidth:0}]}>
              <View style={[s.menuIcon,{backgroundColor: Colors.surfaceRaised, borderColor: Colors.border}]}><Ionicons name="shield-checkmark-outline" size={18} color={Colors.textMuted}/></View>
              <View style={{flex:1, gap:2}}><Text style={s.menuLabel}>Security</Text><Text style={s.menuDesc}>RLS isolated • Stripe PCI compliant • Supabase encrypted</Text></View>
              <View style={[s.badge,{backgroundColor: Colors.brandSoft}]}><Text style={[s.badgeText,{color: Colors.brand}]}>Secure</Text></View>
            </View>
          </View>
        </View>

        {/* TRIAL EXPLAINER FOR NON-OWNER */}
        {!isOwner && (
          <View style={[s.trialCard,{backgroundColor: Colors.surface, borderColor: Colors.border}]}>
            <View style={{flexDirection:'row', gap:10, alignItems:'center'}}><View style={[s.trialDot,{backgroundColor: Colors.blue}]} /><Text style={s.trialTitle}>Team Member Access</Text></View>
            <Text style={[s.progressText,{marginTop:8}]}>You are invited by your owner/manager. You have role-based access to assigned venues only. Billing is handled by owner – no cost to you. Trial status is managed by owner account.</Text>
          </View>
        )}

        <TouchableOpacity style={s.logoutBtn} onPress={()=> Alert.alert('Log Out','Clear session and cached data?',[{text:'Cancel',style:'cancel'},{text:'Log Out',style:'destructive',onPress: logout}])}>
          <Ionicons name="log-out-outline" size={16} color={Colors.red}/><Text style={s.logoutText}>Log Out • Clear Cache</Text>
        </TouchableOpacity>
        <Text style={s.version}>VenuesV OS v1.0.0 • Supabase • Stripe • Expo • {user?.uid?.slice(0,6) || ''}</Text>
        <View style={{height:24}}/>
      </ScrollView>

      {/* BILLING MODAL – PREMIUM */}
      <Modal visible={billingModalOpen} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}><Text style={s.modalTitle}>Billing OS • Premium</Text><TouchableOpacity onPress={()=>setBillingModalOpen(false)}><Ionicons name="close" size={20} color={Colors.textMuted}/></TouchableOpacity></View>
            <View style={[s.trialCard,{marginTop:4, backgroundColor: user?.subscriptionStatus==='active'?Colors.brandSoft:isLocked?Colors.redSoft:'rgba(247,184,75,0.08)', borderColor: user?.subscriptionStatus==='active'?Colors.brand+'30':isLocked?Colors.red+'30':Colors.amber+'30'}]}>
              <View style={s.trialHeader}>
                <View style={{flexDirection:'row', alignItems:'center', gap:8}}><View style={[s.trialDot,{backgroundColor: user?.subscriptionStatus==='active'?Colors.brand:isLocked?Colors.red:Colors.amber}]}/><Text style={s.trialTitle}>{user?.subscriptionStatus==='active'?'Active':isLocked?'Trial Ended':`Trial • ${trialDaysLeft||14}d left`}</Text></View>
                <Text style={s.trialVenues}>{user?.venueCount||1} venues</Text>
              </View>
              {user?.subscriptionStatus!=='active'&&!isLocked&&<><View style={s.progressTrack}><View style={[s.progressFill,{width:`${100-trialProgress}%`}]} /></View><Text style={s.progressText}>Trial progress {trialProgress}% • Started {user?.trialEndsAt? new Date(Date.now() - (14-(trialDaysLeft||0))*86400000).toLocaleDateString('en-AU') : 'recently'}</Text></>}
              <View style={s.billingRow}>
                <View style={s.billingItem}><Text style={s.billingVal}>${((user?.venueCount||1)*19.95).toFixed(2)}</Text><Text style={s.billingLabel}>AUD / week</Text></View>
                <View style={s.dividerV}/>
                <View style={s.billingItem}><Text style={s.billingVal}>{user?.venueCount||1}</Text><Text style={s.billingLabel}>venues × $19.95</Text></View>
              </View>
            </View>
            <View style={{gap:8, marginTop:12}}>
              <View style={s.featureRow}><Ionicons name="checkmark-circle" size={14} color={Colors.brand}/><Text style={s.featureText}>Unlimited tasks, issues, zones per venue</Text></View>
              <View style={s.featureRow}><Ionicons name="checkmark-circle" size={14} color={Colors.brand}/><Text style={s.featureText}>Team chat + push notifications + RLS security</Text></View>
              <View style={s.featureRow}><Ionicons name="checkmark-circle" size={14} color={Colors.brand}/><Text style={s.featureText}>Cancel anytime • No per-user fees • Stripe secure</Text></View>
            </View>
            <TouchableOpacity style={[s.trialBtn, {marginTop:16, backgroundColor: isLocked?Colors.red:Colors.brand}]} onPress={()=>{ setBillingModalOpen(false); Linking.openURL('https://venuesv.com/subscribe'); }}>
              <Text style={[s.trialBtnText,{color: isLocked?'#fff':Colors.black}]}>{user?.subscriptionStatus==='active'?'Manage in Stripe Portal →':'Subscribe – $19.95/venue/week →'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.cancelBtn,{marginTop:10}]} onPress={()=>setBillingModalOpen(false)}><Text style={s.cancelText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PWD MODAL */}
      <Modal visible={pwdModalOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <View style={s.modalHeader}><Text style={s.modalTitle}>Change Password • Secure</Text><TouchableOpacity onPress={()=>setPwdModalOpen(false)}><Ionicons name="close" size={20} color={Colors.textMuted}/></TouchableOpacity></View>
              <Text style={s.fieldLabel}>NEW PASSWORD – Min 6 chars, Supabase Auth</Text>
              <TextInput style={s.input} placeholder="New password" placeholderTextColor={Colors.textMuted} value={newPwd} onChangeText={setNewPwd} secureTextEntry autoCapitalize="none"/>
              <Text style={s.fieldLabel}>CONFIRM</Text>
              <TextInput style={s.input} placeholder="Confirm" placeholderTextColor={Colors.textMuted} value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry autoCapitalize="none" onSubmitEditing={handlePwd}/>
              <View style={s.twoBtn}>
                <TouchableOpacity style={s.cancelBtn} onPress={()=>setPwdModalOpen(false)}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={s.sendBtn} onPress={handlePwd} disabled={changing}>{changing?<ActivityIndicator color={Colors.black}/>:<Text style={s.sendText}>Update →</Text>}</TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor: Colors.canvas},
  scroll:{padding:16, gap:14},
  header:{marginBottom:2},
  heading:{fontSize:24,fontWeight:'900',color:Colors.text, letterSpacing:-0.6},
  sub:{fontSize:12,color:Colors.textMuted, marginTop:2},
  heroCard:{backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius: Radius.xl, padding:16, gap:14},
  heroTop:{flexDirection:'row', alignItems:'center', gap:14},
  avatar:{width:52,height:52,borderRadius:26, borderWidth:1, alignItems:'center', justifyContent:'center'},
  avatarText:{fontSize:18,fontWeight:'900'},
  userName:{fontSize:16,fontWeight:'800',color:Colors.text},
  userEmail:{fontSize:11,color:Colors.textMuted, marginTop:2},
  verifiedBadge:{flexDirection:'row', alignItems:'center', gap:4, backgroundColor: Colors.brandSoft, borderWidth:1, borderColor: Colors.brand+'20', borderRadius:99, paddingHorizontal:8, paddingVertical:3, marginLeft:6},
  verifiedText:{fontSize:9,fontWeight:'800',color:Colors.brand, textTransform:'uppercase'},
  roleBadge:{paddingHorizontal:8,paddingVertical:3,borderRadius:99, borderWidth:1},
  roleText:{fontSize:9,fontWeight:'800', textTransform:'uppercase', letterSpacing:0.5},
  trialCard:{borderWidth:1, borderRadius: Radius.lg, padding:14, gap:10},
  trialHeader:{flexDirection:'row', justifyContent:'space-between', alignItems:'center'},
  trialDot:{width:8,height:8,borderRadius:4},
  trialTitle:{fontSize:12,fontWeight:'800',color:Colors.text},
  trialVenues:{fontSize:11,color:Colors.textMuted, fontWeight:'700'},
  progressTrack:{height:6, backgroundColor: Colors.surfaceRaised, borderRadius:3, overflow:'hidden', borderWidth:1, borderColor: Colors.border},
  progressFill:{height:'100%', backgroundColor: Colors.brand, borderRadius:3},
  progressText:{fontSize:10,color:Colors.textMuted},
  billingRow:{flexDirection:'row', alignItems:'center', gap:12, marginTop:4},
  billingItem:{flex:1, alignItems:'center', gap:2},
  billingVal:{fontSize:16,fontWeight:'900',color:Colors.text},
  billingLabel:{fontSize:10,color:Colors.textMuted, fontWeight:'600'},
  dividerV:{width:1,height:24,backgroundColor: Colors.border},
  trialBtn:{borderRadius:10, paddingVertical:12, alignItems:'center', marginTop:4},
  trialBtnText:{fontSize:13,fontWeight:'800'},
  secureRow:{flexDirection:'row', alignItems:'center', gap:6, marginTop:2},
  secureText:{fontSize:9,color:Colors.textMuted},
  section:{gap:8},
  sectionTitle:{fontSize:12,fontWeight:'800',color:Colors.textMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:2},
  menuList:{backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius: Radius.lg, overflow:'hidden'},
  menuItem:{flexDirection:'row', alignItems:'center', gap:12, padding:14, borderBottomWidth:1, borderBottomColor: Colors.border},
  menuIcon:{width:36,height:36,borderRadius:10, borderWidth:1, alignItems:'center', justifyContent:'center'},
  menuLabel:{fontSize:13,fontWeight:'700',color:Colors.text},
  menuDesc:{fontSize:11,color:Colors.textMuted, marginTop:1, lineHeight:14},
  badge:{paddingHorizontal:8,paddingVertical:3,borderRadius:99},
  badgeText:{fontSize:9,fontWeight:'800'},
  featureRow:{flexDirection:'row', alignItems:'center', gap:8},
  featureText:{fontSize:12,color:Colors.textSecondary, flex:1},
  logoutBtn:{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor: Colors.redSoft, borderWidth:1, borderColor: Colors.red+'30', borderRadius: Radius.lg, padding:14},
  logoutText:{color:Colors.red, fontWeight:'800', fontSize:13},
  version:{textAlign:'center', fontSize:10, color: Colors.textMuted, opacity:0.6},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.75)',justifyContent:'flex-end'},
  modalBox:{backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding:20, borderWidth:1, borderColor: Colors.border, maxHeight:'90%'},
  modalHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center', marginBottom:14},
  modalTitle:{fontSize:16,fontWeight:'900',color:Colors.text},
  fieldLabel:{fontSize:10,fontWeight:'800',color:Colors.textMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6, marginTop:10},
  input:{backgroundColor: Colors.surfaceRaised, borderWidth:1, borderColor: Colors.border, borderRadius:10, padding:12, color: Colors.text, fontSize:13},
  twoBtn:{flexDirection:'row', gap:10, marginTop:10},
  cancelBtn:{flex:1, backgroundColor:'transparent', borderWidth:1, borderColor: Colors.border, borderRadius:10, padding:12, alignItems:'center'},
  cancelText:{color: Colors.textMuted, fontWeight:'700'},
  sendBtn:{flex:1, backgroundColor: Colors.brand, borderRadius:10, padding:12, alignItems:'center'},
  sendText:{color: Colors.black, fontWeight:'800', fontSize:13},
});
