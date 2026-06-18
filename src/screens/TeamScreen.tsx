import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, onSnapshot, doc, deleteDoc, addDoc, setDoc, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RefreshControl } from 'react-native';


type Member = { id:string; name:string; email:string; role:string; venue:string; venues?:string[]; };
type Venue  = { id:string; name:string; };
type TabType = 'manager'|'cleaner'|'staff';

const ROLE_COLOR: Record<string,string> = {
  owner:'#f5a623', manager:'#2c7ef7', cleaner:'#00c896', staff:'#a855f7',
};

const ROLE_LABEL: Record<string,string> = {
  owner:'Owner', manager:'Site Manager', cleaner:'Cleaner', staff:'Staff',
};

const TABS: {key:TabType;label:string}[] = [
  {key:'manager',label:'Site Managers'},
  {key:'cleaner',label:'Cleaners'},
  {key:'staff',  label:'Staff'},
];

export default function TeamScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [members,   setMembers]   = useState<Member[]>([]);
  const [venues,    setVenues]    = useState<Venue[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('manager');
  const [search,    setSearch]    = useState('');
  const [modalOpen, setModal]     = useState(false);
  const [inviting,  setInviting]  = useState(false);
  const [name,      setName]      = useState('');
  const [email,     setEmail]     = useState('');
  const [role,      setRole]      = useState<TabType>('manager');
  const [venueId,   setVenueId]   = useState('');
  const [refreshing, setRefreshing] = useState(false);

const onRefresh = async () => {
  setRefreshing(true);
  setTimeout(() => setRefreshing(false), 1000);
};

  useEffect(() => {
    const u1 = onSnapshot(collection(db,'users'), snap => {
      setMembers(snap.docs.map(d=>({id:d.id,...d.data()})) as Member[]);
      setLoading(false);
    });
    const u2 = onSnapshot(collection(db,'venues'), snap => {
      const v = snap.docs.map(d=>({id:d.id,...d.data()})) as Venue[];
      setVenues(v);
      if (v.length > 0) setVenueId(v[0].id);
    });
    return ()=>{u1();u2();};
  },[]);

  const openInvite = () => {
    setRole(activeTab); setName(''); setEmail('');
    setModal(true);
  };

  const inviteMember = async () => {
  if (!name||!email) { Alert.alert('Missing','Enter name and email.'); return; }
  setInviting(true);
  try {
    // Check if user already exists in Firestore
    const existing = await getDocs(
      query(collection(db,'users'), where('email','==',email))
    );

    let uid = '';

    if (!existing.empty) {
  const existingDoc = existing.docs[0];
  const existingData = existingDoc.data();
  const newVenueName = venues.find(v=>v.id===venueId)?.name||'';
  const currentVenue = existingData.venue;

  if (currentVenue && currentVenue !== newVenueName) {
    Alert.alert(
      'Already Assigned',
      `${existingData.name} is currently at ${currentVenue}. What would you like to do?`,
      [
        {text:'Cancel', style:'cancel', onPress:()=>setInviting(false)},
        {text:'Add to Both', onPress: async()=>{
          const currentVenues: string[] = existingData.venues || [currentVenue];
          if (!currentVenues.includes(newVenueName)) currentVenues.push(newVenueName);
          await updateDoc(doc(db,'users',existingDoc.id), {
            venues: currentVenues,
            venue: currentVenue,
            role,
          });
          setModal(false); setName(''); setEmail('');
          Alert.alert('Done',`${existingData.name} added to both venues.`);
          setInviting(false);
        }},
        {text:'Move', onPress: async()=>{
          await updateDoc(doc(db,'users',existingDoc.id), {
            venue: newVenueName,
            venues: [newVenueName],
            role,
          });
          setModal(false); setName(''); setEmail('');
          Alert.alert('Done',`${existingData.name} moved to ${newVenueName}.`);
          setInviting(false);
        }},
      ]
    );
    return;
  }

  await updateDoc(doc(db,'users',existingDoc.id), {
    role,
    venue: newVenueName,
    venues: [newVenueName],
  });
  uid = existingDoc.data().uid;
} else {
      // Try creating new Firebase Auth account
      try {
        const tmp = 'Tmp'+Math.random().toString(36).slice(2,8)+'!';
        const cred = await createUserWithEmailAndPassword(auth,email,tmp);
        uid = cred.user.uid;
        await setDoc(doc(db,'users',uid),{
          uid, name, email, role,
          venue:venues.find(v=>v.id===venueId)?.name||'',
          tempPassword: tmp,
        });
      } catch(authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          // Auth account exists but no Firestore doc — can't get uid client-side.
          // Show error asking owner to search for this user via existing member search.
          Alert.alert(
            'Already Registered',
            `${email} already has an account. Use the existing member search to assign them to this venue instead.`
          );
        } else {
          throw authErr;
        }
      }
    }
    setModal(false); setName(''); setEmail('');
    Alert.alert('Done', `${name} has been added.`);
  } catch(err:any){ Alert.alert('Error',err.message); }
  setInviting(false);
};

  const removeMember = (m:Member) => {
  Alert.alert('Remove Member',`Remove ${m.name} from ${m.venue}?`,[
    {text:'Cancel',style:'cancel'},
    {text:'Remove',style:'destructive',onPress:async()=>{
      const currentVenues: string[] = m.venues || (m.venue ? [m.venue] : []);
      const updatedVenues = currentVenues.filter(v=>v!==m.venue);
      await updateDoc(doc(db,'users',m.id),{
        venues: updatedVenues,
        venue: updatedVenues.length>0 ? updatedVenues[0] : '',
      });
    }},
  ]);
};

  const getInitials = (n:string) =>
    n?.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?';

  const shown = members
    .filter(m=>m.role===activeTab)
    .filter(m=>
      search.trim()==='' ||
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()) ||
      m.venue?.toLowerCase().includes(search.toLowerCase())
    );

  if (loading) return (
    <SafeAreaView style={s.container}>
      <ActivityIndicator color="#00c896" style={{marginTop:100}}/>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={()=>navigation.goBack()}>
          <Ionicons name="arrow-back" color="#eef0f4" size={22}/>
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.heading}>Team</Text>
          <Text style={s.sub}>{members.filter(m=>m.role!=='owner').length} members</Text>
        </View>
        <TouchableOpacity style={s.inviteBtn} onPress={openInvite}>
          <Ionicons name="add" color="#000" size={18}/>
          <Text style={s.inviteBtnText}>Invite</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.searchBar}>
        <Ionicons name="search-outline" color="#6e7a8a" size={18}/>
        <TextInput
          style={s.searchInput}
          placeholder="Search by name, email or venue..."
          placeholderTextColor="#6e7a8a"
          value={search}
          onChangeText={setSearch}
        />
        {search.length>0 && (
          <TouchableOpacity onPress={()=>setSearch('')}>
            <Ionicons name="close-circle" color="#6e7a8a" size={18}/>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        {TABS.map(t=>(
          <TouchableOpacity key={t.key}
            style={[s.tab,activeTab===t.key&&s.tabActive]}
            onPress={()=>{setActiveTab(t.key);setSearch('');}}>
            <Text style={[s.tabText,activeTab===t.key&&s.tabTextActive]}>{t.label}</Text>
            <View style={[s.tabCount,activeTab===t.key&&{backgroundColor:'#00c896'}]}>
              <Text style={[s.tabCountText,activeTab===t.key&&{color:'#000'}]}>
                {members.filter(m=>m.role===t.key).length}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Member list */}
      <FlatList
  data={shown}
  keyExtractor={item=>item.id}
  contentContainerStyle={s.list}
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor="#00c896"
      colors={['#00c896']}
    />
  }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="people-outline" color="#3a4252" size={48}/>
            <Text style={s.emptyText}>
              {search?`No results for "${search}"`:`No ${ROLE_LABEL[activeTab]}s yet`}
            </Text>
            {!search&&(
              <TouchableOpacity style={s.emptyInviteBtn} onPress={openInvite}>
                <Text style={s.emptyInviteText}>Invite {ROLE_LABEL[activeTab]}</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({item:m})=>{
          const color = ROLE_COLOR[m.role]||'#6e7a8a';
          return (
            <View style={s.memberCard}>
              <View style={[s.avatar,{backgroundColor:color+'33'}]}>
                <Text style={[s.avatarText,{color}]}>{getInitials(m.name)}</Text>
              </View>
              <View style={s.memberInfo}>
                <Text style={s.memberName}>{m.name}</Text>
                <Text style={s.memberEmail}>{m.email}</Text>
                <Text style={s.memberVenue}>
  📍 {m.venues && m.venues.length > 1 ? m.venues.join(' · ') : m.venue}
</Text>
              </View>
              {m.role!=='owner'&&(
                <TouchableOpacity style={s.removeBtn} onPress={()=>removeMember(m)}>
                  <Text style={s.removeBtnText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Invite Modal */}
      <Modal visible={modalOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>Invite {ROLE_LABEL[role]}</Text>
                  <TouchableOpacity onPress={()=>setModal(false)}>
                    <Text style={s.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.fieldLabel}>ROLE</Text>
                <View style={s.roleRow}>
                  {TABS.map(t=>(
                    <TouchableOpacity key={t.key}
                      style={[s.roleOpt,role===t.key&&s.roleOptActive]}
                      onPress={()=>setRole(t.key)}>
                      <Text style={[s.roleOptText,role===t.key&&s.roleOptTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.fieldLabel}>ASSIGN TO VENUE</Text>
                <View style={s.venueList}>
                  {venues.map(v=>(
                    <TouchableOpacity key={v.id}
                      style={[s.venueOpt,venueId===v.id&&s.venueOptActive]}
                      onPress={()=>setVenueId(v.id)}>
                      <Text style={[s.venueOptText,venueId===v.id&&s.venueOptTextActive]}>{v.name}</Text>
                      {venueId===v.id&&<Ionicons name="checkmark" color="#00c896" size={16}/>}
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.fieldLabel}>FULL NAME</Text>
                <TextInput style={s.input} placeholder="e.g. Priya Sharma" placeholderTextColor="#6e7a8a" value={name} onChangeText={setName} returnKeyType="next"/>

                <Text style={s.fieldLabel}>EMAIL ADDRESS</Text>
                <TextInput style={s.input} placeholder="priya@cleanpro.com.au" placeholderTextColor="#6e7a8a" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" returnKeyType="done" onSubmitEditing={inviteMember}/>

                <View style={s.twoBtn}>
                  <TouchableOpacity style={s.cancelBtn} onPress={()=>setModal(false)}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.sendBtn} onPress={inviteMember} disabled={inviting}>
                    {inviting?<ActivityIndicator color="#000"/>:<Text style={s.sendBtnText}>Send Invite</Text>}
                  </TouchableOpacity>
                </View>
                <View style={{height:20}}/>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:        {flex:1,backgroundColor:'#080a0e'},
  header:           {flexDirection:'row',alignItems:'center',padding:16,gap:10},
  backBtn:          {width:36,height:36,backgroundColor:'#161b24',borderRadius:10,alignItems:'center',justifyContent:'center'},
  headerText:       {flex:1},
  heading:          {fontSize:24,fontWeight:'800',color:'#eef0f4'},
  sub:              {fontSize:12,color:'#6e7a8a',marginTop:1},
  inviteBtn:        {flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'#00c896',paddingHorizontal:14,paddingVertical:8,borderRadius:9},
  inviteBtnText:    {color:'#000',fontWeight:'700',fontSize:13},
  searchBar:        {flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:12,marginHorizontal:16,marginBottom:12},
  searchInput:      {flex:1,color:'#eef0f4',fontSize:14,padding:0},
  tabRow:           {flexDirection:'row',paddingHorizontal:16,gap:8,marginBottom:8},
  tab:              {flex:1,backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:10,alignItems:'center',flexDirection:'row',justifyContent:'center',gap:6},
  tabActive:        {borderColor:'#00c896',backgroundColor:'rgba(0,200,150,.08)'},
  tabText:          {fontSize:11,color:'#6e7a8a',fontWeight:'600'},
  tabTextActive:    {color:'#00c896'},
  tabCount:         {backgroundColor:'#0f1218',borderRadius:99,minWidth:18,height:18,paddingHorizontal:5,alignItems:'center',justifyContent:'center'},
  tabCountText:     {fontSize:10,fontWeight:'700',color:'#6e7a8a'},
  list:             {padding:16,gap:10},
  emptyWrap:        {alignItems:'center',paddingTop:60,gap:14},
  emptyText:        {fontSize:15,fontWeight:'600',color:'#6e7a8a'},
  emptyInviteBtn:   {backgroundColor:'#00c896',paddingHorizontal:20,paddingVertical:10,borderRadius:9},
  emptyInviteText:  {color:'#000',fontWeight:'700',fontSize:13},
  memberCard:       {backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',gap:12},
  avatar:           {width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
  avatarText:       {fontSize:15,fontWeight:'800'},
  memberInfo:       {flex:1},
  memberName:       {fontSize:14,fontWeight:'700',color:'#eef0f4'},
  memberEmail:      {fontSize:12,color:'#6e7a8a',marginTop:2},
  memberVenue:      {fontSize:11,color:'#3a4252',marginTop:2},
  removeBtn:        {backgroundColor:'rgba(242,78,110,.1)',borderWidth:1,borderColor:'rgba(242,78,110,.3)',borderRadius:8,paddingHorizontal:10,paddingVertical:6},
  removeBtnText:    {color:'#f24e6e',fontSize:11,fontWeight:'700'},
  modalOverlay:     {flex:1,justifyContent:'flex-end'},
  modalBox:         {backgroundColor:'#0f1218',borderTopLeftRadius:20,borderTopRightRadius:20,padding:24,maxHeight:'90%'},
  modalHeader:      {flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16},
  modalTitle:       {fontSize:18,fontWeight:'800',color:'#eef0f4'},
  modalClose:       {fontSize:18,color:'#6e7a8a',padding:4},
  fieldLabel:       {fontSize:11,fontWeight:'600',color:'#6e7a8a',letterSpacing:.5,marginBottom:8},
  roleRow:          {flexDirection:'row',gap:8,marginBottom:16},
  roleOpt:          {flex:1,backgroundColor:'#161b24',borderWidth:1.5,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:10,alignItems:'center'},
  roleOptActive:    {borderColor:'#00c896',backgroundColor:'rgba(0,200,150,.08)'},
  roleOptText:      {fontSize:11,color:'#6e7a8a',fontWeight:'600',textAlign:'center'},
  roleOptTextActive:{color:'#00c896'},
  venueList:        {gap:8,marginBottom:16},
  venueOpt:         {backgroundColor:'#161b24',borderWidth:1.5,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  venueOptActive:   {borderColor:'#00c896',backgroundColor:'rgba(0,200,150,.08)'},
  venueOptText:     {fontSize:13,color:'#6e7a8a',fontWeight:'500'},
  venueOptTextActive:{color:'#00c896',fontWeight:'700'},
  input:            {backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:13,color:'#eef0f4',fontSize:14,marginBottom:14},
  twoBtn:           {flexDirection:'row',gap:12},
  cancelBtn:        {flex:1,backgroundColor:'transparent',borderWidth:1,borderColor:'rgba(255,255,255,.1)',borderRadius:10,padding:13,alignItems:'center'},
  cancelBtnText:    {color:'#6e7a8a',fontWeight:'600'},
  sendBtn:          {flex:1,backgroundColor:'#00c896',borderRadius:10,padding:13,alignItems:'center'},
  sendBtnText:      {color:'#000',fontWeight:'700',fontSize:14},
});