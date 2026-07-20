import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, TextInput
} from 'react-native';
import { supabase } from '../config/supabase';
import { fetchVenuesForUser } from '../config/fetchVenues';
import { getVenueTeamMembers } from '../config/teamApi';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/tokens';
import AIInsightCard from '../components/ui/AIInsightCard';
import { useAIInsight } from '../hooks/useAIInsight';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { RefreshControl } from 'react-native';

type Venue  = { id:string; name:string; suburb:string; score:number; ownerId?:string; assignedUids?:string[]; };
type Task   = { id:string; done:boolean; venueId:string; title:string; frequency:string; };
type Issue  = { id:string; status:string; priority:string; venueId:string; title:string; by:string; };
type Member = { id:string; name:string; role:string; venue:string; venues?:string[]; };

export default function ReportsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [venues,     setVenues]     = useState<Venue[]>([]);
  const [tasks,      setTasks]      = useState<Task[]>([]);
  const [issues,     setIssues]     = useState<Issue[]>([]);
  const [members,    setMembers]    = useState<Member[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState<string|null>(null);
  const [search,     setSearch]     = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
      
      const venueIds = vList.map(v => v.id).slice(0, 30);
      
      if (venueIds.length > 0) {
        const [{data: tData}, {data: iData}] = await Promise.all([
          supabase.from('tasks').select('*').in('venueId', venueIds),
          supabase.from('issues').select('*').in('venueId', venueIds)
        ]);
        
        setTasks((tData || []) as Task[]);
        setIssues((iData || []) as Issue[]);
      } else {
        setTasks([]); setIssues([]);
      }

      await fetchAllMembers(vList);
    } catch (err) {
      console.log('Error fetching reports data:', err);
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

    const channel = supabase.channel('reports_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsub;
  }, [navigation, fetchData]);



  const generatePDF = async (venue: Venue) => {
    setGenerating(venue.id);
    try {
      const vTasks    = tasks.filter(t=>t.venueId===venue.id);
      const vIssues   = issues.filter(i=>i.venueId===venue.id);
      const vMembers  = members.filter(m=>m.venue===venue.name&&m.role!=='owner');

      const dailyDone    = vTasks.filter(t=>t.frequency==='daily'&&t.done).length;
      const dailyTotal   = vTasks.filter(t=>t.frequency==='daily').length;
      const weeklyDone   = vTasks.filter(t=>t.frequency==='weekly'&&t.done).length;
      const weeklyTotal  = vTasks.filter(t=>t.frequency==='weekly').length;
      const totalDone    = vTasks.filter(t=>t.done).length;
      const openIssues   = vIssues.filter(i=>i.status==='open');
      const resolvedIssues = vIssues.filter(i=>i.status==='resolved');
      const highIssues   = openIssues.filter(i=>i.priority==='high');

      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate()-7);

      const scoreColor = (venue.score||0)>=85?'#00c896':(venue.score||0)>=70?'#f5a623':'#f24e6e';
      const healthLabel = openIssues.length===0?'Good':highIssues.length>0?'Needs Attention':'Attention Required';
      const healthColor = openIssues.length===0?'#00c896':highIssues.length>0?'#f24e6e':'#f5a623';

      const dailyPct  = dailyTotal>0?Math.round((dailyDone/dailyTotal)*100):0;
      const weeklyPct = weeklyTotal>0?Math.round((weeklyDone/weeklyTotal)*100):0;
      const totalPct  = vTasks.length>0?Math.round((totalDone/vTasks.length)*100):0;

      const openIssueRows = openIssues.map(i=>`
        <tr>
          <td style="color:#1a1a1a;font-weight:600">${i.title}</td>
          <td><span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;background:${i.priority==='high'?'#fee2e2':i.priority==='medium'?'#fef9c3':'#dcfce7'};color:${i.priority==='high'?'#dc2626':i.priority==='medium'?'#ca8a04':'#16a34a'}">${i.priority.toUpperCase()}</span></td>
          <td style="color:#374151">${i.by||'—'}</td>
        </tr>
      `).join('');

      const teamRows = vMembers.map(m=>`
        <tr>
          <td style="color:#1a1a1a;font-weight:600">${m.name}</td>
          <td style="color:#374151">${m.role==='manager'?'Site Manager':m.role.charAt(0).toUpperCase()+m.role.slice(1)}</td>
        </tr>
      `).join('');

      const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background:#ffffff; color:#1a1a1a; padding:40px; font-size:14px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:20px; border-bottom:3px solid #00c896; }
  .brand-name { font-size:26px; font-weight:900; color:#111111; letter-spacing:-0.5px; }
  .brand-sub { font-size:12px; color:#555555; margin-top:3px; font-weight:500; }
  .report-title { font-size:15px; font-weight:700; color:#111111; text-align:right; }
  .report-date { font-size:12px; color:#555555; margin-top:4px; text-align:right; }
  .venue-header { background:#111111; border-radius:12px; padding:24px 28px; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center; }
  .venue-name { font-size:22px; font-weight:800; color:#000; letter-spacing:-0.3px; }
  .venue-sub { font-size:13px; color:#000; margin-top:4px; font-weight:400; }
  .health-badge { display:inline-block; padding:5px 14px; border-radius:99px; font-size:12px; font-weight:700; margin-top:10px; color:${healthColor}; background:${healthColor}22; border:1px solid ${healthColor}66; }
  .venue-score { font-size:42px; font-weight:900; color:${scoreColor}; line-height:1; }
  .score-label { font-size:11px; color:#000; text-align:right; margin-bottom:4px; font-weight:500; }
  .stats-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:12px; margin-bottom:24px; }
  .stat-card { background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:16px; text-align:center; }
  .stat-val { font-size:26px; font-weight:800; line-height:1.1; }
  .stat-label { font-size:11px; color:#6b7280; margin-top:5px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; }
  .section { margin-bottom:24px; }
  .section-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#6b7280; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #e5e7eb; }
  table { width:100%; border-collapse:collapse; }
  th { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#6b7280; text-align:left; padding:8px 12px; border-bottom:2px solid #e5e7eb; background:#f9fafb; }
  td { font-size:13px; padding:11px 12px; border-bottom:1px solid #f3f4f6; }
  tr:last-child td { border-bottom:none; }
  .progress-item { margin-bottom:14px; }
  .progress-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
  .progress-label { font-size:13px; color:#111111; font-weight:600; }
  .progress-pct { font-size:13px; font-weight:700; }
  .progress-bar { background:#e5e7eb; border-radius:99px; height:8px; overflow:hidden; }
  .no-data { text-align:center; color:#000; font-size:13px; padding:20px; background:#f9fafb; border-radius:8px; }
  .footer { margin-top:40px; padding-top:16px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:center; }
  .footer-brand { font-size:13px; font-weight:700; color:#000; }
  .footer-date { font-size:11px; color:#000; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="brand-name">Venues V</div>
    <div class="brand-sub">Venue Operations Platform</div>
  </div>
  <div>
    <div class="report-title">Weekly Performance Report</div>
    <div class="report-date">${weekStart.toLocaleDateString('en-AU')} — ${now.toLocaleDateString('en-AU')}</div>
    <div class="report-date">Prepared by ${user?.name || user?.name || 'Admin'}</div>
  </div>
</div>

<div class="venue-header">
  <div>
    <div class="venue-name">${venue.name}</div>
    <div class="venue-sub">📍 ${venue.suburb}</div>
    <div class="health-badge">${healthLabel}</div>
  </div>
  <div>
    <div class="score-label">Inspection Score</div>
    <div class="venue-score">${venue.score||0}%</div>
  </div>
</div>

<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-val" style="color:#2563eb">${totalPct}%</div>
    <div class="stat-label">Tasks Done</div>
  </div>
  <div class="stat-card">
    <div class="stat-val" style="color:${openIssues.length>0?'#dc2626':'#16a34a'}">${openIssues.length}</div>
    <div class="stat-label">Open Issues</div>
  </div>
  <div class="stat-card">
    <div class="stat-val" style="color:#16a34a">${resolvedIssues.length}</div>
    <div class="stat-label">Resolved</div>
  </div>
  <div class="stat-card">
    <div class="stat-val" style="color:#7c3aed">${vMembers.length}</div>
    <div class="stat-label">Team Members</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Task Completion</div>
  <div class="progress-item">
    <div class="progress-row">
      <span class="progress-label">Daily Tasks</span>
      <span class="progress-pct" style="color:#2563eb">${dailyDone} / ${dailyTotal} &nbsp; (${dailyPct}%)</span>
    </div>
    <div class="progress-bar"><div style="width:${dailyPct}%;height:100%;background:#2563eb;border-radius:99px"></div></div>
  </div>
  <div class="progress-item">
    <div class="progress-row">
      <span class="progress-label">Weekly Tasks</span>
      <span class="progress-pct" style="color:#00c896">${weeklyDone} / ${weeklyTotal} &nbsp; (${weeklyPct}%)</span>
    </div>
    <div class="progress-bar"><div style="width:${weeklyPct}%;height:100%;background:#00c896;border-radius:99px"></div></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Open Issues (${openIssues.length})</div>
  ${openIssues.length>0?`
  <table>
    <thead><tr><th>Issue</th><th>Priority</th><th>Reported By</th></tr></thead>
    <tbody>${openIssueRows}</tbody>
  </table>`:'<div class="no-data">No open issues this week</div>'}
</div>

<div class="section">
  <div class="section-title">Team (${vMembers.length})</div>
  ${vMembers.length>0?`
  <table>
    <thead><tr><th>Name</th><th>Role</th></tr></thead>
    <tbody>${teamRows}</tbody>
  </table>`:'<div class="no-data">No staff assigned</div>'}
</div>

<div class="footer">
  <span class="footer-brand">Venues V — Venue Operations Platform</span>
  <span class="footer-date">Generated ${now.toLocaleString('en-AU')}</span>
</div>

</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html, base64:false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType:'application/pdf',
          dialogTitle:`${venue.name} — Weekly Report`,
          UTI:'com.adobe.pdf',
        });
      }
    } catch(err:any){ console.error(err); }
    setGenerating(null);
  };

  const filteredVenues = venues.filter(v=>
    search.trim()==='' ||
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
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={()=>navigation.goBack()}>
          <Ionicons name="arrow-back" color="#eef0f4" size={22}/>
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.heading}>Reports</Text>
          <Text style={s.sub}>Weekly PDF per venue</Text>
        </View>
      </View>

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

      <FlatList
        data={filteredVenues}
        keyExtractor={item=>item.id}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#00c896"
            colors={['#00c896']}
          />
        }
        ListHeaderComponent={
          <View style={s.infoCard}>
            <Ionicons name="document-text-outline" color="#2c7ef7" size={18}/>
            <Text style={s.infoText}>Generate a branded PDF for any venue. Share via email, WhatsApp or save to Files.</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <Ionicons name="search-outline" color="#3a4252" size={48}/>
            <Text style={s.emptyText}>{search?`No venues matching "${search}"`:'No venues yet'}</Text>
          </View>
        }
        renderItem={({item:venue})=>{
          const vTasks  = tasks.filter(t=>t.venueId===venue.id);
          const vIssues = issues.filter(i=>i.venueId===venue.id&&i.status!=='resolved');
          const done    = vTasks.filter(t=>t.done).length;
          const pct     = vTasks.length?Math.round((done/vTasks.length)*100):0;
          const scoreColor = (venue.score||0)>=85?'#00c896':(venue.score||0)>=70?'#f5a623':'#f24e6e';

          return (
            <View style={s.venueCard}>
              <View style={s.venueTop}>
                <View style={s.venueLeft}>
                  <Text style={s.venueName}>{venue.name}</Text>
                  <Text style={s.venueSuburb}>📍 {venue.suburb}</Text>
                </View>
                <Text style={[s.venueScore,{color:scoreColor}]}>{venue.score||0}%</Text>
              </View>
              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Text style={[s.statVal,{color:'#2c7ef7'}]}>{pct}%</Text>
                  <Text style={s.statLabel}>Tasks Done</Text>
                </View>
                <View style={s.stat}>
                  <Text style={[s.statVal,{color:vIssues.length>0?'#f24e6e':'#00c896'}]}>{vIssues.length}</Text>
                  <Text style={s.statLabel}>Open Issues</Text>
                </View>
                <View style={s.stat}>
                  <Text style={[s.statVal,{color:'#a855f7'}]}>{members.filter(m=>m.venue===venue.name&&m.role!=='owner').length}</Text>
                  <Text style={s.statLabel}>Staff</Text>
                </View>
              </View>
              <TouchableOpacity
                style={s.downloadBtn}
                onPress={()=>generatePDF(venue)}
                disabled={generating===venue.id}
              >
                {generating===venue.id
                  ?<><ActivityIndicator color="#000" size="small"/><Text style={s.downloadBtnText}>Generating...</Text></>
                  :<><Ionicons name="document-text-outline" color="#000" size={16}/><Text style={s.downloadBtnText}>Download PDF Report</Text></>
                }
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:       {flex:1,backgroundColor:'#080a0e'},
  header:          {flexDirection:'row',alignItems:'center',padding:16,gap:10},
  backBtn:         {width:36,height:36,backgroundColor:'#161b24',borderRadius:10,alignItems:'center',justifyContent:'center'},
  headerText:      {flex:1},
  heading:         {fontSize:24,fontWeight:'800',color:'#eef0f4'},
  sub:             {fontSize:12,color:'#6e7a8a',marginTop:1},
  searchBar:       {flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:12,marginHorizontal:16,marginBottom:12},
  searchInput:     {flex:1,color:'#eef0f4',fontSize:14,padding:0},
  scroll:          {padding:16,gap:14},
  infoCard:        {flexDirection:'row',gap:10,alignItems:'flex-start',backgroundColor:'rgba(44,126,247,.1)',borderWidth:1,borderColor:'rgba(44,126,247,.2)',borderRadius:12,padding:14,marginBottom:4},
  infoText:        {flex:1,fontSize:13,color:'#6e7a8a',lineHeight:19},
  emptyWrap:       {alignItems:'center',paddingTop:60,gap:12},
  emptyText:       {fontSize:15,color:'#6e7a8a',fontWeight:'600'},
  venueCard:       {backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:16,padding:16,gap:14},
  venueTop:        {flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},
  venueLeft:       {flex:1},
  venueName:       {fontSize:16,fontWeight:'700',color:'#eef0f4'},
  venueSuburb:     {fontSize:12,color:'#6e7a8a',marginTop:2},
  venueScore:      {fontSize:24,fontWeight:'800'},
  statsRow:        {flexDirection:'row',gap:8},
  stat:            {flex:1,backgroundColor:'#161b24',borderRadius:10,padding:10,alignItems:'center'},
  statVal:         {fontSize:18,fontWeight:'800'},
  statLabel:       {fontSize:10,color:'#6e7a8a',marginTop:2},
  downloadBtn:     {flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#00c896',borderRadius:10,padding:13},
  downloadBtnText: {color:'#000',fontWeight:'700',fontSize:14},
});