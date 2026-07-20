import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ScrollView, TouchableOpacity, Modal,
  TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Dimensions
} from 'react-native';
import { supabase } from '../config/supabase';
import { fetchVenuesForUser } from '../config/fetchVenues';
import { getVenueTeamMembers } from '../config/teamApi';
import { useAuth } from '../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../theme/tokens';
import AIInsightCard from '../components/ui/AIInsightCard';
import { useAIInsight } from '../hooks/useAIInsight';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshControl } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { decode } from 'base64-arraybuffer';
// The download/read helpers used below are provided by Expo's legacy API in SDK 54.
import * as FileSystem from 'expo-file-system/legacy';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

type Priority = 'high' | 'medium' | 'low';
type Status = 'open' | 'resolved';

type Issue = {
  id: string; title: string; zone: string; by: string;
  priority: Priority; status: Status;
  venueId: string; venueName?: string;
  createdAt: any; photoUrls?: string[];
  resolvedPhotoUrls?: string[]; resolvedBy?: string;
  resolvedAt?: any; resolvedNote?: string;
};

type Venue = { id: string; name: string; ownerId?: string; assignedUids?: string[]; };

const PRIORITY_COLOR: Record<Priority, string> = {
  high:'#f24e6e', medium:'#f5a623', low:'#00c896',
};

const ZONES = ['Front Bar','Beer Garden','Restrooms — M','Restrooms — F','Kitchen Entry','Gaming Room','Carpark','External','Supply Room'];

export default function IssuesScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const isOwnerOrManager = user?.role === 'owner' || user?.role === 'manager';
  const canRaise   = user?.role === 'owner' || user?.role === 'manager' || user?.role === 'staff';
  const canResolve = user?.role === 'cleaner';
  const [refreshing, setRefreshing] = useState(false);

  const [venues,        setVenues]        = useState<Venue[]>([]);
  const [issues,        setIssues]        = useState<Issue[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedVenue, setSelectedVenue] = useState<string>('all');
  const [filter,        setFilter]        = useState<'open'|'resolved'>('open');
  const [search,        setSearch]        = useState('');
  const [modalOpen,     setModal]         = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [newTitle,      setNewTitle]      = useState('');
  const [newZone,       setNewZone]       = useState(ZONES[0]);
  const [newPriority,   setNewPriority]   = useState<Priority>('medium');
  const [newVenueId,    setNewVenueId]    = useState('');
  const [reportPhotos,  setReportPhotos]  = useState<string[]>([]);
  const [uploading,     setUploading]     = useState(false);

  const [resolveModal,    setResolveModal]    = useState(false);
  const [resolveIssueId,  setResolveIssueId]  = useState('');
  const [resolvePhotos,   setResolvePhotos]   = useState<string[]>([]);
  const [resolveNote,     setResolveNote]     = useState('');
  const [resolvingSaving, setResolvingSaving] = useState(false);
  const [viewerPhotos,    setViewerPhotos]    = useState<string[]>([]);
  const [viewerIndex,     setViewerIndex]     = useState(0);
  const [downloading,     setDownloading]     = useState(false);
  const { insight: aiInsight } = useAIInsight('issues', selectedVenue !== 'all' ? selectedVenue : undefined, [issues.length]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const venuesData = await fetchVenuesForUser(user.uid, user.role) as Venue[];
      
      setVenues(venuesData);
      if (venuesData.length > 0 && !newVenueId) setNewVenueId(venuesData[0].id);

      if (venuesData.length > 0) {
        const venueIds = venuesData.map(v => v.id).slice(0, 30);
        const { data: issuesData } = await supabase
          .from('issues')
          .select('*')
          .in('venueId', venueIds)
          .order('createdAt', { ascending: false });
          
        setIssues((issuesData || []) as Issue[]);
      } else {
        setIssues([]);
      }
    } catch (err) {
      console.log('Error fetching issues data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, newVenueId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  useEffect(() => {
    fetchData();

    const channel = supabase.channel('issues_changes')
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



  const getVenueName = (venueId:string) => venues.find(v=>v.id===venueId)?.name||venueId;

  const addPhoto = async (photos: string[], setPhotos: (p:string[])=>void) => {
    if (photos.length >= 5) { Alert.alert('Maximum 5 photos allowed'); return; }
    Alert.alert('Add Photo','Choose an option',[
      { text:'📷 Take Photo', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed'); return; }
        const r = await ImagePicker.launchCameraAsync({allowsEditing:true,quality:0.7});
        if (!r.canceled) setPhotos([...photos, r.assets[0].uri]);
      }},
      { text:'🖼️ Choose from Library', onPress: async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed'); return; }
        const r = await ImagePicker.launchImageLibraryAsync({
          allowsEditing:false,
          allowsMultipleSelection:true,
          selectionLimit:5-photos.length,
          quality:0.7
        });
        if (!r.canceled) setPhotos([...photos, ...r.assets.map(a=>a.uri)].slice(0,5));
      }},
      { text:'Cancel', style:'cancel' },
    ]);
  };

  const removePhoto = (photos:string[], setPhotos:(p:string[])=>void, index:number) => {
    setPhotos(photos.filter((_,i)=>i!==index));
  };

  const uploadPhotos = async (uris:string[], prefix:string): Promise<string[]> => {
    const urls: string[] = [];
    for (let i=0; i<uris.length; i++) {
      try {
        const uri = uris[i];
        let fileData;
        
        if (Platform.OS === 'web') {
          // For web
          const response = await fetch(uri);
          fileData = await response.blob();
        } else {
          // For mobile
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
          fileData = decode(base64);
        }
        
        const filePath = `${prefix}_${Date.now()}_${i}.jpg`;
        const { data, error } = await supabase.storage.from('issues').upload(filePath, fileData, {
          contentType: 'image/jpeg'
        });
        
        if (error) throw error;
        
        const { data: publicUrlData } = supabase.storage.from('issues').getPublicUrl(filePath);
        urls.push(publicUrlData.publicUrl);
      } catch(err) { console.log('Photo upload failed:', err); }
    }
    return urls;
  };

  const raiseIssue = async () => {
    if (!newTitle) { Alert.alert('Missing','Please enter issue description.'); return; }
    setSaving(true);
    try {
      let photoUrls: string[] = [];
      if (reportPhotos.length > 0) {
        setUploading(true);
        photoUrls = await uploadPhotos(reportPhotos, 'report');
        setUploading(false);
      }
      
      const { error } = await supabase.from('issues').insert([{
        title:newTitle, zone:newZone, priority:newPriority,
        status:'open', by:user?.name || user?.name,
        venueId:newVenueId,
        photoUrls
      }]);
      
      if (error) throw error;
      
      setModal(false);
      setNewTitle(''); setNewZone(ZONES[0]); setNewPriority('medium'); setReportPhotos([]);
    } catch(err:any){ Alert.alert('Error',err.message); }
    setSaving(false);
  };

  const confirmResolve = async () => {
    setResolvingSaving(true);
    try {
      let resolvedPhotoUrls: string[] = [];
      if (resolvePhotos.length > 0) {
        setUploading(true);
        resolvedPhotoUrls = await uploadPhotos(resolvePhotos, 'resolved');
        setUploading(false);
      }
      
      const { error } = await supabase.from('issues').update({
        status:'resolved',
        resolvedPhotoUrls,
        resolvedNote: resolveNote,
        resolvedBy: user?.name || user?.name,
        resolvedAt: new Date().toISOString(),
      }).eq('id', resolveIssueId);
      
      if (error) throw error;
      
      setResolveModal(false);
      setResolvePhotos([]);
      setResolveNote('');
    } catch(err:any){ Alert.alert('Error',err.message); }
    setResolvingSaving(false);
  };

  const filteredByVenue = selectedVenue === 'all'
    ? issues
    : issues.filter(i => i.venueId === selectedVenue);

  const finalIssues = filteredByVenue
    .filter(i => i.status === filter)
    .filter(i => search === '' || i.title.toLowerCase().includes(search.toLowerCase()) || i.zone.toLowerCase().includes(search.toLowerCase()));

  const downloadImage = async () => {
    if (Platform.OS === 'web') return;
    setDownloading(true);
    try {
      const url = viewerPhotos[viewerIndex];
      const uri = (FileSystem.documentDirectory || '') + `issue_${Date.now()}.jpg`;
      await FileSystem.downloadAsync(url, uri);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Photo saved to your library.');
    } catch {
      Alert.alert('Error', 'Failed to save photo.');
    }
    setDownloading(false);
  };

  const PhotoPicker = ({photos,setPhotos}:{photos:string[],setPhotos:(p:string[])=>void}) => (
    <View style={s.pickerWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {photos.map((p, i) => (
          <View key={i} style={s.pickerThumbWrap}>
            <Image source={{uri:p}} style={s.pickerThumb}/>
            <TouchableOpacity style={s.pickerRemove} onPress={()=>removePhoto(photos,setPhotos,i)}>
              <Ionicons name="close-circle" size={24} color="#f24e6e"/>
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < 5 && (
          <TouchableOpacity style={s.pickerAdd} onPress={()=>addPhoto(photos,setPhotos)}>
            <Ionicons name="camera-outline" size={24} color="#6e7a8a"/>
            <Text style={s.pickerAddText}>Add Photo</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <Text style={s.pickerCount}>{photos.length}/5 photos added</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.heading}>Issues</Text>
          <Text style={s.sub}>{issues.filter(i=>i.status==='open').length} Open</Text>
        </View>
        {canRaise && (
          <TouchableOpacity style={s.raiseBtn} onPress={()=>setModal(true)}>
            <Ionicons name="add-circle" size={18} color="#000"/>
            <Text style={s.raiseBtnText}>Raise Issue</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Toggles */}
      <View style={s.toggleRow}>
        <TouchableOpacity style={[s.toggleBtn, filter==='open'&&s.toggleBtnRed]} onPress={()=>setFilter('open')}>
          <Text style={[s.toggleText, filter==='open'&&{color:'#f24e6e'}]}>Open</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.toggleBtn, filter==='resolved'&&s.toggleBtnGreen]} onPress={()=>setFilter('resolved')}>
          <Text style={[s.toggleText, filter==='resolved'&&{color:'#00c896'}]}>Resolved</Text>
        </TouchableOpacity>
      </View>

      {/* Venues */}
      {venues.length > 1 && (
        <View style={s.venueTabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.venueTabs}>
            <TouchableOpacity style={[s.venueTab, selectedVenue==='all'&&s.venueTabActive]} onPress={()=>setSelectedVenue('all')}>
              <Text style={[s.venueTabText, selectedVenue==='all'&&s.venueTabTextActive]}>All Venues</Text>
            </TouchableOpacity>
            {venues.map(v=>(
              <TouchableOpacity key={v.id} style={[s.venueTab, selectedVenue===v.id&&s.venueTabActive]} onPress={()=>setSelectedVenue(v.id)}>
                <Text style={[s.venueTabText, selectedVenue===v.id&&s.venueTabTextActive]}>{v.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search */}
      <View style={{paddingHorizontal:24}}>
        <View style={s.searchBar}>
          <Ionicons name="search" size={16} color="#6e7a8a"/>
          <TextInput
            style={s.searchInput}
            placeholder="Search issues..."
            placeholderTextColor="#6e7a8a"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {!isOwnerOrManager && filter === 'open' && (
        <View style={s.notice}>
          <Text style={s.noticeText}>💡 Open issues are reported to management to assign to cleaners or trades.</Text>
        </View>
      )}

      <FlatList
        data={finalIssues}
        keyExtractor={i=>i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00c896" />}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          loading ? <ActivityIndicator color="#00c896" style={{marginTop:40}}/> :
          <View style={s.emptyWrap}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#00c896"/>
            <Text style={s.emptyText}>No {filter} issues found</Text>
          </View>
        }
        renderItem={({item}) => {
          let dateStr = 'Just now';
          if (item.createdAt) {
            const date = new Date(item.createdAt);
            dateStr = date.toLocaleDateString('en-AU',{month:'short',day:'numeric'}) + ' ' + date.toLocaleTimeString('en-AU',{hour:'numeric',minute:'2-digit'});
          }
          
          return (
            <View style={[s.issueCard, item.status==='resolved'&&s.issueResolved]}>
              <View style={s.issueTop}>
                {item.status==='open' ? (
                  <View style={[s.priorityBadge,{backgroundColor:`${PRIORITY_COLOR[item.priority]}22`}]}>
                    <Text style={[s.priorityText,{color:PRIORITY_COLOR[item.priority]}]}>{item.priority.toUpperCase()}</Text>
                  </View>
                ) : (
                  <View style={s.resolvedBadge}>
                    <Ionicons name="checkmark" size={12} color="#00c896"/>
                    <Text style={s.resolvedBadgeText}>RESOLVED</Text>
                  </View>
                )}
                {venues.length > 1 && <Text style={s.issueVenueTag}>🏢 {getVenueName(item.venueId)}</Text>}
                <Text style={s.issueDate}>{dateStr}</Text>
              </View>

              <Text style={s.issueTitle}>{item.title}</Text>
              <View style={s.issueMeta}>
                <Ionicons name="location-outline" size={12} color="#6e7a8a"/>
                <Text style={{fontSize:12,color:'#6e7a8a',marginLeft:4}}>
                  {item.zone}  ·  Reported by {item.by}
                </Text>
              </View>

              {item.photoUrls && item.photoUrls.length > 0 && (
                <View style={s.photoSection}>
                  <View style={s.photoLabelRow}>
                    <Ionicons name="camera-outline" size={12} color="#6e7a8a"/>
                    <Text style={[s.photoLabel,{color:'#6e7a8a'}]}>Issue Photos</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.photoStrip}>
                    {item.photoUrls.map((url, idx) => (
                      <TouchableOpacity key={idx} style={s.photoThumbWrap} onPress={()=>{setViewerPhotos(item.photoUrls||[]);setViewerIndex(idx);}}>
                        <Image source={{uri:url}} style={s.photoThumb}/>
                        <View style={s.photoThumbOverlay}><Ionicons name="expand" size={12} color="#fff"/></View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {item.status==='resolved' && (
                <View style={s.resolvedSection}>
                  <View style={s.resolvedSectionHeader}>
                    <Ionicons name="build" size={14} color="#00c896"/>
                    <Text style={s.resolvedSectionTitle}>Resolution Details</Text>
                  </View>
                  {!!item.resolvedNote && (
                    <View style={s.resolveNoteWrap}>
                      <Text style={s.resolveNote}>"{item.resolvedNote}"</Text>
                    </View>
                  )}
                  {item.resolvedPhotoUrls && item.resolvedPhotoUrls.length > 0 && (
                    <View style={s.photoSection}>
                      <View style={s.photoLabelRow}>
                        <Ionicons name="camera-outline" size={12} color="#00c896"/>
                        <Text style={[s.photoLabel,{color:'#00c896'}]}>Proof Photos</Text>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.photoStrip}>
                        {item.resolvedPhotoUrls.map((url, idx) => (
                          <TouchableOpacity key={idx} style={s.photoThumbWrap} onPress={()=>{setViewerPhotos(item.resolvedPhotoUrls||[]);setViewerIndex(idx);}}>
                            <Image source={{uri:url}} style={s.photoThumb}/>
                            <View style={s.photoThumbOverlay}><Ionicons name="expand" size={12} color="#fff"/></View>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  <Text style={{fontSize:10,color:'#6e7a8a',marginTop:4}}>Resolved by {item.resolvedBy}</Text>
                </View>
              )}

              {canResolve && item.status==='open' && (
                <TouchableOpacity style={s.resolveBtn} onPress={()=>{setResolveIssueId(item.id);setResolveModal(true);}}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#00c896"/>
                  <Text style={s.resolveBtnText}>Mark Resolved</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      <Modal visible={viewerPhotos.length > 0} transparent animationType="fade">
        <View style={s.viewerOverlay}>
          <TouchableOpacity style={s.viewerClose} onPress={()=>setViewerPhotos([])}>
            <Ionicons name="close" size={28} color="#fff"/>
          </TouchableOpacity>
          {viewerPhotos.length > 1 && (
            <View style={s.viewerCounter}>
              <Text style={s.viewerCounterText}>{viewerIndex+1} / {viewerPhotos.length}</Text>
            </View>
          )}
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setViewerIndex(i);
            }}
          >
            {viewerPhotos.map((url, idx) => (
              <View key={idx} style={{width:SCREEN_WIDTH,justifyContent:'center',alignItems:'center'}}>
                <Image source={{uri:url}} style={s.viewerImage} resizeMode="contain"/>
              </View>
            ))}
          </ScrollView>
          {Platform.OS !== 'web' && (
            <TouchableOpacity style={s.viewerDownload} onPress={downloadImage} disabled={downloading}>
              <Ionicons name="download-outline" size={20} color="#fff"/>
              <Text style={s.viewerDownloadText}>{downloading?'Saving...':'Save to Library'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      <Modal visible={modalOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>Raise an Issue</Text>
                  <TouchableOpacity onPress={()=>setModal(false)}>
                    <Text style={s.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                {venues.length > 1 && (
                  <View style={{marginBottom:14}}>
                    <Text style={s.inputLabel}>SELECT VENUE</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {venues.map(v => (
                        <TouchableOpacity key={v.id} style={[s.chip, newVenueId===v.id&&s.chipActive]} onPress={()=>setNewVenueId(v.id)}>
                          <Text style={[s.chipText, newVenueId===v.id&&s.chipTextActive]}>{v.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={s.inputLabel}>ISSUE DESCRIPTION</Text>
                <TextInput
                  style={s.input}
                  placeholder="What's wrong? (e.g. Broken tap, spilled glass)"
                  placeholderTextColor="#6e7a8a"
                  value={newTitle}
                  onChangeText={setNewTitle}
                  multiline
                />

                <Text style={s.inputLabel}>ZONE / LOCATION</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:14}}>
                  {ZONES.map(z => (
                    <TouchableOpacity key={z} style={[s.chip, newZone===z&&s.chipActive]} onPress={()=>setNewZone(z)}>
                      <Text style={[s.chipText, newZone===z&&s.chipTextActive]}>{z}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={s.inputLabel}>PRIORITY</Text>
                <View style={s.threeRow}>
                  {(['low','medium','high'] as Priority[]).map(p => (
                    <TouchableOpacity key={p} style={[s.priorityOption, newPriority===p&&{borderColor:PRIORITY_COLOR[p],backgroundColor:`${PRIORITY_COLOR[p]}11`}]} onPress={()=>setNewPriority(p)}>
                      <Text style={[s.priorityOptionText, newPriority===p&&{color:PRIORITY_COLOR[p],fontWeight:'700'}]}>{p.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.inputLabel}>PHOTOS (OPTIONAL, UP TO 5)</Text>
                <PhotoPicker photos={reportPhotos} setPhotos={setReportPhotos}/>

                <View style={s.twoBtn}>
                  <TouchableOpacity style={s.cancelBtn} onPress={()=>setModal(false)}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.submitBtn} onPress={raiseIssue} disabled={saving||uploading}>
                    {saving||uploading
                      ? <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                          <ActivityIndicator color="#000" size="small"/>
                          <Text style={s.submitBtnText}>{uploading?'Uploading...':'Saving...'}</Text>
                        </View>
                      : <Text style={s.submitBtnText}>Submit Issue</Text>
                    }
                  </TouchableOpacity>
                </View>
                <View style={{height:20}}/>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={resolveModal} transparent animationType="slide">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>✅ Mark as Resolved</Text>
                  <TouchableOpacity onPress={()=>{setResolveModal(false);setResolvePhotos([]);setResolveNote('');}}>
                    <Text style={s.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.inputLabel}>WHAT DID YOU DO TO FIX IT?</Text>
                <TextInput
                  style={s.input}
                  placeholder="Describe what was done to resolve this..."
                  placeholderTextColor="#6e7a8a"
                  value={resolveNote}
                  onChangeText={setResolveNote}
                  multiline
                  numberOfLines={3}
                />

                <Text style={s.inputLabel}>PROOF PHOTOS (UP TO 5)</Text>
                <PhotoPicker photos={resolvePhotos} setPhotos={setResolvePhotos}/>

                <View style={s.twoBtn}>
                  <TouchableOpacity style={s.cancelBtn} onPress={()=>{setResolveModal(false);setResolvePhotos([]);setResolveNote('');}}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.submitBtn} onPress={confirmResolve} disabled={resolvingSaving||uploading}>
                    {resolvingSaving||uploading
                      ?<View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                          <ActivityIndicator color="#000" size="small"/>
                          <Text style={s.submitBtnText}>{uploading?'Uploading...':'Saving...'}</Text>
                        </View>
                      :<Text style={s.submitBtnText}>Confirm Resolved</Text>
                    }
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
  container:           {flex:1,backgroundColor:'#080a0e'},
  header:              {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:24,paddingBottom:12},
  heading:             {fontSize:28,fontWeight:'800',color:'#eef0f4'},
  sub:                 {fontSize:13,color:'#6e7a8a',marginTop:2},
  raiseBtn:            {flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'#00c896',paddingHorizontal:14,paddingVertical:9,borderRadius:9},
  raiseBtnText:        {color:'#000',fontWeight:'700',fontSize:13},
  venueTabsWrap:       {height:44,marginBottom:0},
  venueTabs:           {paddingHorizontal:24,gap:8,alignItems:'center'},
  venueTab:            {height:34,paddingHorizontal:14,borderRadius:99,backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',justifyContent:'center'},
  venueTabActive:      {backgroundColor:'#00c896',borderColor:'#00c896'},
  venueTabText:        {fontSize:12,color:'#6e7a8a',fontWeight:'600'},
  venueTabTextActive:  {color:'#000'},
  toggleRow:           {flexDirection:'row',paddingHorizontal:24,gap:10,marginTop:12,marginBottom:12},
  toggleBtn:           {flex:1,backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:12,alignItems:'center'},
  toggleBtnRed:        {borderColor:'rgba(242,78,110,.4)',backgroundColor:'rgba(242,78,110,.08)'},
  toggleBtnGreen:      {borderColor:'rgba(0,200,150,.4)',backgroundColor:'rgba(0,200,150,.08)'},
  toggleText:          {fontSize:13,color:'#6e7a8a',fontWeight:'700'},
searchBar: {flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:12,marginHorizontal:0,marginBottom:12},  searchInput:         {flex:1,color:'#eef0f4',fontSize:14,padding:0},
  notice:              {marginHorizontal:24,marginBottom:12,backgroundColor:'rgba(44,126,247,.1)',borderWidth:1,borderColor:'rgba(44,126,247,.2)',borderRadius:10,padding:12},
  noticeText:          {fontSize:12,color:'#2c7ef7'},
  list:                {paddingHorizontal:24,paddingBottom:20,gap:12},
  emptyWrap:           {alignItems:'center',paddingTop:60,gap:12},
  emptyText:           {fontSize:15,color:'#6e7a8a',fontWeight:'600'},
  issueCard:           {backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderLeftWidth:4,borderRadius:14,padding:16,gap:10},
  issueResolved:       {opacity:0.75},
  issueTop:            {flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},
  priorityBadge:       {paddingHorizontal:8,paddingVertical:3,borderRadius:99},
  priorityText:        {fontSize:10,fontWeight:'700'},
  resolvedBadge:       {flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'rgba(0,200,150,.1)',paddingHorizontal:8,paddingVertical:3,borderRadius:99},
  resolvedBadgeText:   {fontSize:10,fontWeight:'700',color:'#00c896'},
  issueVenueTag:       {fontSize:11,color:'#3a4252'},
  issueDate:           {fontSize:11,color:'#3a4252',marginLeft:'auto'},
  issueTitle:          {fontSize:14,fontWeight:'700',color:'#eef0f4',lineHeight:20},
  issueMeta:           {fontSize:12,color:'#6e7a8a',flexDirection:'row',alignItems:'center'},
  photoSection:        {gap:6},
  photoLabel:          {fontSize:11,fontWeight:'600'},
  photoLabelRow:       {flexDirection:'row',alignItems:'center',gap:4},
  photoStrip:          {marginTop:4},
  photoThumbWrap:      {marginRight:8,borderRadius:8,overflow:'hidden',position:'relative'},
  photoThumb:          {width:100,height:80,borderRadius:8},
  photoThumbOverlay:   {position:'absolute',bottom:4,right:4,backgroundColor:'rgba(0,0,0,.5)',borderRadius:99,padding:3},
  resolvedSection:     {backgroundColor:'rgba(0,200,150,.06)',borderRadius:10,padding:12,gap:8,borderWidth:1,borderColor:'rgba(0,200,150,.15)'},
  resolvedSectionHeader:{flexDirection:'row',alignItems:'center',gap:6},
  resolvedSectionTitle:{fontSize:12,fontWeight:'700',color:'#00c896'},
  resolveNoteWrap:     {flexDirection:'row',alignItems:'flex-start',gap:6},
  resolveNote:         {fontSize:12,color:'#eef0f4',flex:1,fontStyle:'italic',lineHeight:18},
  resolveBtn:          {flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'rgba(0,200,150,.1)',borderWidth:1,borderColor:'rgba(0,200,150,.3)',borderRadius:9,padding:12,marginTop:4},
  resolveBtnText:      {color:'#00c896',fontWeight:'700',fontSize:13},
  viewerOverlay:       {flex:1,backgroundColor:'rgba(0,0,0,.97)',justifyContent:'center',alignItems:'center'},
  viewerClose:         {position:'absolute',top:50,right:20,zIndex:10,backgroundColor:'rgba(255,255,255,.1)',borderRadius:20,padding:8},
  viewerImage:         {width:SCREEN_WIDTH,height:SCREEN_WIDTH*1.3},
  viewerCounter:       {position:'absolute',top:54,alignSelf:'center',zIndex:10,backgroundColor:'rgba(0,0,0,.5)',paddingHorizontal:12,paddingVertical:4,borderRadius:99},
  viewerCounterText:   {color:'#fff',fontSize:13,fontWeight:'600'},
  viewerDownload:      {position:'absolute',bottom:48,alignSelf:'center',flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'rgba(255,255,255,.15)',paddingHorizontal:20,paddingVertical:12,borderRadius:99,borderWidth:1,borderColor:'rgba(255,255,255,.2)'},
  viewerDownloadText:  {color:'#fff',fontSize:14,fontWeight:'600'},
  modalOverlay:        {flex:1,justifyContent:'flex-end'},
  modalBox:            {backgroundColor:'#0f1218',borderTopLeftRadius:20,borderTopRightRadius:20,padding:24,maxHeight:'90%'},
  modalHeader:         {flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},
  modalTitle:          {fontSize:18,fontWeight:'800',color:'#eef0f4'},
  modalClose:          {fontSize:18,color:'#6e7a8a',padding:4},
  inputLabel:          {fontSize:11,fontWeight:'600',color:'#6e7a8a',letterSpacing:.5,marginBottom:8},
  threeRow:            {flexDirection:'row',gap:8,marginBottom:14},
  priorityOption:      {flex:1,backgroundColor:'#161b24',borderWidth:1.5,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:10,alignItems:'center'},
  priorityOptionText:  {fontSize:12,color:'#6e7a8a',fontWeight:'600'},
  chip:                {backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:99,paddingHorizontal:14,paddingVertical:7,marginRight:8},
  chipActive:          {borderColor:'#00c896',backgroundColor:'rgba(0,200,150,.1)'},
  chipText:            {fontSize:12,color:'#6e7a8a',fontWeight:'500'},
  chipTextActive:      {color:'#00c896',fontWeight:'700'},
  input:               {backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderRadius:10,padding:13,color:'#eef0f4',fontSize:14,minHeight:80,textAlignVertical:'top',marginBottom:14},
  pickerWrap:          {marginBottom:14,gap:8},
  pickerThumbWrap:     {width:80,height:80,borderRadius:10,marginRight:8,position:'relative'},
  pickerThumb:         {width:80,height:80,borderRadius:10},
  pickerRemove:        {position:'absolute',top:-6,right:-6},
  pickerAdd:           {width:80,height:80,borderRadius:10,backgroundColor:'#161b24',borderWidth:1.5,borderStyle:'dashed',borderColor:'rgba(255,255,255,.15)',alignItems:'center',justifyContent:'center',gap:4},
  pickerAddText:       {fontSize:10,color:'#6e7a8a',fontWeight:'600'},
  pickerCount:         {fontSize:11,color:'#6e7a8a'},
  twoBtn:              {flexDirection:'row',gap:12},
  cancelBtn:           {flex:1,backgroundColor:'transparent',borderWidth:1,borderColor:'rgba(255,255,255,.1)',borderRadius:10,padding:13,alignItems:'center'},
  cancelBtnText:       {color:'#6e7a8a',fontWeight:'600'},
  submitBtn:           {flex:1,backgroundColor:'#00c896',borderRadius:10,padding:13,alignItems:'center'},
  submitBtnText:       {color:'#000',fontWeight:'700',fontSize:14},
});