import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, RefreshControl
} from 'react-native';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const TEAM_URL = 'https://us-central1-venuev-b24c2.cloudfunctions.net/getVenueTeamMembers';

type Venue  = { id:string; name:string; suburb:string; score:number; ownerId?:string; assignedUids?:string[]; };
type Issue  = { id:string; status:string; priority:string; venueId:string; title:string; zone:string; by:string; createdAt:any; };
type Member = { id:string; name:string; role:string; venue:string; venues?:string[]; };

const PRIORITY_COLOR: Record<string,string> = {
  high:'#f24e6e', medium:'#f5a623', low:'#00c896',
};

export default function DashboardScreen() {
  const { user }   = useAuth();
  const navigation = useNavigation<any>();

  const [refreshing, setRefreshing] = useState(false);
  const [venues,  setVenues]  = useState<Venue[]>([]);
  const [issues,  setIssues]  = useState<Issue[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

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
      let venuesData: Venue[] = [];
      if (user.role === 'owner') {
        const { data } = await supabase.from('venues').select('*').eq('ownerId', user.uid);
        venuesData = (data || []) as Venue[];
      } else {
        const { data } = await supabase.from('venues').select('*').contains('assignedUids', [user.uid]);
        venuesData = (data || []) as Venue[];
      }
      
      setVenues(venuesData);
      
      if (venuesData.length > 0) {
        const venueIds = venuesData.map(v => v.id);
        const { data: issuesData } = await supabase
          .from('issues')
          .select('*')
          .in('venueId', venueIds.slice(0, 30));
        setIssues((issuesData || []) as Issue[]);
      } else {
        setIssues([]);
      }
      
      await fetchAllMembers(venuesData);
    } catch (err) {
      console.log('Error fetching dashboard data', err);
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

    // Setup Supabase Realtime subscriptions
    const channel = supabase.channel('dashboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const openIssues   = issues.filter(i=>i.status!=='resolved');
  const highIssues   = openIssues.filter(i=>i.priority==='high');
  const managers     = members.filter(m=>m.role==='manager');
  const staff        = members.filter(m=>m.role==='cleaner'||m.role==='staff');

  const venuesWithIssues = venues.filter(v=>
    openIssues.some(i=>i.venueId===v.id)
  );

  const formatDate = (dateString: any) => {
    if (!dateString) return 'Just now';
    const d = new Date(dateString);
    const diff = Date.now() - d.getTime();
    if (diff<3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff<86400000) return `${Math.floor(diff/3600000)}h ago`;
    return d.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
  };

  if (loading) return (
    <SafeAreaView style={s.container}>
      <ActivityIndicator color="#00c896" style={{marginTop:100}}/>
    </SafeAreaView>
  );

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00c896" colors={['#00c896']} />
        }
      >
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>{greeting},</Text>
            <Text style={s.name}>{user?.name?.split(' ')[0] || user?.displayName?.split(' ')[0]} 👋</Text>
          </View>
          <View style={s.dateBadge}>
            <Text style={s.dateText}>{now.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}</Text>
          </View>
        </View>

        <View style={s.statsGrid}>
          <View style={s.statCard}>
            <View style={[s.statIcon,{backgroundColor:'#2c7ef722'}]}><Ionicons name="person-outline" color="#2c7ef7" size={20}/></View>
            <Text style={[s.statVal,{color:'#2c7ef7'}]}>{managers.length}</Text>
            <Text style={s.statLabel}>Site Managers</Text>
          </View>
          <View style={s.statCard}>
            <View style={[s.statIcon,{backgroundColor:'#a855f722'}]}><Ionicons name="people-outline" color="#a855f7" size={20}/></View>
            <Text style={[s.statVal,{color:'#a855f7'}]}>{staff.length}</Text>
            <Text style={s.statLabel}>Staff</Text>
          </View>
          <View style={s.statCard}>
            <View style={[s.statIcon,{backgroundColor:openIssues.length>0?'#f24e6e22':'#00c89622'}]}><Ionicons name="warning-outline" color={openIssues.length>0?'#f24e6e':'#00c896'} size={20}/></View>
            <Text style={[s.statVal,{color:openIssues.length>0?'#f24e6e':'#00c896'}]}>{openIssues.length}</Text>
            <Text style={s.statLabel}>Open Issues</Text>
          </View>
          <View style={s.statCard}>
            <View style={[s.statIcon,{backgroundColor:'#00c89622'}]}><Ionicons name="business-outline" color="#00c896" size={20}/></View>
            <Text style={[s.statVal,{color:'#00c896'}]}>{venues.length}</Text>
            <Text style={s.statLabel}>Venues</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Venue Status</Text>
          {venuesWithIssues.length===0?(
            <View style={s.allGoodCard}>
              <Ionicons name="checkmark-circle" color="#00c896" size={32}/>
              <Text style={s.allGoodText}>No issues across all venues</Text>
              <Text style={s.allGoodSub}>All venues are running smoothly</Text>
            </View>
          ):(
            venuesWithIssues.map(v=>{
              const vIssues  = openIssues.filter(i=>i.venueId===v.id);
              const vHigh    = vIssues.filter(i=>i.priority==='high').length;
              const vMedium  = vIssues.filter(i=>i.priority==='medium').length;
              const vLow     = vIssues.filter(i=>i.priority==='low').length;
              const scoreColor = (v.score||0)>=85?'#00c896':(v.score||0)>=70?'#f5a623':'#f24e6e';
              return (
                <TouchableOpacity key={v.id} style={[s.venueCard,{borderLeftColor:vHigh>0?'#f24e6e':'#f5a623'}]} onPress={()=>navigation.navigate('Issues')}>
                  <View style={s.venueCardTop}>
                    <View style={s.venueCardLeft}>
                      <Text style={s.venueCardName}>{v.name}</Text>
                      <Text style={s.venueCardSub}>📍 {v.suburb}</Text>
                    </View>
                    <Text style={[s.venueCardScore,{color:scoreColor}]}>{v.score||0}%</Text>
                  </View>
                  <View style={s.issuePills}>
                    {vHigh>0&&<View style={s.issuePill}><View style={[s.pillDot,{backgroundColor:'#f24e6e'}]}/><Text style={[s.pillText,{color:'#f24e6e'}]}>{vHigh} High</Text></View>}
                    {vMedium>0&&<View style={s.issuePill}><View style={[s.pillDot,{backgroundColor:'#f5a623'}]}/><Text style={[s.pillText,{color:'#f5a623'}]}>{vMedium} Medium</Text></View>}
                    {vLow>0&&<View style={s.issuePill}><View style={[s.pillDot,{backgroundColor:'#00c896'}]}/><Text style={[s.pillText,{color:'#00c896'}]}>{vLow} Low</Text></View>}
                    <View style={s.viewIssuesBtn}><Text style={s.viewIssuesText}>View Issues</Text><Ionicons name="chevron-forward" color="#2c7ef7" size={12}/></View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>High Priority Issues</Text>
            {highIssues.length>0&&<TouchableOpacity onPress={()=>navigation.navigate('Issues')}><Text style={s.sectionLink}>View all</Text></TouchableOpacity>}
          </View>
          {highIssues.length===0?(
            <View style={s.allGoodCard}>
              <Ionicons name="checkmark-circle" color="#00c896" size={32}/>
              <Text style={s.allGoodText}>No high priority issues</Text>
              <Text style={s.allGoodSub}>Nothing urgent right now</Text>
            </View>
          ):(
            highIssues.slice(0,5).map(issue=>{
              const venue = venues.find(v=>v.id===issue.venueId);
              return (
                <TouchableOpacity key={issue.id} style={s.issueCard} onPress={()=>navigation.navigate('Issues')}>
                  <View style={s.issueLeft}>
                    <View style={s.issueTitleRow}>
                      <View style={s.highBadge}><Text style={s.highBadgeText}>HIGH</Text></View>
                      <Text style={s.issueTitle} numberOfLines={1}>{issue.title}</Text>
                    </View>
                    <Text style={s.issueMeta}>🏢 {venue?.name||'Unknown'} · 📍 {issue.zone}</Text>
                    <Text style={s.issueBy}>Reported by {issue.by} · {formatDate(issue.createdAt)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" color="#3a4252" size={16}/>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       {flex:1,backgroundColor:'#080a0e'},
  scroll:          {padding:20,gap:20,paddingBottom:40},
  header:          {flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},
  greeting:        {fontSize:14,color:'#6e7a8a',fontWeight:'500'},
  name:            {fontSize:26,fontWeight:'800',color:'#eef0f4',marginTop:2},
  dateBadge:       {backgroundColor:'#161b24',borderRadius:10,padding:10,borderWidth:1,borderColor:'rgba(255,255,255,.07)'},
  dateText:        {fontSize:12,color:'#6e7a8a',fontWeight:'600'},
  statsGrid:       {flexDirection:'row',flexWrap:'wrap',gap:10},
  statCard:        {width:'47%',backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:14,padding:14,gap:8},
  statIcon:        {width:36,height:36,borderRadius:10,alignItems:'center',justifyContent:'center'},
  statVal:         {fontSize:26,fontWeight:'900',lineHeight:30},
  statLabel:       {fontSize:12,color:'#6e7a8a',fontWeight:'500'},
  section:         {gap:12},
  sectionRow:      {flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  sectionTitle:    {fontSize:16,fontWeight:'800',color:'#eef0f4'},
  sectionLink:     {fontSize:13,color:'#2c7ef7',fontWeight:'600'},
  allGoodCard:     {backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:14,padding:24,alignItems:'center',gap:8},
  allGoodText:     {fontSize:15,fontWeight:'700',color:'#eef0f4'},
  allGoodSub:      {fontSize:13,color:'#6e7a8a'},
  venueCard:       {backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderLeftWidth:3,borderRadius:14,padding:14,gap:10},
  venueCardTop:    {flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},
  venueCardLeft:   {flex:1},
  venueCardName:   {fontSize:14,fontWeight:'700',color:'#eef0f4'},
  venueCardSub:    {fontSize:11,color:'#6e7a8a',marginTop:2},
  venueCardScore:  {fontSize:18,fontWeight:'800'},
  issuePills:      {flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center'},
  issuePill:       {flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'#161b24',borderRadius:99,paddingHorizontal:10,paddingVertical:4},
  pillDot:         {width:6,height:6,borderRadius:3},
  pillText:        {fontSize:11,fontWeight:'700'},
  viewIssuesBtn:   {flexDirection:'row',alignItems:'center',gap:3,marginLeft:'auto' as any},
  viewIssuesText:  {fontSize:11,color:'#2c7ef7',fontWeight:'700'},
  issueCard:       {backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:14,padding:14,flexDirection:'row',alignItems:'center',gap:10},
  issueLeft:       {flex:1,gap:5},
  issueTitleRow:   {flexDirection:'row',alignItems:'center',gap:8},
  highBadge:       {backgroundColor:'rgba(242,78,110,.2)',borderRadius:4,paddingHorizontal:6,paddingVertical:2},
  highBadgeText:   {fontSize:9,fontWeight:'800',color:'#f24e6e',letterSpacing:.5},
  issueTitle:      {fontSize:13,fontWeight:'700',color:'#eef0f4',flex:1},
  issueMeta:       {fontSize:11,color:'#6e7a8a'},
  issueBy:         {fontSize:11,color:'#3a4252'},
});