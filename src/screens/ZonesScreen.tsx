import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  FlatList, TouchableOpacity, Modal, ActivityIndicator,
  ScrollView, TextInput, Alert
} from 'react-native';
import { supabase } from '../config/supabase';
import { fetchVenuesForUser } from '../config/fetchVenues';
import { useAuth } from '../context/AuthContext';

type ZoneStatus = 'clean' | 'attention' | 'working' | 'issue';

type Zone = {
  id: string;
  name: string;
  icon: string;
  status: ZoneStatus;
  score: number;
  venueId: string;
};

type Venue = { id: string; name: string; ownerId?: string; assignedUids?: string[]; };

const STATUS_CONFIG: Record<ZoneStatus, { label: string; color: string }> = {
  clean:     { label:'✅ Clean',       color:'#00c896' },
  attention: { label:'⚠️ Attention',   color:'#f5a623' },
  working:   { label:'🔄 In Progress', color:'#2c7ef7' },
  issue:     { label:'🔴 Issue Open',  color:'#f24e6e' },
};

const STATUS_OPTIONS: ZoneStatus[] = ['clean', 'attention', 'working', 'issue'];

const ICONS = ['🍺','🌿','🚻','🚹','🎰','🚗','🍽️','🏨','☕','🎵','🚪','🏊','🎭','🚬','📍','🏢','🛒','🧹'];

export default function ZonesScreen() {
  const { user } = useAuth();
  const isOwnerOrManager = user?.role === 'owner' || user?.role === 'manager';
  const canEdit = user?.role === 'owner' || user?.role === 'manager';

  const [venues,   setVenues]   = useState<Venue[]>([]);
  const [zones,    setZones]    = useState<Zone[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Zone | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<string>('all');

  // Edit state
  const [editMode,  setEditMode]  = useState(false);
  const [editName,  setEditName]  = useState('');
  const [editIcon,  setEditIcon]  = useState('📍');
  const [saving,    setSaving]    = useState(false);

  // Add zone state
  const [addModal,    setAddModal]    = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneIcon, setNewZoneIcon] = useState('📍');
  const [newVenueId,  setNewVenueId]  = useState('');

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const venuesData = await fetchVenuesForUser(user.uid, user.role) as Venue[];
      
      setVenues(venuesData);
      if (venuesData.length > 0 && !newVenueId) setNewVenueId(venuesData[0].id);

      if (venuesData.length > 0) {
        const venueIds = venuesData.map(v => v.id).slice(0, 30);
        const { data: zonesData } = await supabase
          .from('zones')
          .select('*')
          .in('venueId', venueIds);
          
        setZones((zonesData || []) as Zone[]);
      } else {
        setZones([]);
      }
    } catch (err) {
      console.log('Error fetching zones data:', err);
    } finally {
      setLoading(false);
    }
  }, [user, newVenueId]);

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('zones_changes')
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



  const updateStatus = async (id: string, status: ZoneStatus) => {
    await supabase.from('zones').update({ status }).eq('id', id);
    setSelected(prev => prev ? { ...prev, status } : null);
  };

  const saveEdit = async () => {
    if (!editName) { Alert.alert('Missing', 'Please enter zone name.'); return; }
    setSaving(true);
    await supabase.from('zones').update({ name: editName, icon: editIcon }).eq('id', selected!.id);
    setSelected(prev => prev ? { ...prev, name: editName, icon: editIcon } : null);
    setEditMode(false);
    setSaving(false);
  };

  const deleteZone = async () => {
    Alert.alert('Delete Zone', `Delete "${selected?.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('zones').delete().eq('id', selected!.id);
        setSelected(null);
        setEditMode(false);
      }},
    ]);
  };

  const addZone = async () => {
    if (!newZoneName) { Alert.alert('Missing', 'Please enter zone name.'); return; }
    setSaving(true);
    await supabase.from('zones').insert([{
      name: newZoneName,
      icon: newZoneIcon,
      status: 'clean',
      score: 100,
      venueId: newVenueId
    }]);
    setAddModal(false);
    setNewZoneName('');
    setNewZoneIcon('📍');
    setSaving(false);
  };

  const filteredZones = selectedVenue === 'all'
    ? zones
    : zones.filter(z => z.venueId === selectedVenue);

  const summary = {
    clean:     filteredZones.filter(z => z.status === 'clean').length,
    attention: filteredZones.filter(z => z.status === 'attention' || z.status === 'issue').length,
    working:   filteredZones.filter(z => z.status === 'working').length,
  };

  const getVenueName = (venueId: string) =>
    venues.find(v => v.id === venueId)?.name || venueId;

  if (loading) return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator color="#00c896" style={{ marginTop:100 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Zones</Text>
          <Text style={styles.sub}>{isOwnerOrManager ? 'All venues' : user?.venue}</Text>
        </View>
        {canEdit && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setAddModal(true)}>
            <Text style={styles.addBtnText}>＋ Add Zone</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Venue tabs */}
      {isOwnerOrManager && venues.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.venueTabsWrap} contentContainerStyle={styles.venueTabs}>
          <TouchableOpacity style={[styles.venueTab, selectedVenue==='all'&&styles.venueTabActive]} onPress={()=>setSelectedVenue('all')}>
            <Text style={[styles.venueTabText, selectedVenue==='all'&&styles.venueTabTextActive]}>All</Text>
          </TouchableOpacity>
          {venues.map(v => (
            <TouchableOpacity key={v.id} style={[styles.venueTab, selectedVenue===v.id&&styles.venueTabActive]} onPress={()=>setSelectedVenue(v.id)}>
              <Text style={[styles.venueTabText, selectedVenue===v.id&&styles.venueTabTextActive]}>{v.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, {borderTopColor:'#00c896'}]}>
          <Text style={[styles.summaryVal, {color:'#00c896'}]}>{summary.clean}</Text>
          <Text style={styles.summaryLabel}>Clean</Text>
        </View>
        <View style={[styles.summaryCard, {borderTopColor:'#f5a623'}]}>
          <Text style={[styles.summaryVal, {color:'#f5a623'}]}>{summary.attention}</Text>
          <Text style={styles.summaryLabel}>Needs Action</Text>
        </View>
        <View style={[styles.summaryCard, {borderTopColor:'#2c7ef7'}]}>
          <Text style={[styles.summaryVal, {color:'#2c7ef7'}]}>{summary.working}</Text>
          <Text style={styles.summaryLabel}>In Progress</Text>
        </View>
      </View>

      {/* Zone grid */}
      <FlatList
        data={filteredZones}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={<Text style={styles.empty}>No zones found</Text>}
        renderItem={({ item }) => {
          const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.clean;
          return (
            <TouchableOpacity
              style={[styles.zoneCard, {borderLeftColor: cfg.color}]}
              onPress={() => { setSelected(item); setEditMode(false); setEditName(item.name); setEditIcon(item.icon); }}
            >
              <Text style={styles.zoneIcon}>{item.icon || '📍'}</Text>
              <Text style={styles.zoneName}>{item.name}</Text>
              <Text style={[styles.zoneStatus, {color: cfg.color}]}>{cfg.label}</Text>
              {isOwnerOrManager && (
                <Text style={styles.zoneVenue}>🏢 {getVenueName(item.venueId)}</Text>
              )}
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Score</Text>
                <Text style={[styles.scoreVal, {color: cfg.color}]}>{item.score||0}%</Text>
              </View>
              <View style={styles.scoreBar}>
                <View style={[styles.scoreFill, {width:`${item.score||0}%` as any, backgroundColor: cfg.color}]} />
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Zone detail / edit modal */}
      <Modal visible={!!selected} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {selected && (
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                {/* Modal header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {editMode ? '✏️ Edit Zone' : `${selected.icon} ${selected.name}`}
                  </Text>
                  <TouchableOpacity onPress={() => { setSelected(null); setEditMode(false); }}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                {!editMode ? (
                  <>
                    <Text style={[styles.modalStatus, {color: STATUS_CONFIG[selected.status].color}]}>
                      {STATUS_CONFIG[selected.status].label}
                    </Text>
                    <Text style={styles.modalScore}>Score: {selected.score}%</Text>
                    <Text style={styles.modalVenue}>🏢 {getVenueName(selected.venueId)}</Text>

                    <Text style={styles.sectionLabel}>UPDATE STATUS</Text>
                    <View style={styles.statusGrid}>
                      {STATUS_OPTIONS.map(opt => {
                        const cfg = STATUS_CONFIG[opt];
                        return (
                          <TouchableOpacity
                            key={opt}
                            style={[styles.statusOption, selected.status===opt && {borderColor:cfg.color, backgroundColor:`${cfg.color}11`}]}
                            onPress={() => updateStatus(selected.id, opt)}
                          >
                            <Text style={[styles.statusOptionText, selected.status===opt && {color:cfg.color}]}>{cfg.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {canEdit && (
                      <View style={styles.actionRow}>
                        <TouchableOpacity style={styles.editBtn} onPress={() => setEditMode(true)}>
                          <Text style={styles.editBtnText}>Edit Zone</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={deleteZone}>
                          <Text style={styles.deleteBtnText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                      <Text style={styles.closeBtnText}>Close</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.sectionLabel}>ZONE NAME</Text>
                    <TextInput
                      style={styles.input}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Zone name"
                      placeholderTextColor="#6e7a8a"
                    />

                    <Text style={styles.sectionLabel}>ICON</Text>
                    <View style={styles.iconGrid}>
                      {ICONS.map(ic => (
                        <TouchableOpacity
                          key={ic}
                          style={[styles.iconOption, editIcon===ic && styles.iconOptionActive]}
                          onPress={() => setEditIcon(ic)}
                        >
                          <Text style={styles.iconText}>{ic}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.actionRow}>
                      <TouchableOpacity style={styles.cancelEditBtn} onPress={() => setEditMode(false)}>
                        <Text style={styles.cancelEditText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.saveBtn} onPress={saveEdit} disabled={saving}>
                        {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Zone Modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>➕ Add New Zone</Text>
                <TouchableOpacity onPress={() => setAddModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              {venues.length > 1 && (
                <>
                  <Text style={styles.sectionLabel}>VENUE</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:16}}>
                    {venues.map(v => (
                      <TouchableOpacity
                        key={v.id}
                        style={[styles.chip, newVenueId===v.id && styles.chipActive]}
                        onPress={() => setNewVenueId(v.id)}
                      >
                        <Text style={[styles.chipText, newVenueId===v.id && styles.chipTextActive]}>{v.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={styles.sectionLabel}>ZONE NAME</Text>
              <TextInput
                style={styles.input}
                value={newZoneName}
                onChangeText={setNewZoneName}
                placeholder="e.g. Function Room"
                placeholderTextColor="#6e7a8a"
              />

              <Text style={styles.sectionLabel}>ICON</Text>
              <View style={styles.iconGrid}>
                {ICONS.map(ic => (
                  <TouchableOpacity
                    key={ic}
                    style={[styles.iconOption, newZoneIcon===ic && styles.iconOptionActive]}
                    onPress={() => setNewZoneIcon(ic)}
                  >
                    <Text style={styles.iconText}>{ic}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.cancelEditBtn} onPress={() => setAddModal(false)}>
                  <Text style={styles.cancelEditText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={addZone} disabled={saving}>
                  {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Add Zone</Text>}
                </TouchableOpacity>
              </View>
              <View style={{height:20}} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:          { flex:1, backgroundColor:'#080a0e' },
  header:             { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:24, paddingBottom:12 },
  heading:            { fontSize:28, fontWeight:'800', color:'#eef0f4' },
  sub:                { fontSize:13, color:'#6e7a8a', marginTop:2 },
  addBtn:             { backgroundColor:'#00c896', paddingHorizontal:14, paddingVertical:8, borderRadius:9 },
  addBtnText:         { color:'#000', fontWeight:'700', fontSize:13 },
  venueTabsWrap:      { maxHeight:44, marginBottom:8 },
  venueTabs:          { paddingHorizontal:24, gap:8 },
  venueTab:           { paddingHorizontal:14, paddingVertical:7, borderRadius:99, backgroundColor:'#161b24', borderWidth:1, borderColor:'rgba(255,255,255,.07)' },
  venueTabActive:     { backgroundColor:'#00c896', borderColor:'#00c896' },
  venueTabText:       { fontSize:12, color:'#6e7a8a', fontWeight:'600' },
  venueTabTextActive: { color:'#000' },
  summaryRow:         { flexDirection:'row', paddingHorizontal:24, gap:10, marginBottom:16 },
  summaryCard:        { flex:1, backgroundColor:'#0f1218', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderTopWidth:2, borderRadius:12, padding:12, alignItems:'center' },
  summaryVal:         { fontSize:22, fontWeight:'800' },
  summaryLabel:       { fontSize:11, color:'#6e7a8a', marginTop:3 },
  grid:               { padding:24, paddingTop:0, gap:12 },
  row:                { gap:12 },
  empty:              { textAlign:'center', color:'#6e7a8a', marginTop:40, fontSize:13 },
  zoneCard:           { flex:1, backgroundColor:'#0f1218', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderLeftWidth:3, borderRadius:14, padding:14, gap:4 },
  zoneIcon:           { fontSize:24, marginBottom:4 },
  zoneName:           { fontSize:14, fontWeight:'700', color:'#eef0f4' },
  zoneStatus:         { fontSize:12, fontWeight:'600' },
  zoneVenue:          { fontSize:10, color:'#3a4252' },
  scoreRow:           { flexDirection:'row', justifyContent:'space-between', marginTop:6 },
  scoreLabel:         { fontSize:11, color:'#6e7a8a' },
  scoreVal:           { fontSize:11, fontWeight:'700' },
  scoreBar:           { height:3, backgroundColor:'rgba(255,255,255,.07)', borderRadius:2, overflow:'hidden' },
  scoreFill:          { height:'100%', borderRadius:2 },
  modalOverlay:       { flex:1, backgroundColor:'rgba(0,0,0,.75)', justifyContent:'flex-end' },
  modalBox:           { backgroundColor:'#0f1218', borderTopLeftRadius:20, borderTopRightRadius:20, padding:24, maxHeight:'88%' },
  modalHeader:        { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  modalTitle:         { fontSize:18, fontWeight:'800', color:'#eef0f4' },
  modalClose:         { fontSize:18, color:'#6e7a8a', padding:4 },
  modalStatus:        { fontSize:14, fontWeight:'600', marginBottom:4 },
  modalScore:         { fontSize:13, color:'#6e7a8a', marginBottom:2 },
  modalVenue:         { fontSize:12, color:'#3a4252', marginBottom:16 },
  sectionLabel:       { fontSize:11, fontWeight:'600', color:'#6e7a8a', letterSpacing:.5, marginBottom:10, marginTop:8 },
  statusGrid:         { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:16 },
  statusOption:       { width:'47%', backgroundColor:'#161b24', borderWidth:1.5, borderColor:'rgba(255,255,255,.07)', borderRadius:10, padding:12, alignItems:'center' },
  statusOptionText:   { fontSize:13, color:'#6e7a8a', fontWeight:'600' },
  actionRow:          { flexDirection:'row', gap:10, marginTop:8 },
  editBtn:            { flex:1, backgroundColor:'rgba(44,126,247,.1)', borderWidth:1, borderColor:'rgba(44,126,247,.3)', borderRadius:10, padding:12, alignItems:'center' },
  editBtnText:        { color:'#2c7ef7', fontWeight:'700', fontSize:13 },
  deleteBtn:          { flex:1, backgroundColor:'rgba(242,78,110,.1)', borderWidth:1, borderColor:'rgba(242,78,110,.3)', borderRadius:10, padding:12, alignItems:'center' },
  deleteBtnText:      { color:'#f24e6e', fontWeight:'700', fontSize:13 },
  closeBtn:           { backgroundColor:'rgba(255,255,255,.05)', borderWidth:1, borderColor:'rgba(255,255,255,.1)', borderRadius:10, padding:13, alignItems:'center', marginTop:8 },
  closeBtnText:       { color:'#6e7a8a', fontWeight:'600' },
  input:              { backgroundColor:'#161b24', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderRadius:10, padding:13, color:'#eef0f4', fontSize:14, marginBottom:8 },
  iconGrid:           { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:16 },
  iconOption:         { width:44, height:44, borderRadius:10, backgroundColor:'#161b24', borderWidth:1.5, borderColor:'rgba(255,255,255,.07)', alignItems:'center', justifyContent:'center' },
  iconOptionActive:   { borderColor:'#00c896', backgroundColor:'rgba(0,200,150,.1)' },
  iconText:           { fontSize:22 },
  cancelEditBtn:      { flex:1, backgroundColor:'transparent', borderWidth:1, borderColor:'rgba(255,255,255,.1)', borderRadius:10, padding:12, alignItems:'center' },
  cancelEditText:     { color:'#6e7a8a', fontWeight:'600' },
  saveBtn:            { flex:1, backgroundColor:'#00c896', borderRadius:10, padding:12, alignItems:'center' },
  saveBtnText:        { color:'#000', fontWeight:'700', fontSize:14 },
  chip:               { backgroundColor:'#161b24', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderRadius:99, paddingHorizontal:14, paddingVertical:7, marginRight:8 },
  chipActive:         { borderColor:'#00c896', backgroundColor:'rgba(0,200,150,.1)' },
  chipText:           { fontSize:12, color:'#6e7a8a', fontWeight:'500' },
  chipTextActive:     { color:'#00c896', fontWeight:'700' },
});