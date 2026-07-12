import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RefreshControl } from 'react-native';

const INVITE_URL = 'https://us-central1-venuev-b24c2.cloudfunctions.net/inviteTeamMember';
const REMOVE_URL = 'https://us-central1-venuev-b24c2.cloudfunctions.net/removeTeamMember';
const TEAM_URL   = 'https://us-central1-venuev-b24c2.cloudfunctions.net/getVenueTeamMembers';

type Member = { id:string; uid?:string; name:string; email:string; role:string; venue:string; venues?:string[]; };
type Venue  = { id:string; name:string; ownerId?:string; assignedUids?:string[]; };
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
  const [removing,  setRemoving]  = useState(false);
  const [name,      setName]      = useState('');
  const [email,     setEmail]     = useState('');
  const [role,      setRole]      = useState<TabType>('manager');
  const [venueId,   setVenueId]   = useState('');
  const [venueSearch, setVenueSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchAllMembers = async (venueList: Venue[]) => {
    try {
      const results = await Promise.all(
        venueList.map(v =>
          fetch(TEAM_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callerUid: user?.uid, venueId: v.id }),
          }).then(r => r.json()).catch(() => ({ members: [] }))
        )
      );
      const allMembers = results.flatMap(r => r.members || []);
      const unique = Array.from(new Map(allMembers.map((m: any) => [m.id, m])).values());
      setMembers(unique as Member[]);
    } catch (err) {
      console.log('fetchAllMembers error:', err);
    }
  };

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      let vList: Venue[] = [];
      if (user.role === 'owner') {
        const { data } = await supabase.from('venues').select('*').eq('ownerId', user.uid);
        vList = (data || []) as Venue[];
      } else {
        const { data } = await supabase.from('venues').select('*').contains('assignedUids', [user.uid]);
        vList = (data || []) as Venue[];
      }
      
      setVenues(vList);
      if (vList.length > 0 && !venueId) setVenueId(vList[0].id);

      await fetchAllMembers(vList);
    } catch (err) {
      console.log('Error fetching team data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('team_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const openInvite = () => {
    setRole(activeTab); setName(''); setEmail(''); setVenueSearch('');
    setModal(true);
  };

  const inviteMember = async () => {
    if (!name||!email) { Alert.alert('Missing','Enter name and email.'); return; }
    const venueName = venues.find(v=>v.id===venueId)?.name || '';
    if (!venueName) { Alert.alert('Missing','Select a venue.'); return; }

    setInviting(true);
    try {
      const resp = await fetch(INVITE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, name, role, venue: venueName,
          callerUid: user?.uid,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Failed to invite');

      setModal(false); setName(''); setEmail('');
      Alert.alert(
        'Done',
        result.existed
          ? `${name} has been assigned to ${venueName}.`
          : `${name} will receive an email with login details.`
      );
      await fetchAllMembers(venues);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to invite team member.');
    }
    setInviting(false);
  };

  const removeMember = (m:Member, fromVenueName?: string) => {
    const targetVenue = fromVenueName || m.venue;
    Alert.alert('Remove Member',`Remove ${m.name} from ${targetVenue}?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Remove',style:'destructive',onPress:async()=>{
        setRemoving(true);
        try {
          const docId = m.uid || m.id;
          const resp = await fetch(REMOVE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetUid: docId,
              venueName: targetVenue,
              callerUid: user?.uid,
            }),
          });
          const result = await resp.json();
          if (!resp.ok) throw new Error(result.error || 'Failed to remove');
          await fetchAllMembers(venues);
        } catch (err: any) {
          Alert.alert('Error', err.message || 'Failed to remove team member.');
        }
        setRemoving(false);
      }},
    ]);
  };

  const getInitials = (n:string) =>
    n?.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?';

  const myVenueNames = venues.map(v => v.name);

  const shown = members
    .filter(m => m.role === activeTab)
    .filter(m=>
      search.trim()==='' ||
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()) ||
      m.venue?.toLowerCase().includes(search.toLowerCase())
    );

  const memberCountInScope = members.filter(m=>m.role!=='owner').length;

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
          <Text style={s.sub}>{memberCountInScope} members</Text>
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
                <Text style={[s.avatarText,{color:color}]}>{getInitials(m.name)}</Text>
              </View>
              <View style={s.memberInfo}>
                <Text style={s.memberName}>{m.name}</Text>
                <Text style={s.memberEmail}>{m.email}</Text>
                {m.venues && m.venues.length > 0 ? (
                  <Text style={s.memberVenue}>🏢 {m.venues.filter(v=>myVenueNames.includes(v)).join(', ') || m.venues.join(', ')}</Text>
                ) : (
                  <Text style={s.memberVenue}>🏢 {m.venue}</Text>
                )}
              </View>
              {m.email !== user?.email && (
                <TouchableOpacity style={s.removeBtn} disabled={removing} onPress={()=>{
                  if (m.venues && m.venues.length > 1) {
                    Alert.alert(
                      'Remove from which venue?',
                      `${m.name} is assigned to multiple venues.`,
                      [
                        ...m.venues.filter(v => myVenueNames.includes(v)).map(vName => ({
                          text: vName,
                          onPress: () => removeMember(m, vName),
                        })),
                        {text:'Cancel', style:'cancel' as const},
                      ]
                    );
                  } else {
                    removeMember(m, m.venue);
                  }
                }}>
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
                <View style={s.venueSearchBar}>
                  <Ionicons name="search-outline" color="#6e7a8a" size={16}/>
                  <TextInput
                    style={s.venueSearchInput}
                    placeholder="Search venues..."
                    placeholderTextColor="#6e7a8a"
                    value={venueSearch}
                    onChangeText={setVenueSearch}
                  />
                  {venueSearch.length>0&&(
                    <TouchableOpacity onPress={()=>setVenueSearch('')}>
                      <Ionicons name="close-circle" color="#6e7a8a" size={16}/>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={s.venueList}>
                  {venues
                    .filter(v=>v.name.toLowerCase().includes(venueSearch.toLowerCase()))
                    .map(v=>(
                    <TouchableOpacity key={v.id}
                      style={[s.venueOpt,venueId===v.id&&s.venueOptActive]}
                      onPress={()=>setVenueId(v.id)}>
                      <Text style={[s.venueOptText,venueId===v.id&&s.venueOptTextActive]}>{v.name}</Text>
                      {venueId===v.id&&<Ionicons name="checkmark" color="#00c896" size={16}/>}
                    </TouchableOpacity>
                  ))}
                  {venues.filter(v=>v.name.toLowerCase().includes(venueSearch.toLowerCase())).length===0&&(
                    <Text style={{fontSize:12,color:'#6e7a8a',textAlign:'center',padding:12}}>No venues match "{venueSearch}"</Text>
                  )}
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
  venueSearchBar:   {flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:10,marginBottom:10},
  venueSearchInput: {flex:1,color:'#eef0f4',fontSize:13,padding:0},
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