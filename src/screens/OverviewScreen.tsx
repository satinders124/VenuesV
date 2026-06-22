import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Modal, ActivityIndicator, TextInput,
  Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import {
  collection, onSnapshot, updateDoc, deleteDoc,
  doc, addDoc, serverTimestamp, getDocs, query, where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { safeOnSnapshot } from '../config/firestoreHelpers';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RefreshControl } from 'react-native';

const INVITE_URL = 'https://us-central1-venuev-b24c2.cloudfunctions.net/inviteTeamMember';
const REMOVE_URL = 'https://us-central1-venuev-b24c2.cloudfunctions.net/removeTeamMember';
const TEAM_URL   = 'https://us-central1-venuev-b24c2.cloudfunctions.net/getVenueTeamMembers';

type Venue  = { id:string; name:string; suburb:string; score:number; ownerId?:string; assignedUids?:string[]; };
type Task   = { id:string; done:boolean; venueId:string; };
type Issue  = { id:string; status:string; priority:string; venueId:string; };
type Zone   = { id:string; name:string; icon:string; status:string; venueId:string; };
type Member = { id:string; uid?:string; name:string; role:string; email:string; venue:string; venues?:string[]; };


const VENUE_HEALTH = (score:number, issues:number) => {
  if (issues === 0) return {label:'🟢 Good',       color:'#00c896'};
  if (issues <= 2)  return {label:'🟡 Attention',  color:'#f5a623'};
  return                   {label:'🔴 Needs Help', color:'#f24e6e'};
};

const ZONE_COLOR: Record<string,string> = {
  clean:'#00c896', attention:'#f5a623', working:'#2c7ef7', issue:'#f24e6e'
};

const ICONS = ['🍺','🌿','🚻','🚹','🎰','🚗','🍽️','🏨','☕','🎵','🚪','🏊','🎭','📍','🏢','🧹'];


const ROLE_CONFIG: Record<string,{color:string;label:string}> = {
  owner:   {color:'#f5a623', label:'Owner'},
  manager: {color:'#2c7ef7', label:'Manager'},
  cleaner: {color:'#00c896', label:'Cleaner'},
  staff:   {color:'#a855f7', label:'Staff'},
};

const INVITE_ROLES = [
  {id:'manager', label:'Site Manager'},
  {id:'cleaner', label:'Cleaner'},
  {id:'staff',   label:'Venue Staff'},
];

export default function OverviewScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [venues,  setVenues]  = useState<Venue[]>([]);
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [issues,  setIssues]  = useState<Issue[]>([]);
  const [zones,   setZones]   = useState<Zone[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [selVenue,  setSelVenue]  = useState<Venue|null>(null);
  const [activeTab, setActiveTab] = useState<'details'|'zones'|'team'>('details');

  const [editName,      setEditName]      = useState('');
  const [editSuburb,    setEditSuburb]    = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  const [addingZone,   setAddingZone]   = useState(false);
  const [newZoneName,  setNewZoneName]  = useState('');
  const [newZoneIcon,  setNewZoneIcon]  = useState('📍');
  const [editZone,     setEditZone]     = useState<Zone|null>(null);
  const [editZoneName, setEditZoneName] = useState('');
  const [editZoneIcon, setEditZoneIcon] = useState('📍');
  const [savingZone,   setSavingZone]   = useState(false);

  const [inviteName,  setInviteName]  = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole,  setInviteRole]  = useState('cleaner');
  const [inviting,    setInviting]    = useState(false);

  const [memberSearch,    setMemberSearch]    = useState('');
  const [selectedMember,  setSelectedMember]  = useState<Member|null>(null);

  // Team members fetched via Cloud Function — Firestore can't structurally
  // verify "do we share a venue" for a client-side users query.
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

  const onRefresh = async () => {
    setRefreshing(true);
    if (venues.length > 0) await fetchAllMembers(venues);
    setTimeout(() => setRefreshing(false), 1000);
  };

  // ── Scoped venues query + cascading tasks/issues/zones ──
  useEffect(() => {
    if (!user) return;

    const venuesQuery = user.role === 'owner'
      ? query(collection(db, 'venues'), where('ownerId', '==', user.uid))
      : query(collection(db, 'venues'), where('assignedUids', 'array-contains', user.uid));

    let unsubTasks: (() => void) | null = null;
    let unsubIssues: (() => void) | null = null;
    let unsubZones: (() => void) | null = null;

    const u1 = safeOnSnapshot(venuesQuery, s => {
      const venueList = s.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Venue[];
      setVenues(venueList);
      setLoading(false);

      setSelVenue(prev => {
        if (!prev) return prev;
        const updated = venueList.find(v => v.id === prev.id);
        return updated || prev;
      });

      const venueIds = venueList.map(v => v.id).slice(0, 30);

      if (unsubTasks) unsubTasks();
      if (unsubIssues) unsubIssues();
      if (unsubZones) unsubZones();

      if (venueIds.length > 0) {
        unsubTasks = safeOnSnapshot(
          query(collection(db, 'tasks'), where('venueId', 'in', venueIds)),
          s2 => setTasks(s2.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Task[])
        );
        unsubIssues = safeOnSnapshot(
          query(collection(db, 'issues'), where('venueId', 'in', venueIds)),
          s3 => setIssues(s3.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Issue[])
        );
        unsubZones = safeOnSnapshot(
          query(collection(db, 'zones'), where('venueId', 'in', venueIds)),
          s4 => setZones(s4.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Zone[])
        );
      } else {
        setTasks([]); setIssues([]); setZones([]);
      }

      fetchAllMembers(venueList);
    });

    return () => {
      u1();
      if (unsubTasks) unsubTasks();
      if (unsubIssues) unsubIssues();
      if (unsubZones) unsubZones();
    };
  }, [user]);

  const vStats = (v:Venue) => {
    const vT = tasks.filter(t=>t.venueId===v.id);
    const vI = issues.filter(i=>i.venueId===v.id&&i.status!=='resolved');
    const pct = vT.length?Math.round((vT.filter(t=>t.done).length/vT.length)*100):0;
    return {pct, issues:vI.length, highIssues:vI.filter(i=>i.priority==='high').length};
  };

  const openVenue = (v:Venue) => {
    setSelVenue(v);
    setEditName(v.name);
    setEditSuburb(v.suburb);
    setActiveTab('details');
    setAddingZone(false);
    setEditZone(null);
  };

  const saveDetails = async () => {
    if (!editName||!editSuburb) {Alert.alert('Missing','Please fill all fields.');return;}
    setSavingDetails(true);
    await updateDoc(doc(db,'venues',selVenue!.id),{name:editName,suburb:editSuburb});
    setSelVenue(p=>p?{...p,name:editName,suburb:editSuburb}:null);
    setSavingDetails(false);
    Alert.alert('✅','Venue updated!');
  };

  const addZone = async () => {
    if (!newZoneName) {Alert.alert('Missing','Enter zone name.');return;}
    setSavingZone(true);
    await addDoc(collection(db,'zones'),{name:newZoneName,icon:newZoneIcon,status:'clean',score:100,venueId:selVenue!.id,createdAt:serverTimestamp()});
    setNewZoneName('');setNewZoneIcon('📍');setAddingZone(false);
    setSavingZone(false);
  };

  const saveZone = async () => {
    if (!editZoneName) return;
    setSavingZone(true);
    await updateDoc(doc(db,'zones',editZone!.id),{name:editZoneName,icon:editZoneIcon});
    setEditZone(null);
    setSavingZone(false);
  };

  const deleteZone = (z:Zone) => {
    Alert.alert('Delete Zone',`Delete "${z.name}"?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress:async()=>await deleteDoc(doc(db,'zones',z.id))},
    ]);
  };

  const removeMember = (m:Member) => {
    Alert.alert('Remove Member',`Remove ${m.name} from ${selVenue?.name}?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Remove',style:'destructive',onPress:async()=>{
        try {
          const docId = m.uid || m.id;
          const resp = await fetch(REMOVE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetUid: docId,
              venueName: selVenue?.name,
              callerUid: user?.uid,
            }),
          });
          const result = await resp.json();
          if (!resp.ok) throw new Error(result.error || 'Failed to remove');
          await fetchAllMembers(venues);
        } catch (err: any) {
          Alert.alert('Error', err.message || 'Failed to remove team member.');
        }
      }},
    ]);
  };

  // ── INVITE — calls the inviteTeamMember Cloud Function. ──
  const inviteMember = async () => {
    if (!inviteName||!inviteEmail) {Alert.alert('Missing','Enter name and email.');return;}
    if (!selVenue) {Alert.alert('Missing','No venue selected.');return;}
    setInviting(true);
    try {
      const resp = await fetch(INVITE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          role: inviteRole,
          venue: selVenue.name,
          callerUid: user?.uid,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Failed to invite');

      setInviteName(''); setInviteEmail(''); setInviteRole('cleaner');
      Alert.alert(
        'Done',
        result.existed
          ? `${inviteName} has been assigned to ${selVenue.name}.`
          : `${inviteName} will receive an email with login details.`
      );
      await fetchAllMembers(venues);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to invite team member.');
    }
    setInviting(false);
  };

  const myVenueIds  = venues.map(v=>v.id);
  const allIssues   = issues.filter(i=>i.status!=='resolved'&&myVenueIds.includes(i.venueId)).length;
  const allHigh     = issues.filter(i=>i.status!=='resolved'&&i.priority==='high'&&myVenueIds.includes(i.venueId)).length;
  const avgScore    = venues.length?Math.round(venues.reduce((a,v)=>a+(v.score||0),0)/venues.length):0;

  const isOwnerOrManager = user?.role==='owner'||user?.role==='manager';

  const filteredVenues = venues.filter(v=>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.suburb.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <SafeAreaView style={s.container}>
      <ActivityIndicator color="#00c896" style={{marginTop:100}}/>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00c896"
            colors={['#00c896']}
          />
        }
      >

        {/* Header with sites badge top right */}
        <View style={s.header}>
          <View>
            <Text style={s.heading}>Venue Health</Text>
            <Text style={s.sub}>
              {user?.role==='manager' ? user?.venue : 'All venues overview'}
            </Text>
          </View>
          {user?.role==='owner' && (
            <View style={s.sitesBadge}>
              <Text style={s.sitesBadgeNum}>{venues.length}</Text>
              <Text style={s.sitesBadgeLabel}>Sites</Text>
            </View>
          )}
        </View>

        {/* Search */}
        <View style={s.searchBar}>
          <Ionicons name="search-outline" color="#6e7a8a" size={18}/>
          <TextInput
            style={s.searchInput}
            placeholder="Search venues..."
            placeholderTextColor="#6e7a8a"
            value={search}
            onChangeText={setSearch}
          />
          {search.length>0&&(
            <TouchableOpacity onPress={()=>setSearch('')}>
              <Ionicons name="close-circle" color="#6e7a8a" size={18}/>
            </TouchableOpacity>
          )}
        </View>

        {/* Summary bar */}
        <View style={s.summaryBar}>
          {[
            ['Avg Score', avgScore+'%',  '#00c896'],
            ['Open Issues', ''+allIssues, allIssues>0?'#f24e6e':'#00c896'],
            ['High Priority', ''+allHigh,  allHigh>0?'#f24e6e':'#00c896'],
          ].map(([l,v,c],i)=>(
            <React.Fragment key={l}>
              {i>0&&<View style={s.divider}/>}
              <View style={s.summaryItem}>
                <Text style={[s.summaryVal,{color:c}]}>{v}</Text>
                <Text style={s.summaryLabel}>{l}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Venue cards */}
        {filteredVenues.map(v=>{
          const st     = vStats(v);
          const health = VENUE_HEALTH(v.score||0,st.issues);
          const scoreColor = (v.score||0)>=85?'#00c896':(v.score||0)>=70?'#f5a623':'#f24e6e';
          return (
            <View key={v.id} style={[s.venueCard,{borderLeftColor:health.color}]}>
              <View style={s.venueTop}>
                <View style={s.venueLeft}>
                  <Text style={s.venueName}>{v.name}</Text>
                  <Text style={s.venueSuburb}>📍 {v.suburb}</Text>
                </View>
                <View style={[s.healthBadge,{backgroundColor:health.color+'22',borderColor:health.color+'44'}]}>
                  <Text style={[s.healthText,{color:health.color}]}>{health.label}</Text>
                </View>
              </View>

              <View style={s.metricsRow}>
                {[
                  [`${v.score||0}%`, 'Inspection', scoreColor],
                  [`${st.issues}`,   'Open Issues', st.issues===0?'#00c896':st.highIssues>0?'#f24e6e':'#f5a623'],
                  [`${members.filter(m=>m.venue===v.name||(m.venues&&m.venues.includes(v.name))).length}`, 'Staff', '#2c7ef7'],
                ].map(([val,label,color])=>(
                  <View key={label} style={s.metric}>
                    <Text style={[s.metricVal,{color}]}>{val}</Text>
                    <Text style={s.metricLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              {st.highIssues>0&&(
                <TouchableOpacity
                  style={s.warningBanner}
                  onPress={()=>navigation.navigate('Issues')}
                >
                  <Ionicons name="warning-outline" color="#f24e6e" size={14}/>
                  <Text style={s.warningText}>
                    {st.highIssues} high priority issue{st.highIssues>1?'s':''} — tap to view
                  </Text>
                  <Ionicons name="chevron-forward" color="#f24e6e" size={14}/>
                </TouchableOpacity>
              )}

              {isOwnerOrManager&&(
                <TouchableOpacity style={s.manageBtn} onPress={()=>openVenue(v)}>
                  <Text style={s.manageBtnText}>Manage Venue →</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {venues.length===0&&(
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>No venues yet</Text>
            <Text style={s.emptySub}>Add venues from More menu</Text>
          </View>
        )}

      </ScrollView>

      {/* Venue Management Modal */}
      <Modal visible={!!selVenue} transparent animationType="slide">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.mgmtOverlay}>
            <View style={s.mgmtBox}>

              <View style={s.mgmtHeader}>
                <View style={{flex:1}}>
                  <Text style={s.mgmtTitle}>{selVenue?.name}</Text>
                  <Text style={s.mgmtSub}>📍 {selVenue?.suburb}</Text>
                </View>
                <TouchableOpacity onPress={()=>{setSelVenue(null);setEditZone(null);setAddingZone(false);}}>
                  <Text style={s.mgmtClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={s.tabRow}>
                {(['details','zones','team'] as const).map(t=>(
                  <TouchableOpacity key={t} style={[s.tab,activeTab===t&&s.tabActive]} onPress={()=>{setActiveTab(t);setEditZone(null);setAddingZone(false);}}>
                    <Text style={[s.tabText,activeTab===t&&s.tabTextActive]}>
                      {t==='details'?'Details':t==='zones'?'Zones':'Team'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                {/* DETAILS */}
                {activeTab==='details'&&(
                  <View style={s.tabContent}>
                    <Text style={s.fieldLabel}>VENUE NAME</Text>
                    <TextInput style={s.input} value={editName} onChangeText={setEditName} placeholder="Venue name" placeholderTextColor="#6e7a8a"/>
                    <Text style={s.fieldLabel}>SUBURB / LOCATION</Text>
                    <TextInput style={s.input} value={editSuburb} onChangeText={setEditSuburb} placeholder="e.g. Toowoomba QLD" placeholderTextColor="#6e7a8a"/>
                    <TouchableOpacity style={s.saveBtn} onPress={saveDetails} disabled={savingDetails}>
                      {savingDetails?<ActivityIndicator color="#000"/>:<Text style={s.saveBtnText}>Save Changes</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{backgroundColor:'rgba(242,78,110,.1)',borderWidth:1,borderColor:'rgba(242,78,110,.3)',borderRadius:10,padding:13,alignItems:'center',marginTop:8}}
                      onPress={()=>Alert.alert('Delete Venue',`Are you sure you want to delete ${selVenue?.name}? This cannot be undone.`,[
                        {text:'Cancel',style:'cancel'},
                        {text:'Delete',style:'destructive',onPress:async()=>{
                          const venueId = selVenue!.id;
                          const venueName = selVenue!.name;

                          const issuesSnap = await getDocs(query(collection(db,'issues'),where('venueId','==',venueId)));
                          await Promise.all(issuesSnap.docs.map((d: any) =>deleteDoc(doc(db,'issues',d.id))));

                          const tasksSnap = await getDocs(query(collection(db,'tasks'),where('venueId','==',venueId)));
                          await Promise.all(tasksSnap.docs.map((d: any) =>deleteDoc(doc(db,'tasks',d.id))));

                          const zonesSnap = await getDocs(query(collection(db,'zones'),where('venueId','==',venueId)));
                          await Promise.all(zonesSnap.docs.map((d: any) =>deleteDoc(doc(db,'zones',d.id))));

                          const usersSnap = await getDocs(query(collection(db,'users'),where('venue','==',venueName)));
                          await Promise.all(usersSnap.docs.map((d: any) =>updateDoc(doc(db,'users',d.id),{venue:''})));

                          await deleteDoc(doc(db,'venues',venueId));
                          setSelVenue(null);
                        }},
                      ])}
                    >
                      <Text style={{color:'#f24e6e',fontWeight:'700',fontSize:14}}>Delete Venue</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ZONES */}
                {activeTab==='zones'&&(
                  <View style={s.tabContent}>
                    {zones.filter(z=>z.venueId===selVenue?.id).map(z=>(
                      <View key={z.id} style={s.zoneRow}>
                        {editZone?.id===z.id?(
                          <View style={{flex:1,gap:6}}>
                            <TextInput style={[s.input,{marginBottom:6}]} value={editZoneName} onChangeText={setEditZoneName}/>
                            <View style={s.iconRow}>
                              {ICONS.map(ic=>(
                                <TouchableOpacity key={ic} style={[s.iconOpt,editZoneIcon===ic&&s.iconOptActive]} onPress={()=>setEditZoneIcon(ic)}>
                                  <Text style={s.iconTxt}>{ic}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <View style={s.twoBtn}>
                              <TouchableOpacity style={s.cancelSmBtn} onPress={()=>setEditZone(null)}>
                                <Text style={s.cancelSmText}>Cancel</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={s.saveSmBtn} onPress={saveZone} disabled={savingZone}>
                                {savingZone?<ActivityIndicator color="#000" size="small"/>:<Text style={s.saveSmText}>Save</Text>}
                              </TouchableOpacity>
                            </View>
                          </View>
                        ):(
                          <>
                            <Text style={s.zoneIcon}>{z.icon||'📍'}</Text>
                            <View style={s.zoneInfo}>
                              <Text style={s.zoneName}>{z.name}</Text>
                              <Text style={[s.zoneStatus,{color:ZONE_COLOR[z.status]||'#6e7a8a'}]}>
                                {z.status==='clean'?'Clean':z.status==='attention'?'Attention':z.status==='working'?'Working':'Issue'}
                              </Text>
                            </View>
                            <TouchableOpacity style={s.editActionBtn} onPress={()=>{setEditZone(z);setEditZoneName(z.name);setEditZoneIcon(z.icon);}}>
                              <Text style={s.editActionTxt}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.delActionBtn} onPress={()=>deleteZone(z)}>
                              <Text style={s.delActionTxt}>Delete</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    ))}

                    {zones.filter(z=>z.venueId===selVenue?.id).length===0&&(
                      <Text style={s.emptyText2}>No zones yet</Text>
                    )}

                    {addingZone?(
                      <View style={s.addZoneWrap}>
                        <Text style={s.fieldLabel}>ZONE NAME</Text>
                        <TextInput style={s.input} value={newZoneName} onChangeText={setNewZoneName} placeholder="e.g. Function Room" placeholderTextColor="#6e7a8a"/>
                        <Text style={s.fieldLabel}>ICON</Text>
                        <View style={s.iconRow}>
                          {ICONS.map(ic=>(
                            <TouchableOpacity key={ic} style={[s.iconOpt,newZoneIcon===ic&&s.iconOptActive]} onPress={()=>setNewZoneIcon(ic)}>
                              <Text style={s.iconTxt}>{ic}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={s.twoBtn}>
                          <TouchableOpacity style={s.cancelSmBtn} onPress={()=>setAddingZone(false)}>
                            <Text style={s.cancelSmText}>Cancel</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={s.saveSmBtn} onPress={addZone} disabled={savingZone}>
                            {savingZone?<ActivityIndicator color="#000" size="small"/>:<Text style={s.saveSmText}>Add Zone</Text>}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ):(
                      <TouchableOpacity style={s.addZoneBtn} onPress={()=>setAddingZone(true)}>
                        <Text style={s.addZoneBtnText}>＋ Add Zone</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* TEAM */}
                {activeTab==='team'&&(

                  <View style={s.tabContent}>
                    {members.filter(m=>
                      m.venue===selVenue?.name ||
                      (m.venues && m.venues.includes(selVenue?.name||''))
                    ).map((m,i,arr)=>{
                      const cfg = ROLE_CONFIG[m.role]||ROLE_CONFIG.staff;
                      return (
                        <View key={m.id} style={[s.memberRow,i<arr.length-1&&s.memberBorder]}>
                          <View style={[s.memberAv,{backgroundColor:cfg.color+'33'}]}>
                            <Text style={[s.memberIni,{color:cfg.color}]}>
                              {m.name?.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}
                            </Text>
                          </View>
                          <View style={s.memberInfo}>
                            <Text style={s.memberName}>{m.name}</Text>
                            <Text style={s.memberEmail}>{m.email}</Text>
                            <View style={[s.roleBadge,{backgroundColor:cfg.color+'22',alignSelf:'flex-start',marginTop:3}]}>
                              <Text style={[s.roleText,{color:cfg.color}]}>{cfg.label}</Text>
                            </View>
                          </View>
                          {m.role!=='owner'&&(
                            <TouchableOpacity style={s.removeBtn} onPress={()=>removeMember(m)}>
                              <Text style={s.removeBtnText}>Remove</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}

                    {members.filter(m=>
                      m.venue===selVenue?.name ||
                      (m.venues && m.venues.includes(selVenue?.name||''))
                    ).length===0&&(
                      <Text style={s.emptyText2}>No staff assigned yet</Text>
                    )}

                    <View style={s.inviteDivider}>
                      <Text style={s.inviteTitle}>Add Team Member</Text>
                    </View>

                    <Text style={s.fieldLabel}>ROLE</Text>
                    <View style={s.roleRow}>
                      {INVITE_ROLES.map(r=>(
                        <TouchableOpacity key={r.id} style={[s.roleOpt,inviteRole===r.id&&s.roleOptActive]} onPress={()=>setInviteRole(r.id)}>
                          <Text style={[s.roleOptText,inviteRole===r.id&&s.roleOptTextActive]}>{r.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Search existing users — now scoped to fetched members,
                        which are already limited to your accessible venues
                        (no cross-tenant search). */}
                    <Text style={s.fieldLabel}>SEARCH EXISTING MEMBERS</Text>
                    <View style={s.searchBarInline}>
                      <Text style={{fontSize:14,color:'#6e7a8a'}}>⌕</Text>
                      <TextInput
                        style={s.searchInputInline}
                        placeholder="Search by name or email..."
                        placeholderTextColor="#6e7a8a"
                        value={memberSearch}
                        onChangeText={setMemberSearch}
                      />
                      {memberSearch.length>0&&(
                        <TouchableOpacity onPress={()=>{setMemberSearch('');setSelectedMember(null);}}>
                          <Text style={{color:'#6e7a8a',fontSize:16}}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {memberSearch.length>1&&(
                      <View style={s.searchResults}>
                        {members
                          .filter(m=>
                            m.venue!==selVenue?.name &&
                            m.role!=='owner' &&
                            (m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
                             m.email?.toLowerCase().includes(memberSearch.toLowerCase()))
                          )
                          .slice(0,5)
                          .map(m=>{
                            const cfg = ROLE_CONFIG[m.role]||ROLE_CONFIG.staff;
                            const isSelected = selectedMember?.id===m.id;
                            return (
                              <TouchableOpacity key={m.id}
                                style={[s.searchResultItem, isSelected&&s.searchResultItemActive]}
                                onPress={()=>setSelectedMember(isSelected?null:m)}>
                                <View style={[s.memberAv,{backgroundColor:cfg.color+'33',width:32,height:32,borderRadius:16}]}>
                                  <Text style={[s.memberIni,{color:cfg.color,fontSize:11}]}>
                                    {m.name?.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}
                                  </Text>
                                </View>
                                <View style={{flex:1}}>
                                  <Text style={{fontSize:13,fontWeight:'600',color:'#eef0f4'}}>{m.name}</Text>
                                  <Text style={{fontSize:11,color:'#6e7a8a'}}>{m.email}</Text>
                                  {m.venue&&<Text style={{fontSize:10,color:'#3a4252'}}>Currently at {m.venue}</Text>}
                                </View>
                                {isSelected&&<Text style={{color:'#00c896',fontSize:16}}>✓</Text>}
                              </TouchableOpacity>
                            );
                          })
                        }
                        {members.filter(m=>
                          m.venue!==selVenue?.name &&
                          m.role!=='owner' &&
                          (m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
                           m.email?.toLowerCase().includes(memberSearch.toLowerCase()))
                        ).length===0&&(
                          <Text style={{fontSize:12,color:'#6e7a8a',padding:12,textAlign:'center'}}>
                            No existing members found — invite new below
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Add selected member — uses inviteTeamMember Cloud
                        Function so assignedUids stays in sync. */}
                    {selectedMember&&(
                      <TouchableOpacity style={s.saveBtn} onPress={async()=>{
                        setSavingDetails(true);
                        try {
                          const resp = await fetch(INVITE_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              email: selectedMember.email,
                              name: selectedMember.name,
                              role: inviteRole,
                              venue: selVenue!.name,
                              callerUid: user?.uid,
                            }),
                          });
                          const result = await resp.json();
                          if (!resp.ok) throw new Error(result.error || 'Failed');
                          setSelectedMember(null);
                          setMemberSearch('');
                          await fetchAllMembers(venues);
                          Alert.alert('Done',`${selectedMember.name} added to ${selVenue!.name}`);
                        } catch (err: any) {
                          Alert.alert('Error', err.message || 'Failed to add member.');
                        }
                        setSavingDetails(false);
                      }} disabled={savingDetails}>
                        {savingDetails
                          ?<ActivityIndicator color="#000"/>
                          :<Text style={s.saveBtnText}>Add {selectedMember.name} to {selVenue?.name}</Text>
                        }
                      </TouchableOpacity>
                    )}

                    <View style={{borderTopWidth:1,borderTopColor:'rgba(255,255,255,.07)',paddingTop:14,marginTop:8}}>
                      <Text style={[s.fieldLabel,{marginBottom:12}]}>OR INVITE NEW MEMBER</Text>
                    </View>

                    <Text style={s.fieldLabel}>FULL NAME</Text>
                    <TextInput style={s.input} value={inviteName} onChangeText={setInviteName} placeholder="e.g. Priya Sharma" placeholderTextColor="#6e7a8a"/>
                    <Text style={s.fieldLabel}>EMAIL</Text>
                    <TextInput style={s.input} value={inviteEmail} onChangeText={setInviteEmail} placeholder="priya@cleanpro.com.au" placeholderTextColor="#6e7a8a" keyboardType="email-address" autoCapitalize="none"/>

                    <TouchableOpacity style={s.inviteBtn} onPress={inviteMember} disabled={inviting}>
                      {inviting?<ActivityIndicator color="#000"/>:<Text style={s.inviteBtnText}>Send Invite</Text>}
                    </TouchableOpacity>
                  </View>
                )}

                <View style={{height:30}}/>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       {flex:1,backgroundColor:'#080a0e'},
  scroll:          {padding:20,gap:16},
  header:          {flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4},
  heading:         {fontSize:28,fontWeight:'800',color:'#eef0f4'},
  sub:             {fontSize:13,color:'#6e7a8a',marginTop:2},
  sitesBadge:      {backgroundColor:'#00c896',borderRadius:12,paddingHorizontal:14,paddingVertical:8,alignItems:'center',minWidth:60},
  sitesBadgeNum:   {fontSize:22,fontWeight:'900',color:'#000',lineHeight:26},
  sitesBadgeLabel: {fontSize:10,fontWeight:'700',color:'#000',marginTop:1},
  searchBar:       {flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:12},
  searchInput:     {flex:1,color:'#eef0f4',fontSize:14,padding:0},
  summaryBar:      {backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:16,padding:16,flexDirection:'row',alignItems:'center'},
  summaryItem:     {flex:1,alignItems:'center'},
  summaryVal:      {fontSize:20,fontWeight:'800'},
  summaryLabel:    {fontSize:10,color:'#6e7a8a',marginTop:3},
  divider:         {width:1,height:36,backgroundColor:'rgba(255,255,255,.07)'},
  venueCard:       {backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderLeftWidth:4,borderRadius:16,padding:18,gap:14},
  venueTop:        {flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},
  venueLeft:       {flex:1},
  venueName:       {fontSize:17,fontWeight:'800',color:'#eef0f4',marginBottom:3},
  venueSuburb:     {fontSize:12,color:'#6e7a8a'},
  healthBadge:     {paddingHorizontal:12,paddingVertical:5,borderRadius:99,borderWidth:1},
  healthText:      {fontSize:12,fontWeight:'700'},
  metricsRow:      {flexDirection:'row',gap:8},
  metric:          {flex:1,backgroundColor:'#161b24',borderRadius:10,padding:10,alignItems:'center'},
  metricVal:       {fontSize:16,fontWeight:'800'},
  metricLabel:     {fontSize:10,color:'#6e7a8a',marginTop:2},
  warningBanner:   {flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'rgba(242,78,110,.1)',borderWidth:1,borderColor:'rgba(242,78,110,.3)',borderRadius:9,padding:10},
  warningText:     {flex:1,fontSize:12,color:'#f24e6e',fontWeight:'600'},
  emptyWrap:       {alignItems:'center',padding:40},
  emptyText:       {fontSize:16,fontWeight:'700',color:'#6e7a8a'},
  emptySub:        {fontSize:13,color:'#3a4252',marginTop:6},
  emptyText2:      {fontSize:13,color:'#6e7a8a',textAlign:'center',padding:16},
  manageBtn:       {backgroundColor:'rgba(44,126,247,.1)',borderWidth:1,borderColor:'rgba(44,126,247,.3)',borderRadius:9,padding:10,alignItems:'center',marginTop:4},
  manageBtnText:   {color:'#2c7ef7',fontWeight:'700',fontSize:13},
  mgmtOverlay:     {flex:1,backgroundColor:'rgba(0,0,0,.75)',justifyContent:'flex-end'},
  mgmtBox:         {backgroundColor:'#0f1218',borderTopLeftRadius:22,borderTopRightRadius:22,padding:22,maxHeight:'92%'},
  mgmtHeader:      {flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16},
  mgmtTitle:       {fontSize:20,fontWeight:'800',color:'#eef0f4'},
  mgmtSub:         {fontSize:13,color:'#6e7a8a',marginTop:2},
  mgmtClose:       {fontSize:20,color:'#6e7a8a',padding:4},
  tabRow:          {flexDirection:'row',backgroundColor:'#161b24',borderRadius:10,padding:3,marginBottom:18,gap:3},
  tab:             {flex:1,padding:9,borderRadius:8,alignItems:'center'},
  tabActive:       {backgroundColor:'#0f1218'},
  tabText:         {fontSize:12,color:'#6e7a8a',fontWeight:'600'},
  tabTextActive:   {color:'#eef0f4'},
  tabContent:      {gap:10},
  fieldLabel:      {fontSize:11,fontWeight:'600',color:'#6e7a8a',letterSpacing:.5,marginBottom:6},
  input:           {backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:13,color:'#eef0f4',fontSize:14,marginBottom:4},
  saveBtn:         {backgroundColor:'#00c896',borderRadius:10,padding:13,alignItems:'center',marginTop:8},
  saveBtnText:     {color:'#000',fontWeight:'700',fontSize:14},
  zoneRow:         {flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.05)'},
  zoneIcon:        {fontSize:22},
  zoneInfo:        {flex:1},
  zoneName:        {fontSize:13,fontWeight:'600',color:'#eef0f4'},
  zoneStatus:      {fontSize:11,marginTop:2},
  editActionBtn:   {backgroundColor:'rgba(44,126,247,.1)',borderWidth:1,borderColor:'rgba(44,126,247,.3)',borderRadius:7,paddingHorizontal:10,paddingVertical:6},
  delActionBtn:    {backgroundColor:'rgba(242,78,110,.1)',borderWidth:1,borderColor:'rgba(242,78,110,.3)',borderRadius:7,paddingHorizontal:10,paddingVertical:6},
  editActionTxt:   {fontSize:11,color:'#2c7ef7',fontWeight:'700'},
  delActionTxt:    {fontSize:11,color:'#f24e6e',fontWeight:'700'},
  twoBtn:          {flexDirection:'row',gap:8},
  cancelSmBtn:     {flex:1,backgroundColor:'transparent',borderWidth:1,borderColor:'rgba(255,255,255,.1)',borderRadius:8,padding:9,alignItems:'center'},
  cancelSmText:    {color:'#6e7a8a',fontWeight:'600',fontSize:12},
  saveSmBtn:       {flex:1,backgroundColor:'#00c896',borderRadius:8,padding:9,alignItems:'center'},
  saveSmText:      {color:'#000',fontWeight:'700',fontSize:12},
  addZoneWrap:     {backgroundColor:'#161b24',borderRadius:12,padding:14,gap:8,marginTop:8},
  addZoneBtn:      {borderWidth:1.5,borderStyle:'dashed',borderColor:'rgba(255,255,255,.12)',borderRadius:10,padding:13,alignItems:'center',marginTop:8},
  addZoneBtnText:  {color:'#6e7a8a',fontWeight:'600',fontSize:13},
  iconRow:         {flexDirection:'row',flexWrap:'wrap',gap:7,marginBottom:8},
  iconOpt:         {width:40,height:40,borderRadius:9,backgroundColor:'#0f1218',borderWidth:1.5,borderColor:'rgba(255,255,255,.07)',alignItems:'center',justifyContent:'center'},
  iconOptActive:   {borderColor:'#00c896',backgroundColor:'rgba(0,200,150,.1)'},
  iconTxt:         {fontSize:20},
  memberRow:       {flexDirection:'row',alignItems:'center',gap:10,paddingVertical:10},
  memberBorder:    {borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.05)'},
  memberAv:        {width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'},
  memberIni:       {fontSize:13,fontWeight:'800'},
  memberInfo:      {flex:1},
  memberName:      {fontSize:13,fontWeight:'600',color:'#eef0f4'},
  memberEmail:     {fontSize:11,color:'#6e7a8a',marginTop:1},
  roleBadge:       {paddingHorizontal:8,paddingVertical:3,borderRadius:99},
  roleText:        {fontSize:10,fontWeight:'700'},
  removeBtn:       {backgroundColor:'rgba(242,78,110,.1)',borderWidth:1,borderColor:'rgba(242,78,110,.3)',borderRadius:8,paddingHorizontal:10,paddingVertical:6},
  removeBtnText:   {color:'#f24e6e',fontSize:11,fontWeight:'700'},
  inviteDivider:   {borderTopWidth:1,borderTopColor:'rgba(255,255,255,.07)',paddingTop:16,marginTop:8},
  inviteTitle:     {fontSize:15,fontWeight:'700',color:'#eef0f4',marginBottom:12},
  roleRow:         {flexDirection:'row',gap:8,marginBottom:4},
  roleOpt:         {flex:1,backgroundColor:'#161b24',borderWidth:1.5,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:10,alignItems:'center',gap:4},
  roleOptActive:   {borderColor:'#00c896',backgroundColor:'rgba(0,200,150,.08)'},
  roleOptText:     {fontSize:11,color:'#6e7a8a',fontWeight:'600',textAlign:'center'},
  roleOptTextActive:{color:'#00c896'},
  inviteBtn:       {backgroundColor:'#00c896',borderRadius:10,padding:13,alignItems:'center',marginTop:8},
  inviteBtnText:   {color:'#000',fontWeight:'700',fontSize:14},
  searchBarInline:      {flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:10,marginBottom:8},
  searchInputInline:    {flex:1,color:'#eef0f4',fontSize:13,padding:0},
  searchResults:        {backgroundColor:'#161b24',borderRadius:10,borderWidth:1,borderColor:'rgba(255,255,255,.07)',marginBottom:12,overflow:'hidden'},
  searchResultItem:     {flexDirection:'row',alignItems:'center',gap:10,padding:12,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.05)'},
  searchResultItemActive:{backgroundColor:'rgba(0,200,150,.08)'},
});