import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { Colors, Radius } from '../theme/tokens';

const SYNC_VENUE_COUNT_API = 'https://www.venuesv.com/api/sync-venue-count';
const TRIAL_VENUE_LIMIT = 2;

const VENUE_TYPES = [
  { id: 'pub', label: 'Pub / Hotel', emoji: '🍺' },
  { id: 'club', label: 'Nightclub', emoji: '🪩' },
  { id: 'restaurant', label: 'Restaurant', emoji: '🍽️' },
  { id: 'cafe', label: 'Cafe', emoji: '☕' },
  { id: 'sports', label: 'Sports Club', emoji: '🏏' },
  { id: 'other', label: 'Other', emoji: '🏢' },
];

const ZONES_PRESETS: Record<string, string[]> = {
  pub: ['Front Bar', 'Beer Garden', 'Gaming Room', 'Restrooms', 'Carpark'],
  club: ['Main Floor', 'Bar Area', 'Restrooms', 'Smoking Area', 'Entry'],
  restaurant: ['Dining Area', 'Kitchen Entry', 'Restrooms', 'Outdoor Seating'],
  cafe: ['Main Area', 'Counter', 'Restrooms', 'Outdoor Seating'],
  sports: ['Main Bar', 'Function Room', 'Restrooms', 'Locker Rooms', 'Carpark'],
  other: ['Main Area', 'Restrooms', 'Entry', 'Staff Area'],
};

export default function AddVenueScreen() {
  const { user, isLocked, trialDaysLeft } = useAuth();
  const navigation = useNavigation<any>();
  const [name, setName] = useState('');
  const [suburb, setSuburb] = useState('');
  const [type, setType] = useState('pub');
  const [saving, setSaving] = useState(false);
  const [resolvingOwner, setResolvingOwner] = useState(false);
  const [managerOwnerId, setManagerOwnerId] = useState<string | null>(null);
  const [managerExistingVenueId, setManagerExistingVenueId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== 'manager') return;
    (async () => {
      setResolvingOwner(true);
      try {
        const { data: assignedVenues } = await supabase.from('venues').select('ownerId, id').contains('assignedUids', [user.uid]).limit(1);
        let venueData = assignedVenues?.[0] || null;
        if (!venueData) {
          const { data: all } = await supabase.from('venues').select('ownerId, id').limit(1);
          venueData = all?.[0] || null;
        }
        if (!venueData && user?.venue) {
          const { data } = await supabase.from('venues').select('ownerId, id').eq('name', user.venue).limit(1).maybeSingle();
          venueData = data || null;
        }
        if (venueData) { setManagerOwnerId(venueData.ownerId || null); setManagerExistingVenueId(venueData.id); }
      } catch (e) { console.log(e); }
      setResolvingOwner(false);
    })();
  }, [user]);

  const addVenue = async () => {
    if (isLocked) {
      Alert.alert('Subscription required', 'Your trial has ended. Please subscribe on the web dashboard to add venues.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Web Dashboard', onPress: () => Linking.openURL('https://venuesv.com/subscribe') },
      ]);
      return;
    }
    if (!name.trim() || !suburb.trim()) { Alert.alert('Missing', 'Enter venue name and suburb.'); return; }

    const ownerIdForCount = user?.role === 'manager' ? managerOwnerId : user?.uid;
    const isTrial = user?.subscriptionStatus !== 'active';

    if (isTrial) {
      const { count } = await supabase.from('venues').select('*', { count: 'exact', head: true }).eq('ownerId', ownerIdForCount);
      const currentCount = count || 0;
      if (currentCount >= TRIAL_VENUE_LIMIT) {
        Alert.alert(
          `Trial limit: ${TRIAL_VENUE_LIMIT} venues`,
          `Free trial includes ${TRIAL_VENUE_LIMIT} venues to experience multi-venue OS.\n\nYou have ${currentCount} venues. Subscribe on web dashboard to add more – keep zones, tasks, team.\n\n$19.95/week per venue • No per-user fees • Cancel anytime`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Web Dashboard', onPress: () => Linking.openURL('https://venuesv.com/subscribe') },
          ]
        );
        return;
      }
    }

    if (user?.subscriptionStatus === 'active') {
      const { count } = await supabase.from('venues').select('*', { count: 'exact', head: true }).eq('ownerId', user?.uid);
      const currentCount = count || 0;
      const newCount = currentCount + 1;
      const newWeekly = (newCount * 19.95).toFixed(2);
      return new Promise<void>((resolve) => {
        Alert.alert(
          'Subscription update',
          `Adding "${name.trim()}" will increase to ${newCount} venues.\n\nNew weekly: $${newWeekly} AUD (+$19.95/week, prorated). Manage billing on web dashboard.`,
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Add Venue', onPress: () => resolve() }]
        );
      }).then(() => _doAddVenue());
    }

    _doAddVenue();
  };

  const _doAddVenue = async () => {
    const isManager = user?.role === 'manager';
    if (isManager && (!managerOwnerId || !managerExistingVenueId)) {
      Alert.alert('Cannot add venue yet', 'We could not determine your business. Make sure you are assigned to a venue first.');
      return;
    }
    setSaving(true);
    try {
      const venuePayload: any = {
        name: name.trim(),
        suburb: suburb.trim(),
        type,
        score: 100,
        ownerId: isManager ? managerOwnerId : user?.uid,
        assignedUids: isManager && user?.uid ? [user.uid] : [],
      };

      const { data: venueData, error: venueError } = await supabase.from('venues').insert([venuePayload]).select().single();
      if (venueError) throw venueError;

      const defaultZones = ZONES_PRESETS[type] || ZONES_PRESETS.other;
      const zoneIcons: Record<string, string> = {
        'Front Bar':'🍺','Beer Garden':'🌿','Gaming Room':'🎰','Restrooms':'🚻','Carpark':'🚗','Main Floor':'🎵','Bar Area':'🍺','Smoking Area':'🚬','Entry':'🚪','Dining Area':'🍽️','Kitchen Entry':'🍽️','Outdoor Seating':'🌿','Main Area':'🏢','Function Room':'🎭','Locker Rooms':'🧹',
      };
      const zonesToInsert = defaultZones.map(zoneName => ({ name: zoneName, icon: zoneIcons[zoneName]||'📍', status:'clean', score:100, venueId: venueData.id }));
      const { error: zonesError } = await supabase.from('zones').insert(zonesToInsert);
      if (zonesError) throw zonesError;

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch(SYNC_VENUE_COUNT_API, { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`}, }).catch(()=>{});
      }

      Alert.alert('✅ Venue Added!', `${name.trim()} added with ${defaultZones.length} zones. Manage team & billing on web dashboard.`, [{ text:'OK', onPress:()=>navigation.goBack() }]);
    } catch (err:any){ Alert.alert('Error', err.message); }
    setSaving(false);
  };

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <TouchableOpacity style={s.backBtn} onPress={()=>navigation.goBack()}><Text style={s.backArrow}>‹</Text></TouchableOpacity>
            <View><Text style={s.heading}>Add New Venue</Text><Text style={s.sub}>Trial: {TRIAL_VENUE_LIMIT} venues • $19.95/week after • Web dashboard manages billing</Text></View>
          </View>

          {user?.role==='manager' && resolvingOwner && (
            <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:16}}><ActivityIndicator color={Colors.brand} size="small"/><Text style={{fontSize:12,color:Colors.textMuted}}>Checking your business...</Text></View>
          )}

          {user?.subscriptionStatus!=='active' && (
            <View style={s.trialBanner}>
              <Text style={s.trialTitle}>Free Trial • {trialDaysLeft||14} days left • {TRIAL_VENUE_LIMIT} venues max</Text>
              <Text style={s.trialSub}>Experience multi-venue OS. Subscribe on web dashboard to add more – keep data, zones, team. No per-user fees.</Text>
            </View>
          )}

          <Text style={s.inputLabel}>VENUE TYPE</Text>
          <View style={s.typeGrid}>
            {VENUE_TYPES.map(t=>(
              <TouchableOpacity key={t.id} style={[s.typeCard, type===t.id&&s.typeCardActive]} onPress={()=>setType(t.id)}>
                <Text style={s.typeEmoji}>{t.emoji}</Text><Text style={[s.typeLabel, type===t.id&&s.typeLabelActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.inputLabel}>VENUE NAME</Text>
          <TextInput style={s.input} placeholder="e.g. Eagle Heights Tavern" placeholderTextColor={Colors.textMuted} value={name} onChangeText={setName} returnKeyType="next"/>

          <Text style={s.inputLabel}>SUBURB / LOCATION</Text>
          <TextInput style={s.input} placeholder="e.g. Toowoomba QLD" placeholderTextColor={Colors.textMuted} value={suburb} onChangeText={setSuburb} returnKeyType="done"/>

          <View style={s.zonesPreview}>
            <Text style={s.zonesTitle}>📍 Default zones for {VENUE_TYPES.find(t=>t.id===type)?.label}:</Text>
            <View style={s.zonesList}>{ZONES_PRESETS[type].map(z=><View key={z} style={s.zoneChip}><Text style={s.zoneChipText}>{z}</Text></View>)}</View>
            <Text style={s.zonesNote}>Auto-created. Editable in Zones OS. Web dashboard manages all venues.</Text>
          </View>

          <TouchableOpacity style={[s.addBtn, (saving||(user?.role==='manager'&&resolvingOwner))&&{opacity:0.6}]} onPress={addVenue} disabled={saving||(user?.role==='manager'&&resolvingOwner)}>
            {saving?<ActivityIndicator color={Colors.black}/>:<Text style={s.addBtnText}>Add Venue → Web Dashboard Sync</Text>}
          </TouchableOpacity>
          <View style={{height:40}}/>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:Colors.canvas},
  scroll:{padding:20},
  header:{flexDirection:'row',alignItems:'center',gap:12,marginBottom:20},
  backBtn:{width:36,height:36,backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:10,alignItems:'center',justifyContent:'center'},
  backArrow:{fontSize:24,color:Colors.text,lineHeight:28},
  heading:{fontSize:20,fontWeight:'900',color:Colors.text, letterSpacing:-0.3},
  sub:{fontSize:11,color:Colors.textMuted, marginTop:2},
  trialBanner:{backgroundColor: Colors.brandSoft, borderWidth:1, borderColor: Colors.brand+'30', borderRadius:12, padding:12, marginBottom:16, gap:4},
  trialTitle:{fontSize:12,fontWeight:'800',color:Colors.brand},
  trialSub:{fontSize:11,color:Colors.textSecondary, lineHeight:14},
  inputLabel:{fontSize:10,fontWeight:'800',color:Colors.textMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:8, marginTop:8},
  typeGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:16},
  typeCard:{width:'30%',backgroundColor:Colors.surface,borderWidth:1.5,borderColor:Colors.border,borderRadius:12,padding:12,alignItems:'center',gap:6},
  typeCardActive:{borderColor:Colors.brand, backgroundColor:Colors.brandSoft},
  typeEmoji:{fontSize:22},
  typeLabel:{fontSize:10,color:Colors.textMuted,fontWeight:'600',textAlign:'center'},
  typeLabelActive:{color:Colors.brand},
  input:{backgroundColor:Colors.surfaceRaised,borderWidth:1,borderColor:Colors.border,borderRadius:10,padding:14,color:Colors.text,fontSize:14,marginBottom:14},
  zonesPreview:{backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:14,padding:16,marginBottom:20,gap:10},
  zonesTitle:{fontSize:13,fontWeight:'700',color:Colors.text},
  zonesList:{flexDirection:'row',flexWrap:'wrap',gap:6},
  zoneChip:{backgroundColor:Colors.brandSoft,borderWidth:1,borderColor:Colors.brand+'20',borderRadius:99,paddingHorizontal:10,paddingVertical:4},
  zoneChipText:{fontSize:10,color:Colors.brand,fontWeight:'600'},
  zonesNote:{fontSize:10,color:Colors.textMuted},
  addBtn:{backgroundColor:Colors.brand,borderRadius:12,padding:15,alignItems:'center'},
  addBtnText:{color:Colors.black,fontSize:14,fontWeight:'900',letterSpacing:0.5},
});
