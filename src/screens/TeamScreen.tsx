import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, RefreshControl } from 'react-native';
import { supabase } from '../config/supabase';
import { getVenueTeamMembers, inviteTeamMember, removeTeamMember } from '../config/teamApi';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/tokens';
import EmptyState from '../components/ui/EmptyState';
import AIInsightCard from '../components/ui/AIInsightCard';

type Member = { id:string; uid?:string; name:string; email:string; role:string; venue:string; venues?:string[]; };
type Venue  = { id:string; name:string; ownerId?:string; assignedUids?:string[]; };
type TabType = 'manager'|'cleaner'|'staff';

const ROLE_COLOR: Record<string,string> = { owner: Colors.amber, manager: Colors.blue, cleaner: Colors.brand, staff: '#a855f7' };
const ROLE_LABEL: Record<string,string> = { owner:'Owner', manager:'Site Manager', cleaner:'Cleaner', staff:'Staff' };
const TABS: {key:TabType;label:string}[] = [{key:'manager',label:'Managers'},{key:'cleaner',label:'Cleaners'},{key:'staff',label:'Staff'}];

export default function TeamScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [members, setMembers] = useState<Member[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('manager');
  const [search, setSearch] = useState('');
  const [modalOpen, setModal] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TabType>('manager');
  const [venueId, setVenueId] = useState('');
  const [venueSearch, setVenueSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchAllMembers = async (venueList: Venue[]) => {
    try {
      const results = await Promise.all(venueList.map(v => getVenueTeamMembers(v.id).catch(() => [])));
      const all = results.flat();
      const unique = Array.from(new Map(all.map((m: any) => [m.id, m])).values());
      setMembers(unique as Member[]);
    } catch (e) { console.log(e); }
  };

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const { data: allVenues, error } = await supabase.from('venues').select('*');
      let vList: Venue[] = [];
      if (!error && allVenues && allVenues.length>0) vList = allVenues as Venue[];
      else {
        if (user.role==='owner') {
          const { data } = await supabase.from('venues').select('*').eq('ownerId', user.uid);
          vList = (data||[]) as Venue[];
        } else {
          const { data } = await supabase.from('venues').select('*').contains('assignedUids',[user.uid]);
          vList = (data||[]) as Venue[];
          if (vList.length===0){ const {data:fb}=await supabase.from('venues').select('*'); vList=(fb||[]) as Venue[]; }
        }
      }
      setVenues(vList);
      if (vList.length>0 && !venueId) setVenueId(vList[0].id);
      await fetchAllMembers(vList);
    } catch (e){ console.log(e); } finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };
  useEffect(()=>{ fetchData(); const ch=supabase.channel('team_os').on('postgres_changes',{event:'*',schema:'public',table:'venues'},fetchData).subscribe(); return ()=>{supabase.removeChannel(ch);}; },[fetchData]);

  const openInvite = () => { setRole(activeTab); setName(''); setEmail(''); setVenueSearch(''); setModal(true); };
  const inviteMember = async () => {
    if (!name||!email){ Alert.alert('Missing','Enter name and email.'); return; }
    const venueName = venues.find(v=>v.id===venueId)?.name||'';
    if (!venueName){ Alert.alert('Missing','Select a venue.'); return; }
    setInviting(true);
    try {
      const result = await inviteTeamMember({ email, name, role, venueId });
      setModal(false); setName(''); setEmail('');
      Alert.alert('Done', result.existed? `${name} assigned to ${venueName}.` : `${name} will receive invite email.`);
      await fetchData();
    } catch (err:any){ Alert.alert('Error', err.message||'Failed to invite'); } finally { setInviting(false); }
  };
  const removeMember = (m:Member, fromVenueName?:string, fromVenueId?:string) => {
    const targetVenue = fromVenueName||m.venue;
    Alert.alert('Remove Member',`Remove ${m.name} from ${targetVenue}?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Remove',style:'destructive',onPress:async()=>{
        setRemoving(true);
        try{
          const docId = m.uid||m.id;
          let venueForRemoval = fromVenueId? venues.find(v=>v.id===fromVenueId): undefined;
          if (!venueForRemoval) venueForRemoval = venues.find(v=>v.name===targetVenue)||venues.find(v=>v.id===targetVenue);
          if (!venueForRemoval) throw new Error('Venue not found. Refresh.');
          await removeTeamMember({ targetUid: docId, venueId: venueForRemoval.id });
          await fetchData();
        }catch(e:any){ Alert.alert('Error', e.message||'Failed'); } finally { setRemoving(false); }
      }},
    ]);
  };

  const getInitials = (n:string)=> n?.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?';
  const myVenueNames = venues.map(v=>v.name);
  const shown = members.filter(m=>m.role===activeTab).filter(m=> !search || m.name.toLowerCase().includes(search.toLowerCase())||m.email.toLowerCase().includes(search.toLowerCase()));
  const counts = { manager: members.filter(m=>m.role==='manager').length, cleaner: members.filter(m=>m.role==='cleaner').length, staff: members.filter(m=>m.role==='staff').length };

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator color={Colors.brand} style={{marginTop:120}}/></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={()=>navigation.goBack()}><Ionicons name="arrow-back" size={20} color={Colors.text}/></TouchableOpacity>
        <View style={{flex:1}}>
          <Text style={s.heading}>Team OS</Text>
          <Text style={s.sub}>{members.filter(m=>m.role!=='owner').length} active • {venues.length} venues • Owner view</Text>
        </View>
        <TouchableOpacity style={s.inviteBtn} onPress={openInvite}><Ionicons name="add" size={18} color={Colors.black}/><Text style={s.inviteText}>Invite</Text></TouchableOpacity>
      </View>

      <View style={s.commandRow}>
        <View style={s.commandCard}>
          <Text style={s.cmdLabel}>STAFFING HEALTH</Text>
          <Text style={s.cmdVal}>{counts.manager}M • {counts.cleaner}C • {counts.staff}S</Text>
          <Text style={s.cmdSub}>Across {venues.length} venues</Text>
        </View>
        <View style={[s.commandCard,{backgroundColor: Colors.brandSoft, borderColor: Colors.brand+'30'}]}>
          <Text style={s.cmdLabel}>AI INSIGHT</Text>
          <Text style={[s.cmdVal,{color:Colors.brand}]}>{counts.cleaner===0?'Need cleaners':'Coverage OK'}</Text>
          <Text style={s.cmdSub}>{counts.cleaner===0?'Add cleaners to auto-assign daily tasks':'Team balanced'}</Text>
        </View>
      </View>

      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted}/>
        <TextInput style={s.searchInput} placeholder="Search team..." placeholderTextColor={Colors.textMuted} value={search} onChangeText={setSearch}/>
        {search.length>0&&<TouchableOpacity onPress={()=>setSearch('')}><Ionicons name="close-circle" size={16} color={Colors.textMuted}/></TouchableOpacity>}
      </View>

      <View style={s.tabs}>
        {TABS.map(t=>(
          <TouchableOpacity key={t.key} style={[s.tab, activeTab===t.key&&s.tabActive]} onPress={()=>{setActiveTab(t.key); setSearch('');}}>
            <Text style={[s.tabText, activeTab===t.key&&s.tabTextActive]}>{t.label}</Text>
            <View style={[s.countBadge, activeTab===t.key&&{backgroundColor: Colors.brand}]}><Text style={[s.countText, activeTab===t.key&&{color:Colors.black}]}>{t.key==='manager'?counts.manager:t.key==='cleaner'?counts.cleaner:counts.staff}</Text></View>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={shown}
        keyExtractor={i=>i.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}
        ListHeaderComponent={shown.length>0? <View style={{marginBottom:8}}><AIInsightCard title={activeTab==='manager'?'Managers control ops':activeTab==='cleaner'?'Cleaners own daily execution':'Staff are eyes on floor'} message={activeTab==='manager'?'Site managers can invite, assign tasks, and resolve issues. Keep at least 1 per venue.':activeTab==='cleaner'?'Cleaners get auto-reset daily tasks with photo proof. Track completion in real time.':'Staff raise issues from floor. No extra cost per user – $19.95 per venue only.'} type="info" /></View> : null}
        ListEmptyComponent={
          <EmptyState icon="people-outline" title={search?`No results for "${search}"`:`No ${ROLE_LABEL[activeTab]}s yet`} subtitle={search?'Try different name or email':'Invite your first team member – they get role-based access and venue assignment instantly.'} ctaLabel={!search?`Invite ${ROLE_LABEL[activeTab]}`:undefined} onCta={!search?openInvite:undefined} />
        }
        renderItem={({item:m})=>{
          const color = ROLE_COLOR[m.role]||Colors.textMuted;
          return (
            <View style={s.memberCard}>
              <View style={[s.avatar,{backgroundColor: color+'20', borderColor: color+'30'}]}><Text style={[s.avatarText,{color}]}>{getInitials(m.name)}</Text></View>
              <View style={{flex:1, gap:3}}>
                <View style={{flexDirection:'row', alignItems:'center', gap:6}}><Text style={s.name}>{m.name}</Text><View style={[s.roleChip,{backgroundColor: color+'18'}]}><Text style={[s.roleChipText,{color}]}>{ROLE_LABEL[m.role]||m.role}</Text></View></View>
                <Text style={s.email}>{m.email}</Text>
                <Text style={s.venue}>🏢 {m.venues?.filter(v=>myVenueNames.includes(v)).join(', ')||m.venue||'Unassigned'}</Text>
              </View>
              {m.email!==user?.email&&(
                <TouchableOpacity style={s.removeBtn} disabled={removing} onPress={()=>{
                  if (m.venues&&m.venues.length>1){
                    Alert.alert('Remove from which venue?', `${m.name} is in multiple venues`, [
                      ...m.venues.filter(v=>myVenueNames.includes(v)).map(vName=>{
                        const vObj = venues.find(v=>v.name===vName);
                        return { text: vName, onPress: ()=>removeMember(m, vName, vObj?.id) };
                      }),
                      {text:'Cancel',style:'cancel' as const},
                    ]);
                  } else removeMember(m, m.venue);
                }}><Text style={s.removeText}>Remove</Text></TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      <Modal visible={modalOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.modalHead}><Text style={s.modalTitle}>Invite {ROLE_LABEL[role]} • Premium OS</Text><TouchableOpacity onPress={()=>setModal(false)}><Ionicons name="close" size={20} color={Colors.textMuted}/></TouchableOpacity></View>
                <Text style={s.fieldLabel}>ROLE – Actionable intelligence per role</Text>
                <View style={s.roleRow}>
                  {TABS.map(t=>(
                    <TouchableOpacity key={t.key} style={[s.roleOpt, role===t.key&&s.roleOptActive]} onPress={()=>setRole(t.key)}>
                      <View style={[s.roleDot,{backgroundColor: ROLE_COLOR[t.key]}]} /><Text style={[s.roleOptText, role===t.key&&s.roleOptActiveText]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.fieldLabel}>ASSIGN TO VENUE – RLS secured</Text>
                <View style={s.searchBar}><Ionicons name="search-outline" size={14} color={Colors.textMuted}/><TextInput style={s.searchInput} placeholder="Search venues..." placeholderTextColor={Colors.textMuted} value={venueSearch} onChangeText={setVenueSearch}/></View>
                <View style={s.venueList}>
                  {venues.filter(v=>v.name.toLowerCase().includes(venueSearch.toLowerCase())).map(v=>(
                    <TouchableOpacity key={v.id} style={[s.venueOpt, venueId===v.id&&s.venueOptActive]} onPress={()=>setVenueId(v.id)}>
                      <View><Text style={[s.venueOptName, venueId===v.id&&{color:Colors.brand}]}>{v.name}</Text><Text style={s.venueOptSub}>Owner: {v.ownerId?.slice(0,6)} • {v.assignedUids?.length||0} team</Text></View>
                      {venueId===v.id&&<Ionicons name="checkmark-circle" size={20} color={Colors.brand}/>}
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.fieldLabel}>FULL NAME</Text>
                <TextInput style={s.input} placeholder="e.g. Priya Sharma" placeholderTextColor={Colors.textMuted} value={name} onChangeText={setName}/>
                <Text style={s.fieldLabel}>WORK EMAIL – Invite sent via secure Supabase</Text>
                <TextInput style={s.input} placeholder="priya@cleanpro.com.au" placeholderTextColor={Colors.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"/>
                <View style={s.securityNote}><Ionicons name="shield-checkmark-outline" size={14} color={Colors.brand}/><Text style={s.securityText}>RLS isolated • Invite link expires • Role enforced server-side</Text></View>
                <View style={s.twoBtn}>
                  <TouchableOpacity style={s.cancelBtn} onPress={()=>setModal(false)}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={s.sendBtn} onPress={inviteMember} disabled={inviting}>{inviting?<ActivityIndicator color={Colors.black}/>:<Text style={s.sendText}>Send Secure Invite →</Text>}</TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor: Colors.canvas},
  header:{flexDirection:'row',alignItems:'center',padding:16,gap:12, borderBottomWidth:1, borderBottomColor: Colors.border},
  backBtn:{width:36,height:36,backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius:10, alignItems:'center', justifyContent:'center'},
  heading:{fontSize:20,fontWeight:'900',color:Colors.text, letterSpacing:-0.4},
  sub:{fontSize:11,color:Colors.textMuted, marginTop:2},
  inviteBtn:{flexDirection:'row',alignItems:'center',gap:6, backgroundColor: Colors.brand, paddingHorizontal:14, paddingVertical:9, borderRadius:10},
  inviteText:{color:Colors.black, fontWeight:'800', fontSize:13},
  commandRow:{flexDirection:'row', gap:10, padding:12, paddingBottom:0},
  commandCard:{flex:1, backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius: Radius.lg, padding:12, gap:4},
  cmdLabel:{fontSize:9, fontWeight:'800', color: Colors.textMuted, letterSpacing:0.8, textTransform:'uppercase'},
  cmdVal:{fontSize:14, fontWeight:'800', color: Colors.text, marginTop:4},
  cmdSub:{fontSize:10, color: Colors.textMuted, marginTop:2},
  searchBar:{flexDirection:'row',alignItems:'center',gap:8, margin:12, backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius:12, padding:12},
  searchInput:{flex:1, color: Colors.text, fontSize:13},
  tabs:{flexDirection:'row', paddingHorizontal:12, gap:8, marginBottom:8},
  tab:{flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius:10, paddingVertical:10},
  tabActive:{borderColor: Colors.brand, backgroundColor: Colors.brandSoft},
  tabText:{fontSize:11, fontWeight:'600', color: Colors.textMuted},
  tabTextActive:{color: Colors.brand},
  countBadge:{backgroundColor: Colors.surfaceRaised, borderRadius:99, minWidth:18, height:18, paddingHorizontal:5, alignItems:'center', justifyContent:'center'},
  countText:{fontSize:10, fontWeight:'800', color: Colors.textMuted},
  list:{padding:12, gap:10, paddingBottom:40},
  memberCard:{flexDirection:'row', alignItems:'center', gap:12, backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius: Radius.lg, padding:14},
  avatar:{width:42,height:42,borderRadius:21, borderWidth:1, alignItems:'center', justifyContent:'center'},
  avatarText:{fontSize:13,fontWeight:'900'},
  name:{fontSize:13,fontWeight:'700',color:Colors.text},
  roleChip:{paddingHorizontal:6,paddingVertical:2,borderRadius:6},
  roleChipText:{fontSize:8,fontWeight:'800', textTransform:'uppercase', letterSpacing:0.5},
  email:{fontSize:11,color:Colors.textMuted},
  venue:{fontSize:10,color: Colors.textMuted, opacity:0.7},
  removeBtn:{backgroundColor: Colors.redSoft, borderWidth:1, borderColor: Colors.red+'30', borderRadius:8, paddingHorizontal:10, paddingVertical:6},
  removeText:{color: Colors.red, fontSize:10, fontWeight:'800'},
  modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.7)', justifyContent:'flex-end'},
  modalBox:{backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding:20, maxHeight:'90%', borderWidth:1, borderColor: Colors.border},
  modalHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center', marginBottom:16},
  modalTitle:{fontSize:16,fontWeight:'900',color:Colors.text},
  fieldLabel:{fontSize:10,fontWeight:'800',color:Colors.textMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:8, marginTop:10},
  roleRow:{flexDirection:'row',gap:8, marginBottom:4},
  roleOpt:{flex:1,flexDirection:'row', alignItems:'center', gap:6, backgroundColor: Colors.surfaceRaised, borderWidth:1.5, borderColor: Colors.border, borderRadius:10, padding:10},
  roleOptActive:{borderColor: Colors.brand, backgroundColor: Colors.brandSoft},
  roleDot:{width:8,height:8,borderRadius:4},
  roleOptText:{fontSize:11,fontWeight:'600',color:Colors.textMuted},
  roleOptActiveText:{color: Colors.brand},
  venueList:{gap:8, maxHeight:160, marginBottom:8},
  venueOpt:{flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor: Colors.surfaceRaised, borderWidth:1, borderColor: Colors.border, borderRadius:10, padding:12},
  venueOptActive:{borderColor: Colors.brand, backgroundColor: Colors.brandSoft},
  venueOptName:{fontSize:12,fontWeight:'600',color:Colors.text},
  venueOptSub:{fontSize:10,color:Colors.textMuted, marginTop:2},
  input:{backgroundColor: Colors.surfaceRaised, borderWidth:1, borderColor: Colors.border, borderRadius:10, padding:12, color: Colors.text, fontSize:13},
  securityNote:{flexDirection:'row', alignItems:'center', gap:6, marginTop:12, backgroundColor: Colors.brandSoft, borderWidth:1, borderColor: Colors.brand+'20', borderRadius:8, padding:10},
  securityText:{fontSize:10,color: Colors.brand, fontWeight:'600', flex:1},
  twoBtn:{flexDirection:'row', gap:10, marginTop:16},
  cancelBtn:{flex:1, backgroundColor:'transparent', borderWidth:1, borderColor: Colors.border, borderRadius:10, padding:13, alignItems:'center'},
  cancelText:{color: Colors.textMuted, fontWeight:'700'},
  sendBtn:{flex:1, backgroundColor: Colors.brand, borderRadius:10, padding:13, alignItems:'center'},
  sendText:{color: Colors.black, fontWeight:'800', fontSize:13},
});
