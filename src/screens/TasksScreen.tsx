import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Modal, TextInput, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, FlatList
} from 'react-native';
import { supabase } from '../config/supabase';
import { fetchVenuesForUser } from '../config/fetchVenues';
import { getVenueTeamMembers } from '../config/teamApi';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../theme/tokens';
import AIInsightCard from '../components/ui/AIInsightCard';
import { useAIInsight } from '../hooks/useAIInsight';
import { useNavigation } from '@react-navigation/native';
import { notifyTaskCreated } from '../config/notifications';
import { RefreshControl } from 'react-native';

type Frequency = 'daily' | 'weekly' | 'once';
type Priority  = 'high' | 'medium' | 'low';

type Task = {
  id: string; title: string; zone: string;
  frequency: Frequency; priority: Priority;
  icon: string; done: boolean; assignedTo: string; venueId: string;
};

type Venue = { id: string; name: string; ownerId?: string; assignedUids?: string[]; };

const PRIORITY_COLOR: Record<Priority, string> = {
  high:'#f24e6e', medium:'#f5a623', low:'#00c896',
};

const FREQ_CONFIG: Record<Frequency, { label:string; color:string }> = {
  daily:  { label:'Daily',   color:'#2c7ef7' },
  weekly: { label:'Weekly',  color:'#a855f7' },
  once:   { label:'One-off', color:'#f5a623' },
};

async function getVenueTokens(_callerUid: string, venueId: string): Promise<string[]> {
  try {
    const members = await getVenueTeamMembers(venueId);
    return members
      .map((member) => member.expoPushToken)
      .filter((token): token is string => typeof token === 'string' && token.startsWith('ExponentPushToken'));
  } catch {
    return [];
  }
}

const ZONES = ['All Areas','Front Bar','Beer Garden','Restrooms','Gaming Room','Carpark','Kitchen Entry','External'];
const ICONS  = ['🧹','🪣','🚻','🗑️','🧴','🎰','🚗','🍺','🌿','🍽️','🪟','🚿','🛒','📦','🧽'];

export default function TasksScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const isManager = user?.role === 'manager';
  const isCleaner = user?.role === 'cleaner';
  const [refreshing, setRefreshing] = useState(false);
  const { insight: aiInsight } = useAIInsight('tasks', undefined, [venues.length]);

  const [venues,      setVenues]     = useState<Venue[]>([]);
  const [tasks,       setTasks]      = useState<Task[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [activeVenue, setActiveVenue]= useState<string>('');
  const [activeFreq,  setActiveFreq] = useState<Frequency|'all'>('all');
  const venueScrollRef = React.useRef<ScrollView>(null);

  const [addModal, setAddModal] = useState(false);
  const [editTask, setEditTask] = useState<Task|null>(null);
  const [saving,   setSaving]   = useState(false);
  const [fTitle,   setFTitle]   = useState('');
  const [fZone,    setFZone]    = useState(ZONES[0]);
  const [fFreq,    setFFreq]    = useState<Frequency>('daily');
  const [fPrio,    setFPrio]    = useState<Priority>('medium');
  const [fIcon,    setFIcon]    = useState('🧹');

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const venuesData = await fetchVenuesForUser(user.uid, user.role) as Venue[];
      
      setVenues(venuesData);
      if (venuesData.length > 0 && !activeVenue) setActiveVenue(venuesData[0].id);

      if (venuesData.length > 0) {
        const venueIds = venuesData.map(v => v.id).slice(0, 30);
        const { data: tasksData } = await supabase
          .from('tasks')
          .select('*')
          .in('venueId', venueIds)
          .order('created_at', { ascending: false });
          
        setTasks((tasksData || []) as Task[]);
      } else {
        setTasks([]);
      }
    } catch (err) {
      console.log('Error fetching tasks data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, activeVenue]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('tasks_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      fetchData();
    });
    return unsub;
  }, [navigation, fetchData]);



  const completeTask   = async (id:string) => {
    await supabase.from('tasks').update({ done: true }).eq('id', id);
  };
  const uncompleteTask = async (id:string) => {
    await supabase.from('tasks').update({ done: false }).eq('id', id);
  };

  const deleteTask = (t:Task) => {
    Alert.alert('Delete Task',`Delete "${t.title}"?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress: async () => {
        await supabase.from('tasks').delete().eq('id', t.id);
      }},
    ]);
  };

  const openAdd = () => {
    setFTitle('');setFZone(ZONES[0]);setFFreq('daily');setFPrio('medium');setFIcon('🧹');
    setEditTask(null);setAddModal(true);
  };

  const openEdit = (t:Task) => {
    setFTitle(t.title);setFZone(t.zone);setFFreq(t.frequency);setFPrio(t.priority);setFIcon(t.icon);
    setEditTask(t);setAddModal(true);
  };

  const saveTask = async () => {
    if (!fTitle){Alert.alert('Missing','Please enter task title.');return;}
    setSaving(true);
    try {
      if (editTask) {
        await supabase.from('tasks').update({
          title:fTitle, zone:fZone, frequency:fFreq, priority:fPrio, icon:fIcon
        }).eq('id', editTask.id);
      } else {
        await supabase.from('tasks').insert([{
          title:fTitle, zone:fZone, frequency:fFreq, priority:fPrio, icon:fIcon,
          done:false, "assignedTo":null, venueId:activeVenue
        }]);
      }
      setAddModal(false);
      
      if (!editTask) {
        const taskTokens = await getVenueTokens(user?.uid||'', activeVenue);
        await notifyTaskCreated(taskTokens, fTitle, currentVenue?.name||'', user?.name||user?.name||'');
      }
    } catch(err:any){Alert.alert('Error',err.message);}
    setSaving(false);
  };

  const venueTasks = tasks.filter(t=>t.venueId===activeVenue);
  const shown = activeFreq==='all' ? venueTasks : venueTasks.filter(t=>t.frequency===activeFreq);

  const dailyDone   = venueTasks.filter(t=>t.frequency==='daily'&&t.done).length;
  const dailyTotal  = venueTasks.filter(t=>t.frequency==='daily').length;
  const weeklyDone  = venueTasks.filter(t=>t.frequency==='weekly'&&t.done).length;
  const weeklyTotal = venueTasks.filter(t=>t.frequency==='weekly').length;
  const onceDone    = venueTasks.filter(t=>t.frequency==='once'&&t.done).length;
  const onceTotal   = venueTasks.filter(t=>t.frequency==='once').length;

  const currentVenue = venues.find(v=>v.id===activeVenue);

  if (loading) return (
    <SafeAreaView style={s.container}>
      <ActivityIndicator color="#00c896" style={{marginTop:100}}/>
    </SafeAreaView>
  );

  const Header = (
    <View>
      {aiInsight && <View style={{paddingHorizontal:20, marginBottom:12}}><AIInsightCard title={aiInsight.title} message={aiInsight.message} actionLabel={aiInsight.actionLabel} type={aiInsight.type} /></View>}

      {/* Venue tabs */}
      {venues.length > 1 && (
        <ScrollView ref={venueScrollRef} horizontal showsHorizontalScrollIndicator={false}
          style={s.venueTabsWrap} contentContainerStyle={s.venueTabs}>
          {venues.map(v=>(
            <TouchableOpacity key={v.id}
              style={[s.venueTab, activeVenue===v.id&&s.venueTabActive]}
              onPress={()=>{
                setActiveVenue(v.id);
                const idx=venues.findIndex(x=>x.id===v.id);
                venueScrollRef.current?.scrollTo({x:idx*160,animated:true});
              }}>
              <Text style={[s.venueTabText, activeVenue===v.id&&s.venueTabTextActive]}>{v.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Progress cards */}
      <View style={s.progressRow}>
        {([['Daily',dailyDone,dailyTotal,'#2c7ef7','daily'],['Weekly',weeklyDone,weeklyTotal,'#a855f7','weekly'],['One-off',onceDone,onceTotal,'#f5a623','once']] as [string,number,number,string,string][]).map(([label,done,total,color,key])=>(
          <TouchableOpacity key={key}
            style={[s.progressCard, activeFreq===key&&{borderColor:color,backgroundColor:color+'12'}]}
            onPress={()=>setActiveFreq(activeFreq===key?'all':key as Frequency)}>
            <Text style={[s.progressVal,{color}]}>{done}/{total}</Text>
            <Text style={s.progressLabel}>{label}</Text>
            <View style={s.progressBarSmall}>
              <View style={[s.progressFillSmall,{width:total>0?`${Math.round((done/total)*100)}%` as any:'0%',backgroundColor:color}]}/>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Freq filter */}
      <View style={s.freqRow}>
        {([['all','All'],['daily','Daily'],['weekly','Weekly'],['once','One-off']] as [string,string][]).map(([v,l])=>(
          <TouchableOpacity key={v} style={[s.freqTab,activeFreq===v&&s.freqTabActive]}
            onPress={()=>setActiveFreq(v as Frequency|'all')}>
            <Text style={[s.freqTabText,activeFreq===v&&s.freqTabTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.heading}>Tasks</Text>
          <Text style={s.sub}>{currentVenue?.name||'Loading...'}</Text>
        </View>
        {isManager&&(
          <TouchableOpacity style={s.addBtn} onPress={openAdd}>
            <Ionicons name="add" color="#000" size={20}/>
            <Text style={s.addBtnText}>Add Task</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={shown}
        keyExtractor={item=>item.id}
        ListHeaderComponent={Header}
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
            <Text style={s.emptyText}>No tasks here</Text>
            {isManager&&<Text style={s.emptySub}>Tap Add Task to create one.</Text>}
          </View>
        }
        renderItem={({item:t})=>{
          const isTaskManager = isManager || user?.role === 'owner';
          const freqColor = FREQ_CONFIG[t.frequency].color;
          return (
            <View style={[s.taskCard, t.done&&s.taskDone, {borderLeftColor:t.done?'#3a4252':freqColor}]}>
              <TouchableOpacity style={[s.checkbox, t.done&&s.checkboxDone]} onPress={()=>t.done?uncompleteTask(t.id):completeTask(t.id)}>
                {t.done&&<Ionicons name="checkmark" color="#000" size={14}/>}
              </TouchableOpacity>
              <View style={s.taskContent}>
                <View style={s.taskTitleRow}>
                  <Text style={s.taskIcon}>{t.icon}</Text>
                  <Text style={[s.taskTitle, t.done&&s.taskTitleDone]}>{t.title}</Text>
                </View>
                <View style={s.taskMeta}>
                  <View style={[s.freqBadge,{backgroundColor:freqColor+'22'}]}>
                    <Text style={[s.freqBadgeText,{color:freqColor}]}>{FREQ_CONFIG[t.frequency].label}</Text>
                  </View>
                  {t.priority==='high'&&<View style={[s.prioBadge,{backgroundColor:PRIORITY_COLOR.high+'22'}]}><Text style={[s.prioBadgeText,{color:PRIORITY_COLOR.high}]}>HIGH</Text></View>}
                  <Text style={s.metaText}>📍 {t.zone}</Text>
                </View>
              </View>
              {isTaskManager && (
                <View style={s.taskActions}>
                  <TouchableOpacity style={s.editBtn} onPress={()=>openEdit(t)}>
                    <Ionicons name="pencil-outline" color="#2c7ef7" size={15}/>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.delBtn} onPress={()=>deleteTask(t)}>
                    <Ionicons name="trash-outline" color="#f24e6e" size={15}/>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>{editTask?'✏️ Edit Task':'➕ New Task'}</Text>
                  <TouchableOpacity onPress={()=>setAddModal(false)}>
                    <Text style={s.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.fieldLabel}>FREQUENCY</Text>
                <View style={s.threeRow}>
                  {(['daily','weekly','once'] as Frequency[]).map(f=>(
                    <TouchableOpacity key={f} style={[s.freqOpt,fFreq===f&&{borderColor:FREQ_CONFIG[f].color,backgroundColor:FREQ_CONFIG[f].color+'18'}]} onPress={()=>setFFreq(f)}>
                      <Text style={[s.freqOptText,fFreq===f&&{color:FREQ_CONFIG[f].color}]}>{FREQ_CONFIG[f].label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.fieldLabel}>PRIORITY</Text>
                <View style={s.threeRow}>
                  {(['high','medium','low'] as Priority[]).map(p=>(
                    <TouchableOpacity key={p} style={[s.freqOpt,fPrio===p&&{borderColor:PRIORITY_COLOR[p],backgroundColor:PRIORITY_COLOR[p]+'18'}]} onPress={()=>setFPrio(p)}>
                      <Text style={[s.freqOptText,fPrio===p&&{color:PRIORITY_COLOR[p]}]}>{p.charAt(0).toUpperCase()+p.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.fieldLabel}>ZONE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:14}}>
                  {ZONES.map(z=>(
                    <TouchableOpacity key={z} style={[s.chip,fZone===z&&s.chipActive]} onPress={()=>setFZone(z)}>
                      <Text style={[s.chipText,fZone===z&&s.chipTextActive]}>{z}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={s.fieldLabel}>ICON</Text>
                <View style={s.iconGrid}>
                  {ICONS.map(ic=>(
                    <TouchableOpacity key={ic} style={[s.iconOpt,fIcon===ic&&s.iconOptActive]} onPress={()=>setFIcon(ic)}>
                      <Text style={s.iconTxt}>{ic}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.fieldLabel}>TASK TITLE</Text>
                <TextInput style={s.input} value={fTitle} onChangeText={setFTitle} placeholder="e.g. Vacuum all areas" placeholderTextColor="#6e7a8a"/>

                <View style={s.twoBtn}>
                  <TouchableOpacity style={s.cancelBtn} onPress={()=>setAddModal(false)}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.saveBtn} onPress={saveTask} disabled={saving}>
                    {saving?<ActivityIndicator color="#000"/>:<Text style={s.saveBtnText}>{editTask?'Save Changes':'Add Task'}</Text>}
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
  container:          {flex:1,backgroundColor:'#080a0e'},
  header:             {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:20,paddingBottom:10},
  heading:            {fontSize:26,fontWeight:'800',color:'#eef0f4'},
  sub:                {fontSize:12,color:'#6e7a8a',marginTop:2},
  addBtn:             {flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'#00c896',paddingHorizontal:14,paddingVertical:9,borderRadius:9},
  addBtnText:         {color:'#000',fontWeight:'700',fontSize:13},
  venueTabsWrap:      {height:44,marginBottom:0},
  venueTabs:          {paddingHorizontal:20,gap:8,alignItems:'center'},
  venueTab:           {height:34,paddingHorizontal:14,borderRadius:99,backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',justifyContent:'center'},
  venueTabActive:     {backgroundColor:'#00c896',borderColor:'#00c896'},
  venueTabText:       {fontSize:12,color:'#6e7a8a',fontWeight:'600'},
  venueTabTextActive: {color:'#000'},
  progressRow:        {flexDirection:'row',paddingHorizontal:20,gap:10,marginTop:12,marginBottom:12},
  progressCard:       {flex:1,backgroundColor:'#0f1218',borderWidth:1.5,borderColor:'rgba(255,255,255,.07)',borderRadius:12,padding:10,gap:4},
  progressVal:        {fontSize:16,fontWeight:'800'},
  progressLabel:      {fontSize:10,color:'#6e7a8a'},
  progressBarSmall:   {height:3,backgroundColor:'rgba(255,255,255,.07)',borderRadius:2,overflow:'hidden',marginTop:2},
  progressFillSmall:  {height:'100%',borderRadius:2},
  freqRow:            {flexDirection:'row',paddingHorizontal:20,gap:6,marginBottom:10},
  freqTab:            {paddingHorizontal:14,paddingVertical:6,borderRadius:99,backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)'},
  freqTabActive:      {backgroundColor:'#00c896',borderColor:'#00c896'},
  freqTabText:        {fontSize:12,color:'#6e7a8a',fontWeight:'600'},
  freqTabTextActive:  {color:'#000'},
  list:               {paddingHorizontal:20,paddingBottom:20,gap:8},
  emptyWrap:          {alignItems:'center',paddingTop:40},
  emptyText:          {fontSize:15,fontWeight:'700',color:'#6e7a8a'},
  emptySub:           {fontSize:12,color:'#3a4252',marginTop:6},
  taskCard:           {backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderLeftWidth:3,borderRadius:12,padding:14,flexDirection:'row',alignItems:'center',gap:10},
  taskDone:           {opacity:0.5},
  checkbox:           {width:22,height:22,borderRadius:11,borderWidth:2,borderColor:'#3a4252',alignItems:'center',justifyContent:'center',flexShrink:0},
  checkboxDone:       {backgroundColor:'#00c896',borderColor:'#00c896'},
  taskContent:        {flex:1,gap:6},
  taskTitleRow:       {flexDirection:'row',alignItems:'center',gap:6},
  taskIcon:           {fontSize:16},
  taskTitle:          {fontSize:13,fontWeight:'600',color:'#eef0f4',flex:1},
  taskTitleDone:      {textDecorationLine:'line-through',color:'#6e7a8a'},
  taskMeta:           {flexDirection:'row',flexWrap:'wrap',gap:6,alignItems:'center'},
  freqBadge:          {paddingHorizontal:7,paddingVertical:2,borderRadius:99},
  freqBadgeText:      {fontSize:10,fontWeight:'700'},
  prioBadge:          {paddingHorizontal:7,paddingVertical:2,borderRadius:99},
  prioBadgeText:      {fontSize:10,fontWeight:'700'},
  metaText:           {fontSize:11,color:'#6e7a8a'},
  taskActions:        {flexDirection:'row',gap:6},
  editBtn:            {backgroundColor:'rgba(44,126,247,.1)',borderWidth:1,borderColor:'rgba(44,126,247,.3)',borderRadius:7,padding:7},
  delBtn:             {backgroundColor:'rgba(242,78,110,.1)',borderWidth:1,borderColor:'rgba(242,78,110,.3)',borderRadius:7,padding:7},
  modalOverlay:       {flex:1,justifyContent:'flex-end'},
  modalBox:           {backgroundColor:'#0f1218',borderTopLeftRadius:20,borderTopRightRadius:20,padding:24,maxHeight:'90%'},
  modalHeader:        {flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16},
  modalTitle:         {fontSize:18,fontWeight:'800',color:'#eef0f4'},
  modalClose:         {fontSize:18,color:'#6e7a8a',padding:4},
  fieldLabel:         {fontSize:11,fontWeight:'600',color:'#6e7a8a',letterSpacing:.5,marginBottom:8},
  threeRow:           {flexDirection:'row',gap:8,marginBottom:14},
  freqOpt:            {flex:1,backgroundColor:'#161b24',borderWidth:1.5,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:10,alignItems:'center'},
  freqOptText:        {fontSize:12,color:'#6e7a8a',fontWeight:'600'},
  chip:               {backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:99,paddingHorizontal:14,paddingVertical:7,marginRight:8},
  chipActive:         {borderColor:'#00c896',backgroundColor:'rgba(0,200,150,.1)'},
  chipText:           {fontSize:12,color:'#6e7a8a'},
  chipTextActive:     {color:'#00c896',fontWeight:'700'},
  iconGrid:           {flexDirection:'row',flexWrap:'wrap',gap:7,marginBottom:14},
  iconOpt:            {width:42,height:42,borderRadius:9,backgroundColor:'#161b24',borderWidth:1.5,borderColor:'rgba(255,255,255,.07)',alignItems:'center',justifyContent:'center'},
  iconOptActive:      {borderColor:'#00c896',backgroundColor:'rgba(0,200,150,.1)'},
  iconTxt:            {fontSize:22},
  input:              {backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:13,color:'#eef0f4',fontSize:14,marginBottom:14},
  twoBtn:             {flexDirection:'row',gap:10},
  cancelBtn:          {flex:1,backgroundColor:'transparent',borderWidth:1,borderColor:'rgba(255,255,255,.1)',borderRadius:10,padding:13,alignItems:'center'},
  cancelBtnText:      {color:'#6e7a8a',fontWeight:'600'},
  saveBtn:            {flex:1,backgroundColor:'#00c896',borderRadius:10,padding:13,alignItems:'center'},
  saveBtnText:        {color:'#000',fontWeight:'700',fontSize:14},
});