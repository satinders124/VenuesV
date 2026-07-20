import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { supabase } from '../config/supabase';
import { fetchVenuesForUser } from '../config/fetchVenues';
import { getVenueTeamMembers } from '../config/teamApi';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/tokens';
import MetricCard from '../components/ui/MetricCard';
import AIInsightCard from '../components/ui/AIInsightCard';
import ActionCard from '../components/ui/ActionCard';
import SectionHeader from '../components/ui/SectionHeader';
import { useAIInsight } from '../hooks/useAIInsight';
import EmptyState from '../components/ui/EmptyState';

type Venue = { id:string; name:string; suburb:string; score:number; ownerId?:string; assignedUids?:string[]; };
type Issue = { id:string; status:string; priority:string; venueId:string; title:string; zone:string; by:string; createdAt:any; };
type Member = { id:string; name:string; role:string; venue:string; venues?:string[]; };

export default function DashboardScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllMembers = async (venueList: Venue[]) => {
    try {
      const results = await Promise.all(venueList.map(v => getVenueTeamMembers(v.id).catch(() => [])));
      const all = results.flat();
      const unique = Array.from(new Map(all.map((m: any) => [m.id, m])).values());
      setMembers(unique as Member[]);
    } catch {}
  };

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const venuesData = await fetchVenuesForUser(user.uid, user.role) as Venue[];
      setVenues(venuesData);
      if (venuesData.length > 0) {
        const venueIds = venuesData.map(v => v.id).slice(0, 30);
        const { data } = await supabase.from('issues').select('*').in('venueId', venueIds);
        setIssues((data || []) as Issue[]);
      } else setIssues([]);
      await fetchAllMembers(venuesData);
    } catch (e) { console.log(e); } finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  useEffect(() => {
    fetchData();
    const ch = supabase.channel('dash_os')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchData]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsub;
  }, [navigation, fetchData]);



  const openIssues = issues.filter(i=>i.status!=='resolved');
  const highIssues = openIssues.filter(i=>i.priority==='high');
  const managers = members.filter(m=>m.role==='manager');
  const staff = members.filter(m=>m.role==='cleaner'||m.role==='staff');
  const venuesWithIssues = venues.filter(v=> openIssues.some(i=>i.venueId===v.id));
  const completion = venues.length ? Math.round(venues.reduce((acc,v)=>acc+(v.score||0),0)/venues.length) : 100;

  const { insight: aiRemote, loading: aiLoading } = useAIInsight('dashboard', undefined, [venues.length, issues.length]);
  const aiInsight = aiRemote || (() => {
    if (venues.length===0) {
      if (user?.role !== 'owner') {
        return { type: 'warning' as const, title: 'No venues assigned', message: 'You have been removed from all venues or have no active assignments. Contact your owner/manager to be re-added.', actionLabel: 'Contact Owner', nav: 'Chat' };
      }
      return { type: 'info' as const, title: 'Welcome to VenuesV OS', message: 'Add your first venue to activate your ops command center.', actionLabel: 'Add Venue', nav: 'AddVenue' };
    }
    if (highIssues.length > 0) {
      const v = venues.find(x=>x.id===highIssues[0].venueId);
      return { type: 'warning' as const, title: `${highIssues.length} high priority issue${highIssues.length>1?'s':''} need action`, message: `${v?.name || 'A venue'} has ${highIssues.length} critical issue${highIssues.length>1?'s':''}. Review now.`, actionLabel: 'Review Issues', nav: 'Issues' };
    }
    return { type: 'success' as const, title: `Ops health ${completion}% – all clear`, message: `Team active across ${venues.length} venues.`, actionLabel: 'View Reports', nav: 'Reports' };
  })();

  if (loading) return (
    <SafeAreaView style={s.container}><ActivityIndicator color={Colors.brand} style={{marginTop:120}}/></SafeAreaView>
  );

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brand} />}>
        {/* COMMAND CARD */}
        <View style={s.commandCard}>
          <View style={s.commandTop}>
            <View>
              <Text style={s.greeting}>{greeting},</Text>
              <Text style={s.name}>{user?.name?.split(' ')[0] || 'there'} 👋</Text>
              <Text style={s.commandSub}>{venues.length} venues • {openIssues.length} open • {completion}% health</Text>
            </View>
            <View style={s.dateBadge}>
              <Text style={s.dateText}>{now.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}</Text>
            </View>
          </View>
          <View style={s.commandDivider} />
          <View style={s.quickActions}>
            <TouchableOpacity style={s.qaBtn} onPress={()=>navigation.navigate('Issues')}>
              <Ionicons name="warning-outline" size={14} color={Colors.red} />
              <Text style={s.qaText}>{openIssues.length} Issues</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.qaBtn} onPress={()=>navigation.navigate('Team')}>
              <Ionicons name="people-outline" size={14} color={Colors.blue} />
              <Text style={s.qaText}>{members.filter(m=>m.role!=='owner').length} Team</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.qaBtn, s.qaPrimary]} onPress={()=>navigation.navigate(user?.role==='owner'?'AddVenue':'Tasks')}>
              <Ionicons name="add" size={14} color={Colors.black} />
              <Text style={[s.qaText,{color:Colors.black}]}>{user?.role==='owner'?'Add Venue':'My Tasks'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* REMOVED EMPTY STATE FOR NON-OWNERS */}
        {venues.length===0 && user?.role!=='owner' && (
          <EmptyState icon="lock-closed-outline" title="Removed from venues" subtitle="You are no longer assigned to any venue. Your account is still active – ask your owner or site manager to re-add you to a venue to regain access." />
        )}

        {/* METRICS - hide if no venues and not owner to avoid confusion */}
        {!(venues.length===0 && user?.role!=='owner') && (
          <View style={s.metrics}>
            <MetricCard icon="business-outline" iconColor={Colors.brand} value={venues.length} label="Venues" trend={venues.length>1?`${venues.length} active`:undefined} trendUp />
            <MetricCard icon="warning-outline" iconColor={openIssues.length?Colors.red:Colors.brand} value={openIssues.length} label="Open Issues" trend={highIssues.length?`${highIssues.length} high`: 'All clear'} trendUp={highIssues.length===0} />
            <MetricCard icon="person-outline" iconColor={Colors.blue} value={managers.length} label="Managers" />
            <MetricCard icon="people-outline" iconColor={Colors.textSecondary} value={staff.length} label="Staff & Cleaners" />
          </View>
        )}

        {/* AI INSIGHT */}
        <AIInsightCard title={aiInsight.title} message={aiInsight.message || aiInsight.msg} actionLabel={aiInsight.actionLabel || aiInsight.action} type={aiInsight.type} onAction={()=>navigation.navigate(aiInsight.actionScreen || aiInsight.nav)} />

        {/* ACTION CARDS */}
        <SectionHeader title="Ops Actions" subtitle="What needs your attention" />
        <View style={s.actions}>
          <ActionCard icon="warning" iconColor={Colors.red} title="High Priority Issues" subtitle={`${highIssues.length} critical issues require review`} badge={highIssues.length?`${highIssues.length}`:undefined} onPress={()=>navigation.navigate('Issues')} />
          <ActionCard icon="chatbubbles-outline" iconColor={Colors.blue} title="Team Chat" subtitle="Group and DM – stay aligned" onPress={()=>navigation.navigate('Chat')} />
          <ActionCard icon="checkmark-done-outline" iconColor={Colors.brand} title="Daily Tasks" subtitle="Check completion across zones" onPress={()=>navigation.navigate('Tasks')} />
        </View>

        {/* VENUE HEALTH */}
        <SectionHeader title="Venue Health" subtitle={venuesWithIssues.length?`${venuesWithIssues.length} need attention`:'All venues running clean'} actionLabel={venues.length>3?'View all':undefined} onAction={()=>navigation.navigate('Overview')} />
        {venuesWithIssues.length===0 ? (
          <EmptyState icon="checkmark-circle-outline" title="No issues across venues" subtitle="All venues are running smoothly. Keep up the great work." />
        ) : venuesWithIssues.slice(0,4).map(v=>{
          const vIssues = openIssues.filter(i=>i.venueId===v.id);
          const high = vIssues.filter(i=>i.priority==='high').length;
          const scoreColor = (v.score||0)>=85?Colors.brand:(v.score||0)>=70?Colors.amber:Colors.red;
          return (
            <TouchableOpacity key={v.id} style={s.venueCard} onPress={()=>navigation.navigate('Issues')}>
              <View style={s.venueTopRow}>
                <View style={{flex:1}}>
                  <Text style={s.venueName}>{v.name}</Text>
                  <Text style={s.venueSub}>📍 {v.suburb} • {vIssues.length} open</Text>
                </View>
                <View style={[s.scoreBadge,{borderColor:scoreColor+'40', backgroundColor:scoreColor+'14'}]}>
                  <Text style={[s.scoreText,{color:scoreColor}]}>{v.score||0}%</Text>
                </View>
              </View>
              <View style={s.pills}>
                {high>0&&<View style={[s.pill,{backgroundColor:Colors.redSoft}]}><View style={[s.dot,{backgroundColor:Colors.red}]}/><Text style={[s.pillText,{color:Colors.red}]}>{high} High</Text></View>}
                <View style={s.viewBtn}><Text style={s.viewText}>View</Text><Ionicons name="chevron-forward" size={12} color={Colors.blue}/></View>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* RECENT HIGH ISSUES */}
        <SectionHeader title="Critical Issues" actionLabel={highIssues.length>0?'View all':undefined} onAction={()=>navigation.navigate('Issues')} />
        {highIssues.length===0 ? (
          <EmptyState icon="shield-checkmark-outline" title="No high priority issues" subtitle="Nothing urgent right now. Ops are clean." />
        ) : highIssues.slice(0,3).map(issue=>{
          const venue = venues.find(x=>x.id===issue.venueId);
          return (
            <View key={issue.id} style={s.issueCard}>
              <View style={s.highBadge}><Text style={s.highText}>HIGH</Text></View>
              <View style={{flex:1, gap:4}}>
                <Text style={s.issueTitle} numberOfLines={1}>{issue.title}</Text>
                <Text style={s.issueMeta}>🏢 {venue?.name||'Unknown'} • 📍 {issue.zone}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </View>
          );
        })}
        <View style={{height:24}}/>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex:1, backgroundColor: Colors.canvas },
  scroll: { padding: 16, gap: 14, paddingBottom: 32 },
  commandCard: { backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius: Radius.xl, padding: 16, gap: 14 },
  commandTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },
  name: { fontSize: 24, fontWeight: '900', color: Colors.text, marginTop: 2, letterSpacing: -0.6 },
  commandSub: { fontSize: 11, color: Colors.textMuted, marginTop: 6 },
  dateBadge: { backgroundColor: Colors.surfaceRaised, borderRadius: 10, padding: 10, borderWidth:1, borderColor: Colors.border },
  dateText: { fontSize: 11, color: Colors.textMuted, fontWeight: '700' },
  commandDivider: { height:1, backgroundColor: Colors.border },
  quickActions: { flexDirection: 'row', gap: 8 },
  qaBtn: { flex:1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.surfaceRaised, borderWidth:1, borderColor: Colors.border, borderRadius: 10, paddingVertical: 10 },
  qaPrimary: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  qaText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actions: { gap: 10 },
  venueCard: { backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius: Radius.lg, padding: 14, gap: 12 },
  venueTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  venueName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  venueSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  scoreBadge: { borderWidth:1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5 },
  scoreText: { fontSize: 13, fontWeight: '900' },
  pills: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  dot: { width:6, height:6, borderRadius:3 },
  pillText: { fontSize: 10, fontWeight: '800' },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
  viewText: { fontSize: 11, color: Colors.blue, fontWeight: '700' },
  issueCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.surface, borderWidth:1, borderColor: Colors.border, borderRadius: Radius.lg, padding: 12 },
  highBadge: { backgroundColor: Colors.redSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  highText: { fontSize: 8, fontWeight: '900', color: Colors.red, letterSpacing: 0.5 },
  issueTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  issueMeta: { fontSize: 11, color: Colors.textMuted },
});
