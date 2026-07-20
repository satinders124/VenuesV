import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Modal, ActivityIndicator, TextInput,
  Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../config/supabase';
import { fetchVenuesForUser } from '../config/fetchVenues';
import { getVenueTeamMembers, inviteTeamMember, removeTeamMember } from '../config/teamApi';
import { deleteVenue as deleteVenueApi } from '../config/venueApi';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RefreshControl } from 'react-native';

type Venue  = { id:string; name:string; suburb:string; score:number; ownerId?:string; assignedUids?:string[]; };
type Task   = { id:string; done:boolean; venueId:string; };
type Issue  = { id:string; status:string; priority:string; venueId:string; };
type Zone   = { id:string; name:string; icon:string; status:string; venueId:string; score?:number; };
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
  const [deletingVenue, setDeletingVenue] = useState(false);

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

  const fetchAllMembers = async (venueList: Venue[]) => {
    try {
      const results = await Promise.all(
        venueList.map(v => getVenueTeamMembers(v.id).catch(() => []))
      );
      const allMembers = results.flat();
      const unique = Array.from(new Map(allMembers.map((m: any) => [m.id, m])).values());
      setMembers(unique as Member[]);
    } catch (err) {
      console.log('fetchAllMembers error:', err);
    }
  };

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const vList = await fetchVenuesForUser(user.uid, user.role) as Venue[];
      
      setVenues(vList);
      
      setSelVenue(prev => {
        if (!prev) return prev;
        const updated = vList.find(v => v.id === prev.id);
        return updated || prev;
      });

      const venueIds = vList.map(v => v.id).slice(0, 30);
      
      if (venueIds.length > 0) {
        const [{data: tData}, {data: iData}, {data: zData}] = await Promise.all([
          supabase.from('tasks').select('id, done, venueId').in('venueId', venueIds),
          supabase.from('issues').select('id, status, priority, venueId').in('venueId', venueIds),
          supabase.from('zones').select('id, name, icon, status, venueId').in('venueId', venueIds)
        ]);
        
        setTasks((tData || []) as Task[]);
        setIssues((iData || []) as Issue[]);
        setZones((zData || []) as Zone[]);
      } else {
        setTasks([]); setIssues([]); setZones([]);
      }

      await fetchAllMembers(vList);
    } catch (err) {
      console.log('Error fetching overview data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openVenueActions = () => {
    if (!selVenue || user?.role !== 'owner') return;
    const venueToDelete = selVenue;
    Alert.alert(
      'Venue actions',
      venueToDelete.name,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete venue',
          style: 'destructive',
          onPress: () => Alert.alert(
            `Delete ${venueToDelete.name}?`,
            'This permanently removes its zones, tasks, issues and venue chat history. This cannot be undone.',
            [
              { text: 'No', style: 'cancel' },
              {
                text: 'Yes, delete venue',
                style: 'destructive',
                onPress: async () => {
                  setDeletingVenue(true);
                  try {
                    const deletedName = venueToDelete.name;
                    await deleteVenueApi(venueToDelete.id);
                    setSelVenue(null);
                    setVenues((current) => current.filter((venue) => venue.id !== venueToDelete.id));
                    setTasks((current) => current.filter((task) => task.venueId !== venueToDelete.id));
                    setIssues((current) => current.filter((issue) => issue.venueId !== venueToDelete.id));
                    setZones((current) => current.filter((zone) => zone.venueId !== venueToDelete.id));
                    await fetchData();
                    Alert.alert('Venue deleted', `${deletedName} has been deleted.`);
                  } catch (error: any) {
                    Alert.alert('Could not delete venue', error.message || 'Please try again.');
                  } finally {
                    setDeletingVenue(false);
                  }
                },
              },
            ],
          ),
        },
      ],
    );
  };

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('overview_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsub;
  }, [navigation, fetchData]);



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
    await supabase.from('venues').update({name:editName, suburb:editSuburb}).eq('id', selVenue!.id);
    setSelVenue(p=>p?{...p,name:editName,suburb:editSuburb}:null);
    setSavingDetails(false);
    Alert.alert('✅','Venue updated!');
  };

  const addZone = async () => {
    if (!newZoneName) {Alert.alert('Missing','Enter zone name.');return;}
    setSavingZone(true);
    await supabase.from('zones').insert([{
      name:newZoneName, icon:newZoneIcon, status:'clean', score:100, venueId:selVenue!.id
    }]);
    setNewZoneName('');setNewZoneIcon('📍');setAddingZone(false);
    setSavingZone(false);
  };

  const saveZone = async () => {
    if (!editZoneName) return;
    setSavingZone(true);
    await supabase.from('zones').update({name:editZoneName, icon:editZoneIcon}).eq('id', editZone!.id);
    setEditZone(null);
    setSavingZone(false);
  };

  const deleteZone = (z:Zone) => {
    Alert.alert('Delete Zone',`Delete "${z.name}"?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress:async()=>await supabase.from('zones').delete().eq('id', z.id)},
    ]);
  };

  const removeMember = (m:Member) => {
    Alert.alert('Remove Member',`Remove ${m.name} from ${selVenue?.name}?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Remove',style:'destructive',onPress:async()=>{
        try {
          const docId = m.uid || m.id;
          if (!selVenue) throw new Error('No venue selected.');
          await removeTeamMember({ targetUid: docId, venueId: selVenue.id });
          await fetchAllMembers(venues);
        } catch (err: any) {
          Alert.alert('Error', err.message || 'Failed to remove team member.');
        }
      }},
    ]);
  };

  const inviteMember = async () => {
    if (!inviteName||!inviteEmail) {Alert.alert('Missing','Enter name and email.');return;}
    if (!selVenue) {Alert.alert('Missing','No venue selected.');return;}
    setInviting(true);
    try {
      await inviteTeamMember({
        email: inviteEmail,
        name: inviteName,
        role: inviteRole as 'manager' | 'cleaner' | 'staff',
        venueId: selVenue.id,
      });
      setInviteName(''); setInviteEmail('');
      Alert.alert('✅ Invite Sent', `An invitation has been sent to ${inviteEmail}.`);
      await fetchAllMembers(venues);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send invite.');
    }
    setInviting(false);
  };

  const filteredVenues = search
    ? venues.filter(v=>v.name.toLowerCase().includes(search.toLowerCase())||v.suburb.toLowerCase().includes(search.toLowerCase()))
    : venues;

  const totalOpenIssues = issues.filter(i=>i.status!=='resolved').length;
  const overallTaskPct = tasks.length ? Math.round((tasks.filter(t=>t.done).length/tasks.length)*100) : 0;

  if (loading) return (
    <SafeAreaView style={s.container}>
      <ActivityIndicator color="#00c896" style={{marginTop:100}}/>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00c896"/>}>
        <View style={s.header}>
          <View>
            <Text style={s.heading}>Overview</Text>
            <Text style={s.sub}>{user?.role==='owner'?'Your managed properties':'Properties you manage'}</Text>
          </View>
          <View style={s.sitesBadge}>
            <Text style={s.sitesBadgeNum}>{venues.length}</Text>
            <Text style={s.sitesBadgeLabel}>SITES</Text>
          </View>
        </View>

        <View style={s.summaryBar}>
          <View style={s.summaryItem}>
            <Text style={[s.summaryVal,{color:'#00c896'}]}>{overallTaskPct}%</Text>
            <Text style={s.summaryLabel}>Completion</Text>
          </View>
          <View style={s.divider}/>
          <View style={s.summaryItem}>
            <Text style={[s.summaryVal,{color:totalOpenIssues>0?'#f24e6e':'#eef0f4'}]}>{totalOpenIssues}</Text>
            <Text style={s.summaryLabel}>Open Issues</Text>
          </View>
          <View style={s.divider}/>
          <View style={s.summaryItem}>
            <Text style={[s.summaryVal,{color:'#2c7ef7'}]}>{members.length}</Text>
            <Text style={s.summaryLabel}>Team</Text>
          </View>
        </View>

        <View style={s.searchBar}>
          <Ionicons name="search" size={16} color="#6e7a8a"/>
          <TextInput style={s.searchInput} placeholder="Search venues..." placeholderTextColor="#6e7a8a" value={search} onChangeText={setSearch}/>
        </View>

        {filteredVenues.length===0?(
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>No venues found</Text>
            {user?.role==='owner'&&<Text style={s.emptySub}>Add a venue to get started</Text>}
          </View>
        ):(
          filteredVenues.map(v=>{
            const stats = vStats(v);
            const health = VENUE_HEALTH(stats.pct, stats.issues);
            return (
              <View key={v.id} style={s.venueCard}>
                <View style={s.venueTop}>
                  <View style={s.venueLeft}>
                    <Text style={s.venueName}>{v.name}</Text>
                    <Text style={s.venueSuburb}>{v.suburb}</Text>
                  </View>
                  <View style={[s.healthBadge,{borderColor:health.color,backgroundColor:`${health.color}11`}]}>
                    <Text style={[s.healthText,{color:health.color}]}>{health.label}</Text>
                  </View>
                </View>

                {stats.highIssues>0&& (
                  <View style={s.warningBanner}>
                    <Ionicons name="warning" color="#f24e6e" size={14}/>
                    <Text style={s.warningText}>{stats.highIssues} High Priority Issue{stats.highIssues>1?'s':''}</Text>
                  </View>
                )}

                <View style={s.metricsRow}>
                  <View style={s.metric}>
                    <Text style={[s.metricVal,{color:'#00c896'}]}>{stats.pct}%</Text>
                    <Text style={s.metricLabel}>Done</Text>
                  </View>
                  <View style={s.metric}>
                    <Text style={[s.metricVal,{color:stats.issues>0?'#f5a623':'#eef0f4'}]}>{stats.issues}</Text>
                    <Text style={s.metricLabel}>Issues</Text>
                  </View>
                  <View style={s.metric}>
                    <Text style={[s.metricVal,{color:'#2c7ef7'}]}>{zones.filter(z=>z.venueId===v.id).length}</Text>
                    <Text style={s.metricLabel}>Zones</Text>
                  </View>
                </View>

                {(user?.role==='owner'||user?.role==='manager')&& (
                  <TouchableOpacity style={s.manageBtn} onPress={()=>openVenue(v)}>
                    <Text style={s.manageBtnText}>Manage Venue Settings</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Management Modal */}
      <Modal visible={!!selVenue} transparent animationType="slide">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.mgmtOverlay}>
            <View style={s.mgmtBox}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.mgmtHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.mgmtTitle}>{selVenue?.name}</Text>
                    <Text style={s.mgmtSub}>Venue settings</Text>
                  </View>
                  <View style={s.mgmtHeaderActions}>
                    {user?.role === 'owner' && (
                      <TouchableOpacity style={s.headerIconBtn} onPress={openVenueActions} disabled={deletingVenue}>
                        <Ionicons name="ellipsis-horizontal" color="#a8b3c4" size={20}/>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={s.headerIconBtn} onPress={()=>setSelVenue(null)}>
                      <Ionicons name="close" color="#a8b3c4" size={20}/>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={s.tabRow}>
                  {(['details','zones','team'] as const).map(t=>(
                    <TouchableOpacity key={t} style={[s.tab, activeTab===t&&s.tabActive]} onPress={()=>setActiveTab(t)}>
                      <Text style={[s.tabText, activeTab===t&&s.tabTextActive]}>
                        {t==='details'?'Details':t==='zones'?'Zones':'Team'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* DETAILS TAB */}
                {activeTab==='details'&&(
                  <View style={s.tabContent}>
                    <Text style={s.fieldLabel}>VENUE NAME</Text>
                    <TextInput style={s.input} value={editName} onChangeText={setEditName}/>
                    <Text style={s.fieldLabel}>SUBURB</Text>
                    <TextInput style={s.input} value={editSuburb} onChangeText={setEditSuburb}/>
                    <TouchableOpacity style={s.saveBtn} onPress={saveDetails} disabled={savingDetails || deletingVenue}>
                      {savingDetails?<ActivityIndicator color="#000"/>:<Text style={s.saveBtnText}>Save Changes</Text>}
                    </TouchableOpacity>
                  </View>
                )}

                {/* ZONES TAB */}
                {activeTab==='zones'&&(
                  <View style={s.tabContent}>
                    {zones.filter(z=>z.venueId===selVenue?.id).map((z,i,arr)=>(
                      <View key={z.id} style={[s.zoneRow, i===arr.length-1&&{borderBottomWidth:0}]}>
                        <Text style={s.zoneIcon}>{z.icon}</Text>
                        <View style={s.zoneInfo}>
                          <Text style={s.zoneName}>{z.name}</Text>
                          <Text style={[s.zoneStatus,{color:ZONE_COLOR[z.status]||'#eef0f4'}]}>Score: {z.score}%</Text>
                        </View>
                        {editZone?.id===z.id?(
                          <View style={s.twoBtn}>
                            <TouchableOpacity style={s.cancelSmBtn} onPress={()=>setEditZone(null)}><Text style={s.cancelSmText}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity style={s.saveSmBtn} onPress={saveZone} disabled={savingZone}>{savingZone?<ActivityIndicator size="small" color="#000"/>:<Text style={s.saveSmText}>Save</Text>}</TouchableOpacity>
                          </View>
                        ):(
                          <View style={{flexDirection:'row',gap:6}}>
                            <TouchableOpacity style={s.editActionBtn} onPress={()=>{setEditZone(z);setEditZoneName(z.name);setEditZoneIcon(z.icon);setAddingZone(false);}}>
                              <Text style={s.editActionTxt}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.delActionBtn} onPress={()=>deleteZone(z)}>
                              <Text style={s.delActionTxt}>Del</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    ))}

                    {editZone&&(
                      <View style={s.addZoneWrap}>
                        <Text style={s.fieldLabel}>EDIT ZONE</Text>
                        <TextInput style={s.input} value={editZoneName} onChangeText={setEditZoneName}/>
                        <View style={s.iconRow}>
                          {ICONS.map(ic=>(
                            <TouchableOpacity key={ic} style={[s.iconOpt,editZoneIcon===ic&&s.iconOptActive]} onPress={()=>setEditZoneIcon(ic)}>
                              <Text style={s.iconTxt}>{ic}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                    {!addingZone&&!editZone&&(
                      <TouchableOpacity style={s.addZoneBtn} onPress={()=>setAddingZone(true)}>
                        <Text style={s.addZoneBtnText}>＋ Add New Zone</Text>
                      </TouchableOpacity>
                    )}

                    {addingZone&&(
                      <View style={s.addZoneWrap}>
                        <Text style={s.fieldLabel}>NEW ZONE NAME</Text>
                        <TextInput style={s.input} value={newZoneName} onChangeText={setNewZoneName} placeholder="e.g. Lobby"/>
                        <Text style={s.fieldLabel}>ICON</Text>
                        <View style={s.iconRow}>
                          {ICONS.map(ic=>(
                            <TouchableOpacity key={ic} style={[s.iconOpt,newZoneIcon===ic&&s.iconOptActive]} onPress={()=>setNewZoneIcon(ic)}>
                              <Text style={s.iconTxt}>{ic}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={s.twoBtn}>
                          <TouchableOpacity style={s.cancelSmBtn} onPress={()=>setAddingZone(false)}><Text style={s.cancelSmText}>Cancel</Text></TouchableOpacity>
                          <TouchableOpacity style={s.saveSmBtn} onPress={addZone} disabled={savingZone}>{savingZone?<ActivityIndicator size="small" color="#000"/>:<Text style={s.saveSmText}>Add Zone</Text>}</TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* TEAM TAB */}
                {activeTab==='team'&&(
                  <View style={s.tabContent}>
                    {members.filter(m=>m.venues?.includes(selVenue?.name||'') || m.venue===selVenue?.name).length===0&&<Text style={s.emptyText2}>No team members assigned.</Text>}
                    {members.filter(m=>m.venues?.includes(selVenue?.name||'') || m.venue===selVenue?.name).map((m,i,arr)=>(
                      <View key={m.id} style={[s.memberRow, i!==arr.length-1&&s.memberBorder]}>
                        <View style={[s.memberAv,{backgroundColor:(ROLE_CONFIG[m.role]?.color||'#6e7a8a')+'33'}]}>
                          <Text style={[s.memberIni,{color:ROLE_CONFIG[m.role]?.color||'#eef0f4'}]}>{m.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={s.memberInfo}>
                          <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                            <Text style={s.memberName}>{m.name}</Text>
                            <View style={[s.roleBadge,{backgroundColor:(ROLE_CONFIG[m.role]?.color||'#6e7a8a')+'22'}]}>
                              <Text style={[s.roleText,{color:ROLE_CONFIG[m.role]?.color||'#eef0f4'}]}>{ROLE_CONFIG[m.role]?.label}</Text>
                            </View>
                          </View>
                          <Text style={s.memberEmail}>{m.email}</Text>
                        </View>
                        {m.email!==user?.email&&(
                          <TouchableOpacity style={s.removeBtn} onPress={()=>removeMember(m)}>
                            <Text style={s.removeBtnText}>Remove</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}

                    <View style={s.inviteDivider}>
                      <Text style={s.inviteTitle}>Add to Venue</Text>
                    </View>

                    <Text style={s.fieldLabel}>ASSIGN EXISTING TEAM MEMBER</Text>
                    <View style={s.searchBarInline}>
                      <Ionicons name="search" size={14} color="#6e7a8a" />
                      <TextInput 
                        style={s.searchInputInline} 
                        placeholder="Search by name..." 
                        placeholderTextColor="#6e7a8a"
                        value={memberSearch}
                        onChangeText={setMemberSearch}
                      />
                    </View>
                    
                    {memberSearch.length > 0 && (
                      <View style={s.searchResults}>
                        {members
                          .filter(m => !(m.venues?.includes(selVenue?.name||'') || m.venue===selVenue?.name))
                          .filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
                          .slice(0, 3)
                          .map(m => (
                            <TouchableOpacity 
                              key={m.id} 
                              style={[s.searchResultItem, selectedMember?.id === m.id && s.searchResultItemActive]}
                              onPress={() => setSelectedMember(selectedMember?.id === m.id ? null : m)}
                            >
                              <View style={[s.memberAv, {width: 28, height: 28, backgroundColor:(ROLE_CONFIG[m.role]?.color||'#6e7a8a')+'33'}]}>
                                <Text style={[s.memberIni, {fontSize: 10, color:ROLE_CONFIG[m.role]?.color||'#eef0f4'}]}>{m.name.charAt(0).toUpperCase()}</Text>
                              </View>
                              <View style={s.memberInfo}>
                                <Text style={s.memberName}>{m.name}</Text>
                                <Text style={s.memberEmail}>{ROLE_CONFIG[m.role]?.label}</Text>
                              </View>
                              {selectedMember?.id === m.id && <Ionicons name="checkmark-circle" color="#00c896" size={20} />}
                            </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {selectedMember && (
                      <TouchableOpacity style={s.saveBtn} onPress={async () => {
                        setSavingDetails(true);
                        try {
                          const docId = selectedMember.uid || selectedMember.id;
                          if (!selVenue) throw new Error('No venue selected.');
                          await inviteTeamMember({
                            email: selectedMember.email,
                            name: selectedMember.name,
                            role: selectedMember.role as 'manager' | 'cleaner' | 'staff',
                            venueId: selVenue.id,
                          });
                          setSelectedMember(null);
                          setMemberSearch('');
                          await fetchAllMembers(venues);
                          Alert.alert('✅ Success', `${selectedMember.name} added to ${selVenue?.name}`);
                        } catch (err: any) {
                          Alert.alert('Error', err.message || 'Failed to assign member.');
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
  mgmtHeader:      {flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16},
  mgmtHeaderActions:{flexDirection:'row',alignItems:'center',gap:8},
  headerIconBtn:   {width:36,height:36,borderRadius:12,backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.08)',alignItems:'center',justifyContent:'center'},
  mgmtTitle:       {fontSize:20,fontWeight:'800',color:'#eef0f4'},
  mgmtSub:         {fontSize:13,color:'#6e7a8a',marginTop:2},
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
  dangerZone:      {marginTop:18,paddingTop:16,borderTopWidth:1,borderTopColor:'rgba(242,78,110,.25)'},
  dangerTitle:     {fontSize:11,fontWeight:'800',color:'#f24e6e',letterSpacing:.7},
  dangerText:      {fontSize:12,color:'#8892aa',lineHeight:18,marginTop:6},
  deleteVenueBtn:  {backgroundColor:'#f24e6e',borderRadius:10,padding:13,alignItems:'center',marginTop:12},
  deleteVenueBtnText:{color:'#fff',fontWeight:'800',fontSize:14},
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