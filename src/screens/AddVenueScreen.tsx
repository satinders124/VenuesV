import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity, TextInput, ScrollView,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

const VENUE_TYPES = [
  { id:'tavern',  emoji:'🍺', label:'Tavern / Pub'     },
  { id:'hotel',   emoji:'🏨', label:'Hotel'            },
  { id:'cafe',    emoji:'☕', label:'Cafe / Restaurant' },
  { id:'club',    emoji:'🎵', label:'Club / Bar'       },
  { id:'other',   emoji:'🏢', label:'Other'            },
];

const ZONES_PRESETS: Record<string, string[]> = {
  tavern:  ['Front Bar','Beer Garden','Restrooms — M','Restrooms — F','Gaming Room','Carpark','Kitchen Entry'],
  hotel:   ['Lobby','Restaurant','Restrooms','Carpark','Function Room','Pool Area'],
  cafe:    ['Dining Area','Kitchen Entry','Restrooms','Outdoor Seating'],
  club:    ['Main Floor','Bar Area','Restrooms','Smoking Area','Entry'],
  other:   ['Main Area','Restrooms','Carpark'],
};

export default function AddVenueScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [name,     setName]     = useState('');
  const [suburb,   setSuburb]   = useState('');
  const [type,     setType]     = useState('tavern');
  const [saving,   setSaving]   = useState(false);

  const addVenue = async () => {
    if (!name || !suburb) {
      Alert.alert('Missing fields', 'Please enter venue name and suburb.');
      return;
    }
    setSaving(true);
    try {
      // Add venue
      const venueRef = await addDoc(collection(db, 'venues'), {
        name,
        suburb,
        type,
        score: 100,
        ownerId: user?.uid,
        createdAt: serverTimestamp(),
      });

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

      for (const zoneName of defaultZones) {
        await addDoc(collection(db, 'zones'), {
          name: zoneName,
          icon: zoneIcons[zoneName] || '📍',
          status: 'clean',
          score: 100,
          venueId: venueRef.id,
          createdAt: serverTimestamp(),
        });
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
          <TouchableOpacity style={styles.addBtn} onPress={addVenue} disabled={saving}>
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