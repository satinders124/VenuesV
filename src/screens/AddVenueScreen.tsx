import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Platform
} from 'react-native';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

const SYNC_VENUE_COUNT_API = 'https://www.venuesv.com/api/sync-venue-count';

const VENUE_TYPES = [
  { id: 'pub',         label: 'Pub / Hotel',  emoji: '🍺' },
  { id: 'club',        label: 'Nightclub',    emoji: '🪩' },
  { id: 'restaurant',  label: 'Restaurant',   emoji: '🍽️' },
  { id: 'cafe',        label: 'Cafe',         emoji: '☕' },
  { id: 'sports',      label: 'Sports Club',  emoji: '🏏' },
  { id: 'other',       label: 'Other',        emoji: '🏢' },
];

const ZONES_PRESETS: Record<string, string[]> = {
  pub:        ['Front Bar', 'Beer Garden', 'Gaming Room', 'Restrooms', 'Carpark'],
  club:       ['Main Floor', 'Bar Area', 'Restrooms', 'Smoking Area', 'Entry'],
  restaurant: ['Dining Area', 'Kitchen Entry', 'Restrooms', 'Outdoor Seating'],
  cafe:       ['Main Area', 'Counter', 'Restrooms', 'Outdoor Seating'],
  sports:     ['Main Bar', 'Function Room', 'Restrooms', 'Locker Rooms', 'Carpark'],
  other:      ['Main Area', 'Restrooms', 'Entry', 'Staff Area'],
};

export default function AddVenueScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();

  const [name, setName]     = useState('');
  const [suburb, setSuburb] = useState('');
  const [type, setType]     = useState('pub');
  const [saving, setSaving] = useState(false);

  // For managers linking a new venue back to the business owner
  const [resolvingOwner, setResolvingOwner] = useState(false);
  const [managerOwnerId, setManagerOwnerId] = useState<string|null>(null);
  const [managerExistingVenueId, setManagerExistingVenueId] = useState<string|null>(null);

  useEffect(() => {
    if (user?.role !== 'manager' || !user?.venue) return;
    (async () => {
      setResolvingOwner(true);
      try {
        const myVenueName = user.venue;
        const { data, error } = await supabase
          .from('venues')
          .select('ownerId, id')
          .eq('name', myVenueName)
          .limit(1)
          .single();

        if (data) {
          setManagerOwnerId(data.ownerId || null);
          setManagerExistingVenueId(data.id);
        }
      } catch (err) {
        console.log('Could not resolve manager owner:', err);
      }
      setResolvingOwner(false);
    })();
  }, [user]);

  const { isLocked } = useAuth();

  const addVenue = async () => {
    if (isLocked) {
      Alert.alert('Subscription required', 'Your trial has ended. Please subscribe to add new venues.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Subscribe', onPress: () => Linking.openURL('https://venuesv.com/subscribe') },
      ]);
      return;
    }
    if (!name || !suburb) {
      Alert.alert('Missing fields', 'Please enter venue name and suburb.');
      return;
    }

    // If subscribed, warn about price increase before proceeding
    if (user?.subscriptionStatus === 'active') {
      const { count } = await supabase
        .from('venues')
        .select('*', { count: 'exact', head: true })
        .eq('ownerId', user?.uid);
        
      const currentCount = count || 0;
      const newCount = currentCount + 1;
      const newWeekly = (newCount * 19.95).toFixed(2);
      const added = (19.95).toFixed(2);

      return new Promise<void>((resolve) => {
        Alert.alert(
          'Subscription update',
          `Adding "${name}" will increase your subscription from ${currentCount} to ${newCount} venue${newCount > 1 ? 's' : ''}.

New weekly total: $${newWeekly} AUD
(+$${added}/week, prorated immediately)`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Venue', onPress: () => resolve() },
          ]
        );
      }).then(() => _doAddVenue());
    }

    _doAddVenue();
  };

  const _doAddVenue = async () => {
    const isManager = user?.role === 'manager';
    if (isManager && (!managerOwnerId || !managerExistingVenueId)) {
      Alert.alert(
        'Cannot add venue yet',
        'We could not determine which business you work for. Make sure you are assigned to at least one venue first, then try again.'
      );
      return;
    }

    setSaving(true);
    try {
      const venuePayload: any = {
        name,
        suburb,
        type,
        score: 100,
        ownerId: isManager ? managerOwnerId : user?.uid,
        assignedUids: isManager && user?.uid ? [user.uid] : [],
      };
      
      if (isManager) {
        venuePayload.existingVenueId = managerExistingVenueId;
      }

      // Insert the venue
      const { data: venueData, error: venueError } = await supabase
        .from('venues')
        .insert([venuePayload])
        .select()
        .single();

      if (venueError) throw venueError;

      // Auto-create default zones for this venue type
      const defaultZones = ZONES_PRESETS[type] || ZONES_PRESETS.other;
      const zoneIcons: Record<string, string> = {
        'Front Bar':'🍺', 'Beer Garden':'🌿', 'Restrooms — M':'🚹',
        'Restrooms — F':'🚻', 'Gaming Room':'🎰', 'Carpark':'🚗',
        'Kitchen Entry':'🍽️', 'Lobby':'🏨', 'Restaurant':'🍽️',
        'Restrooms':'🚻', 'Function Room':'🎭', 'Pool Area':'🏊',
        'Dining Area':'🍽️', 'Outdoor Seating':'🌿', 'Main Floor':'🎵',
        'Bar Area':'🍺', 'Smoking Area':'🚬', 'Entry':'🚪',
        'Main Area':'🏢',
      };

      const zonesToInsert = defaultZones.map(zoneName => ({
        name: zoneName,
        icon: zoneIcons[zoneName] || '📍',
        status: 'clean',
        score: 100,
        venueId: venueData.id,
      }));

      const { error: zonesError } = await supabase
        .from('zones')
        .insert(zonesToInsert);

      if (zonesError) throw zonesError;

      // Sync venue count with Stripe (authenticated Vercel API)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch(SYNC_VENUE_COUNT_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }).catch(() => {}); // fire and forget
      }

      Alert.alert(
        '✅ Venue Added!',
        `${name} has been added with ${defaultZones.length} default zones.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.heading}>Add New Venue</Text>
          </View>

          {user?.role === 'manager' && resolvingOwner && (
            <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:16}}>
              <ActivityIndicator color="#00c896" size="small" />
              <Text style={{fontSize:12,color:'#6e7a8a'}}>Checking your business...</Text>
            </View>
          )}

          {/* Venue type */}
          <Text style={styles.inputLabel}>VENUE TYPE</Text>
          <View style={styles.typeGrid}>
            {VENUE_TYPES.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.typeCard, type === t.id && styles.typeCardActive]}
                onPress={() => setType(t.id)}
              >
                <Text style={styles.typeEmoji}>{t.emoji}</Text>
                <Text style={[styles.typeLabel, type === t.id && styles.typeLabelActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Venue name */}
          <Text style={styles.inputLabel}>VENUE NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Eagle Heights Tavern"
            placeholderTextColor="#6e7a8a"
            value={name}
            onChangeText={setName}
            returnKeyType="next"
          />

          {/* Suburb */}
          <Text style={styles.inputLabel}>SUBURB / LOCATION</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Toowoomba QLD"
            placeholderTextColor="#6e7a8a"
            value={suburb}
            onChangeText={setSuburb}
            returnKeyType="done"
          />

          {/* Default zones preview */}
          <View style={styles.zonesPreview}>
            <Text style={styles.zonesTitle}>
              📍 Default zones for {VENUE_TYPES.find(t=>t.id===type)?.label}:
            </Text>
            <View style={styles.zonesList}>
              {ZONES_PRESETS[type].map(z => (
                <View key={z} style={styles.zoneChip}>
                  <Text style={styles.zoneChipText}>{z}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.zonesNote}>Zones are auto-created. You can edit them after.</Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.addBtn, (saving || (user?.role==='manager' && resolvingOwner)) && {opacity:0.6}]}
            onPress={addVenue}
            disabled={saving || (user?.role==='manager' && resolvingOwner)}
          >
            {saving
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.addBtnText}>Add Venue →</Text>
            }
          </TouchableOpacity>

          <View style={{height:40}} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex:1, backgroundColor:'#080a0e' },
  scroll:          { padding:24 },
  header:          { flexDirection:'row', alignItems:'center', gap:12, marginBottom:24 },
  backBtn:         { width:36, height:36, backgroundColor:'#161b24', borderRadius:10, alignItems:'center', justifyContent:'center' },
  backArrow:       { fontSize:24, color:'#eef0f4', lineHeight:28 },
  heading:         { fontSize:22, fontWeight:'800', color:'#eef0f4' },
  inputLabel:      { fontSize:11, fontWeight:'600', color:'#6e7a8a', letterSpacing:.5, marginBottom:10 },
  typeGrid:        { flexDirection:'row', flexWrap:'wrap', gap:10, marginBottom:20 },
  typeCard:        { width:'30%', backgroundColor:'#0f1218', borderWidth:1.5, borderColor:'rgba(255,255,255,.07)', borderRadius:12, padding:12, alignItems:'center', gap:6 },
  typeCardActive:  { borderColor:'#00c896', backgroundColor:'rgba(0,200,150,.08)' },
  typeEmoji:       { fontSize:24 },
  typeLabel:       { fontSize:11, color:'#6e7a8a', fontWeight:'600', textAlign:'center' },
  typeLabelActive: { color:'#00c896' },
  input:           { backgroundColor:'#161b24', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderRadius:10, padding:14, color:'#eef0f4', fontSize:15, marginBottom:20 },
  zonesPreview:    { backgroundColor:'#0f1218', borderWidth:1, borderColor:'rgba(255,255,255,.07)', borderRadius:14, padding:16, marginBottom:24, gap:12 },
  zonesTitle:      { fontSize:13, fontWeight:'600', color:'#eef0f4' },
  zonesList:       { flexDirection:'row', flexWrap:'wrap', gap:7 },
  zoneChip:        { backgroundColor:'rgba(0,200,150,.08)', borderWidth:1, borderColor:'rgba(0,200,150,.2)', borderRadius:99, paddingHorizontal:12, paddingVertical:5 },
  zoneChipText:    { fontSize:11, color:'#00c896', fontWeight:'500' },
  zonesNote:       { fontSize:11, color:'#3a4252' },
  addBtn:          { backgroundColor:'#00c896', borderRadius:10, padding:15, alignItems:'center' },
  addBtnText:      { color:'#000', fontSize:15, fontWeight:'800', letterSpacing:1 },
});