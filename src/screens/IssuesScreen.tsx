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

  // --- PREMIUM QUICK PHOTO FLOW – 2-tap + HARD 5 CAP ---
  const quickTakePhoto = async (photos: string[], setPhotos: (p:string[])=>void) => {
    // Functional safe cap – prevents adding >5 even with stale closure or rapid taps
    if (photos.length >= 5) { Alert.alert('Limit: 5 photos max','Photo proof limited to 5 for audit clarity. Remove one to add another.'); return; }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera permission needed – allow in settings'); return; }
    const r = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.55, exif: false });
    if (!r.canceled) {
      const newUris = r.assets.map(a=>a.uri);
      // Functional update ensures cap even if photos stale
      setPhotos((prev:any) => {
        const current = Array.isArray(prev) ? prev : photos;
        return [...current, ...newUris].slice(0,5);
      });
    }
  };

  const quickPickLibrary = async (photos: string[], setPhotos: (p:string[])=>void) => {
    if (photos.length >= 5) { Alert.alert('Limit: 5 photos max','Photo proof limited to 5 for audit clarity.'); return; }
    const remaining = 5 - photos.length;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Library permission needed'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ allowsEditing:false, allowsMultipleSelection:true, selectionLimit: remaining >0 ? remaining : 1, quality:0.55 });
    if (!r.canceled) {
      const newUris = r.assets.map(a=>a.uri);
      setPhotos((prev:any) => {
        const current = Array.isArray(prev) ? prev : photos;
        // Hard cap 5, dedupe by uri
        const merged = [...current, ...newUris];
        const unique = Array.from(new Set(merged));
        return unique.slice(0,5);
      });
    }
  };

  // Legacy addPhoto kept for backward compat but now calls quick methods via sheet
  const addPhoto = async (photos: string[], setPhotos: (p:string[])=>void) => {
    if (photos.length >= 5) { Alert.alert('Maximum 5 photos allowed'); return; }
    // Show quick 2-button choice directly, no extra alert layer
    Alert.alert('Add Photo Proof','2-tap quick – camera or library',[
      { text:'📷 Camera – Quick', onPress: () => quickTakePhoto(photos, setPhotos)},
      { text:'🖼️ Library – Multi-select', onPress: () => quickPickLibrary(photos, setPhotos)},
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
      {photos.length===0 ? (
        <View style={s.quickPhotoBox}>
          <Ionicons name="camera" size={28} color={Colors.textMuted} style={{opacity:0.6}}/>
          <Text style={s.quickPhotoTitle}>Add photo proof – 2-tap quick</Text>
          <Text style={s.quickPhotoSub}>Tap camera for instant capture, or library for multi-select. Photo proof closes audit 3x faster.</Text>
          <View style={s.quickBtnRow}>
            <TouchableOpacity style={[s.quickBtn, {backgroundColor: Colors.brand}]} onPress={()=>quickTakePhoto(photos,setPhotos)}>
              <Ionicons name="camera" size={18} color={Colors.black}/><Text style={[s.quickBtnText,{color:Colors.black}]}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.quickBtn, {backgroundColor: Colors.surfaceRaised, borderWidth:1, borderColor: Colors.border}]} onPress={()=>quickPickLibrary(photos,setPhotos)}>
              <Ionicons name="images-outline" size={18} color={Colors.text}/><Text style={[s.quickBtnText,{color:Colors.text}]}>Library ({5-photos.length} left)</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:8}}>
            {photos.map((p, i) => (
              <View key={i} style={s.pickerThumbWrap}>
                <Image source={{uri:p}} style={s.pickerThumb}/>
                <TouchableOpacity style={s.pickerRemove} onPress={()=>removePhoto(photos,setPhotos,i)}>
                  <Ionicons name="close-circle" size={22} color="#fff" style={{backgroundColor:'rgba(0,0,0,0.6)',borderRadius:11}}/>
                </TouchableOpacity>
                <View style={s.thumbNum}><Text style={s.thumbNumText}>{i+1}</Text></View>
              </View>
            ))}
            {photos.length < 5 && (
              <>
                <TouchableOpacity style={[s.pickerAdd, {backgroundColor: Colors.brand, borderColor: Colors.brand}]} onPress={()=>quickTakePhoto(photos,setPhotos)}>
                  <Ionicons name="camera" size={20} color={Colors.black}/><Text style={[s.pickerAddText,{color:Colors.black, fontWeight:'800'}]}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.pickerAdd} onPress={()=>quickPickLibrary(photos,setPhotos)}>
                  <Ionicons name="images-outline" size={20} color={Colors.textMuted}/><Text style={s.pickerAddText}>Library</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:6}}>
            <Text style={s.pickerCount}>{photos.length}/5 • Tap X to remove • Tap photo to retake</Text>
            {photos.length>0&&<TouchableOpacity onPress={()=>setPhotos([])}><Text style={{fontSize:11,color:Colors.red, fontWeight:'700'}}>Clear all</Text></TouchableOpacity>}
          </View>
        </>
      )}
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
            const diff = Date.now() - date.getTime();
            if (diff < 60000) dateStr = 'now';
            else if (diff < 3600000) dateStr = `${Math.floor(diff/60000)}m ago`;
            else if (diff < 86400000) dateStr = `${Math.floor(diff/3600000)}h ago`;
            else dateStr = date.toLocaleDateString('en-AU',{month:'short',day:'numeric'});
          }
          
          const priorityCfg = {
            high: { bg: 'rgba(242,78,110,.12)', border: 'rgba(242,78,110,.25)', text: '#f24e6e', dot: '#f24e6e' },
            medium: { bg: 'rgba(245,166,35,.12)', border: 'rgba(245,166,35,.25)', text: '#f5a623', dot: '#f5a623' },
            low: { bg: 'rgba(0,200,150,.1)', border: 'rgba(0,200,150,.2)', text: '#00c896', dot: '#00c896' },
          }[item.priority] || { bg: 'rgba(0,200,150,.1)', border: 'rgba(0,200,150,.2)', text: '#00c896', dot: '#00c896' };

          return (
            <View style={[s.issueCard, item.status==='resolved'&&s.issueResolved, { borderLeftColor: priorityCfg.dot, borderLeftWidth: 3 }]}>
              <View style={s.issueTop}>
                <View style={s.issueTopLeft}>
                  {venues.length > 1 && <View style={s.venueChip}><Text style={s.venueChipText}>🏢 {getVenueName(item.venueId)}</Text></View>}
                  <View style={[s.priorityBadge, {backgroundColor: priorityCfg.bg, borderColor: priorityCfg.border, borderWidth:1}]}>
                    <View style={[s.priorityDot,{backgroundColor: priorityCfg.dot}]}/>
                    <Text style={[s.priorityText,{color: priorityCfg.text}]}>{item.priority.toUpperCase()}</Text>
                  </View>
                  {item.status==='resolved' ? (
                    <View style={s.resolvedBadge}><Ionicons name="checkmark" size={10} color={Colors.brand}/><Text style={s.resolvedBadgeText}>RESOLVED</Text></View>
                  ) : (
                    <View style={s.openBadge}><View style={s.openDot}/><Text style={s.openText}>OPEN</Text></View>
                  )}
                </View>
                <Text style={s.issueDate}>{dateStr}</Text>
              </View>

              <Text style={s.issueTitle}>{item.title}</Text>

              <View style={s.metaRow}>
                <View style={s.metaChip}><Ionicons name="location-outline" size={12} color={Colors.textMuted}/><Text style={s.metaText}>{item.zone}</Text></View>
                <View style={s.metaChip}><Ionicons name="person-outline" size={12} color={Colors.textMuted}/><Text style={s.metaText}>{item.by}</Text></View>
                {item.photoUrls && item.photoUrls.length>0 && <View style={s.metaChip}><Ionicons name="camera-outline" size={12} color={Colors.brand}/><Text style={[s.metaText,{color:Colors.brand}]}>{item.photoUrls.length} photo{item.photoUrls.length>1?'s':''}</Text></View>}
              </View>

              {item.photoUrls && item.photoUrls.length > 0 && (
                <View style={s.photoSection}>
                  <View style={s.photoHeader}><Text style={s.photoLabel}>📸 Proof • {item.photoUrls.length}/5</Text><Text style={s.photoHint}>Tap to expand</Text></View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}} style={s.photoStrip}>
                    {item.photoUrls.map((url, idx) => (
                      <TouchableOpacity key={idx} style={s.photoThumbWrap} onPress={()=>{setViewerPhotos(item.photoUrls||[]);setViewerIndex(idx);}}>
                        <Image source={{uri:url}} style={s.photoThumbLarge}/>
                        <View style={s.photoThumbOverlay}><Ionicons name="expand-outline" size={14} color="#fff"/></View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {item.status==='resolved' && (
                <View style={s.resolvedSection}>
                  <View style={s.resolvedSectionHeader}>
                    <View style={s.resolvedIcon}><Ionicons name="checkmark-done" size={14} color={Colors.brand}/></View>
                    <Text style={s.resolvedSectionTitle}>Resolved • Proof</Text>
                    <Text style={s.resolvedBy}>by {item.resolvedBy} • {item.resolvedAt? new Date(item.resolvedAt).toLocaleDateString('en-AU') : ''}</Text>
                  </View>
                  {!!item.resolvedNote && <Text style={s.resolveNote}>"{item.resolvedNote}"</Text>}
                  {item.resolvedPhotoUrls && item.resolvedPhotoUrls.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}} style={s.photoStrip}>
                      {item.resolvedPhotoUrls.map((url, idx) => (
                        <TouchableOpacity key={idx} style={s.photoThumbWrap} onPress={()=>{setViewerPhotos(item.resolvedPhotoUrls||[]);setViewerIndex(idx);}}>
                          <Image source={{uri:url}} style={s.photoThumbLarge}/>
                          <View style={[s.photoThumbOverlay,{backgroundColor:'rgba(0,200,150,0.7)'}]}><Ionicons name="shield-checkmark" size={14} color="#fff"/></View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}

              {canResolve && item.status==='open' && (
                <TouchableOpacity style={s.resolveBtn} onPress={()=>{setResolveIssueId(item.id);setResolveModal(true);}}>
                  <Ionicons name="camera-outline" size={16} color={Colors.black}/><Text style={s.resolveBtnText}>Resolve with Photo Proof →</Text>
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
  container:           {flex:1,backgroundColor:Colors.canvas},
  header:              {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:20,paddingBottom:12},
  heading:             {fontSize:22,fontWeight:'900',color:Colors.text, letterSpacing:-0.4},
  sub:                 {fontSize:11,color:Colors.textMuted,marginTop:2, fontWeight:'600'},
  raiseBtn:            {flexDirection:'row',alignItems:'center',gap:6,backgroundColor:Colors.brand,paddingHorizontal:14,paddingVertical:10,borderRadius:10},
  raiseBtnText:        {color:Colors.black,fontWeight:'800',fontSize:12},
  venueTabsWrap:       {height:40,marginBottom:8},
  venueTabs:           {paddingHorizontal:20,gap:8,alignItems:'center'},
  venueTab:            {height:32,paddingHorizontal:14,borderRadius:99,backgroundColor:Colors.surfaceRaised,borderWidth:1,borderColor:Colors.border,justifyContent:'center'},
  venueTabActive:      {backgroundColor:Colors.brand,borderColor:Colors.brand},
  venueTabText:        {fontSize:11,color:Colors.textMuted,fontWeight:'600'},
  venueTabTextActive:  {color:Colors.black, fontWeight:'800'},
  toggleRow:           {flexDirection:'row',paddingHorizontal:20,gap:8,marginTop:8,marginBottom:12},
  toggleBtn:           {flex:1,backgroundColor:Colors.surfaceRaised,borderWidth:1,borderColor:Colors.border,borderRadius:10,padding:10,alignItems:'center'},
  toggleBtnRed:        {borderColor:Colors.red+'40',backgroundColor:Colors.redSoft},
  toggleBtnGreen:      {borderColor:Colors.brand+'40',backgroundColor:Colors.brandSoft},
  toggleText:          {fontSize:11,color:Colors.textMuted,fontWeight:'700', letterSpacing:0.5, textTransform:'uppercase'},
  searchBar:           {flexDirection:'row',alignItems:'center',gap:10,backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:12,padding:12,marginBottom:12},
  searchInput:         {flex:1,color:Colors.text,fontSize:13,padding:0},
  notice:              {marginHorizontal:20,marginBottom:12,backgroundColor:Colors.blue+'12',borderWidth:1,borderColor:Colors.blue+'25',borderRadius:12,padding:12},
  noticeText:          {fontSize:11,color:Colors.blue, lineHeight:16},
  list:                {paddingHorizontal:16,paddingBottom:20,gap:12},
  emptyWrap:           {alignItems:'center',paddingTop:60,gap:12},
  emptyText:           {fontSize:14,color:Colors.textMuted,fontWeight:'600'},
  // Premium Issue Card – clear hierarchy
  issueCard:           {backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.border,borderRadius:Radius.lg,padding:14,gap:10},
  issueResolved:       {opacity:0.7, borderLeftColor: Colors.brand},
  issueTop:            {flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  issueTopLeft:        {flexDirection:'row',alignItems:'center',gap:6,flex:1,flexWrap:'wrap'},
  venueChip:           {backgroundColor:Colors.surfaceRaised,borderWidth:1,borderColor:Colors.border,borderRadius:99,paddingHorizontal:8,paddingVertical:3},
  venueChipText:       {fontSize:10,fontWeight:'600',color:Colors.textMuted},
  priorityBadge:       {flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8,paddingVertical:4,borderRadius:99},
  priorityDot:         {width:6,height:6,borderRadius:3},
  priorityText:        {fontSize:9,fontWeight:'900',letterSpacing:0.5},
  resolvedBadge:       {flexDirection:'row',alignItems:'center',gap:4,backgroundColor:Colors.brandSoft,borderWidth:1,borderColor:Colors.brand+'30',paddingHorizontal:8,paddingVertical:3,borderRadius:99},
  resolvedBadgeText:   {fontSize:9,fontWeight:'800',color:Colors.brand, letterSpacing:0.5},
  openBadge:           {flexDirection:'row',alignItems:'center',gap:4,backgroundColor:Colors.surfaceRaised,borderWidth:1,borderColor:Colors.border,paddingHorizontal:8,paddingVertical:3,borderRadius:99},
  openDot:             {width:6,height:6,borderRadius:3,backgroundColor:Colors.amber},
  openText:            {fontSize:9,fontWeight:'800',color:Colors.textMuted, letterSpacing:0.5},
  issueDate:           {fontSize:10,color:Colors.textMuted, fontWeight:'600'},
  issueTitle:          {fontSize:15,fontWeight:'800',color:Colors.text,lineHeight:20, letterSpacing:-0.2},
  metaRow:             {flexDirection:'row',gap:8,flexWrap:'wrap'},
  metaChip:            {flexDirection:'row',alignItems:'center',gap:4,backgroundColor:Colors.surfaceRaised,borderWidth:1,borderColor:Colors.border,borderRadius:99,paddingHorizontal:8,paddingVertical:4},
  metaText:            {fontSize:11,color:Colors.textMuted, fontWeight:'500'},
  photoSection:        {gap:8, marginTop:4},
  photoHeader:         {flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  photoLabel:          {fontSize:10,fontWeight:'800',letterSpacing:0.6,textTransform:'uppercase',color:Colors.textMuted},
  photoHint:           {fontSize:10,color:Colors.textMuted},
  photoStrip:          {marginTop:2},
  photoThumbWrap:      {borderRadius:10,overflow:'hidden',position:'relative',borderWidth:1,borderColor:Colors.border},
  photoThumbLarge:     {width:110,height:84,borderRadius:10},
  photoThumbOverlay:   {position:'absolute',bottom:6,right:6,backgroundColor:'rgba(0,0,0,.6)',borderRadius:99,padding:4},
  resolvedSection:     {backgroundColor:Colors.brandSoft,borderRadius:12,padding:12,gap:8,borderWidth:1,borderColor:Colors.brand+'20'},
  resolvedIcon:        {width:24,height:24,borderRadius:12,backgroundColor:Colors.brand+'20',borderWidth:1,borderColor:Colors.brand+'30',alignItems:'center',justifyContent:'center'},
  resolvedSectionHeader:{flexDirection:'row',alignItems:'center',gap:8},
  resolvedSectionTitle:{fontSize:11,fontWeight:'800',color:Colors.brand, letterSpacing:0.5, textTransform:'uppercase'},
  resolvedBy:          {fontSize:10,color:Colors.textMuted, marginLeft:'auto'},
  resolveNote:         {fontSize:12,color:Colors.text, fontStyle:'italic', lineHeight:16, backgroundColor:Colors.surface, borderWidth:1, borderColor:Colors.border, borderRadius:8, padding:10},
  resolveBtn:          {flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:Colors.brand,borderRadius:10,padding:12,marginTop:2},
  resolveBtnText:      {color:Colors.black,fontWeight:'800',fontSize:12, letterSpacing:0.3},
  viewerOverlay:       {flex:1,backgroundColor:'rgba(0,0,0,.97)',justifyContent:'center',alignItems:'center'},
  viewerClose:         {position:'absolute',top:50,right:20,zIndex:10,backgroundColor:'rgba(255,255,255,.1)',borderRadius:20,padding:8},
  viewerImage:         {width:SCREEN_WIDTH,height:SCREEN_WIDTH*1.3},
  viewerCounter:       {position:'absolute',top:54,alignSelf:'center',zIndex:10,backgroundColor:'rgba(0,0,0,.5)',paddingHorizontal:12,paddingVertical:4,borderRadius:99},
  viewerCounterText:   {color:'#fff',fontSize:13,fontWeight:'600'},
  viewerDownload:      {position:'absolute',bottom:48,alignSelf:'center',flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'rgba(255,255,255,.15)',paddingHorizontal:20,paddingVertical:12,borderRadius:99,borderWidth:1,borderColor:'rgba(255,255,255,.2)'},
  viewerDownloadText:  {color:'#fff',fontSize:14,fontWeight:'600'},
  modalOverlay:        {flex:1,justifyContent:'flex-end'},
  modalBox:            {backgroundColor:Colors.surface,borderTopLeftRadius:Radius.xl,borderTopRightRadius:Radius.xl,padding:20,maxHeight:'90%', borderWidth:1, borderColor:Colors.border},
  modalHeader:         {flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:14},
  modalTitle:          {fontSize:16,fontWeight:'900',color:Colors.text, letterSpacing:-0.3},
  modalClose:          {fontSize:16,color:Colors.textMuted,padding:6, backgroundColor:Colors.surfaceRaised, borderRadius:8, borderWidth:1, borderColor:Colors.border, width:32, height:32, textAlign:'center'},
  inputLabel:          {fontSize:10,fontWeight:'800',color:Colors.textMuted,letterSpacing:0.6,textTransform:'uppercase',marginBottom:8, marginTop:8},
  threeRow:            {flexDirection:'row',gap:8,marginBottom:12},
  priorityOption:      {flex:1,backgroundColor:Colors.surfaceRaised,borderWidth:1.5,borderColor:Colors.border,borderRadius:10,padding:10,alignItems:'center'},
  priorityOptionText:  {fontSize:10,color:Colors.textMuted,fontWeight:'800', letterSpacing:0.5},
  chip:                {backgroundColor:Colors.surfaceRaised,borderWidth:1,borderColor:Colors.border,borderRadius:99,paddingHorizontal:12,paddingVertical:7,marginRight:6},
  chipActive:          {borderColor:Colors.brand,backgroundColor:Colors.brandSoft},
  chipText:            {fontSize:11,color:Colors.textMuted,fontWeight:'500'},
  chipTextActive:      {color:Colors.brand,fontWeight:'800'},
  input:               {backgroundColor:Colors.surfaceRaised,borderWidth:1,borderColor:Colors.border,borderRadius:10,padding:12,color:Colors.text,fontSize:13,minHeight:48,textAlignVertical:'top',marginBottom:12},
  pickerWrap:          {marginBottom:12,gap:8},
  quickPhotoBox:       {backgroundColor:Colors.surfaceRaised,borderWidth:1.5,borderStyle:'dashed',borderColor:Colors.border,borderRadius:14,padding:16,alignItems:'center',gap:6},
  quickPhotoTitle:     {fontSize:13,fontWeight:'800',color:Colors.text,marginTop:4},
  quickPhotoSub:       {fontSize:11,color:Colors.textMuted,textAlign:'center',lineHeight:15},
  quickBtnRow:         {flexDirection:'row',gap:10,marginTop:8},
  quickBtn:            {flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:14,paddingVertical:10,borderRadius:10},
  quickBtnText:        {fontSize:11,fontWeight:'800'},
  pickerThumbWrap:     {width:80,height:80,borderRadius:10,marginRight:0,position:'relative', borderWidth:1, borderColor:Colors.border},
  pickerThumb:         {width:80,height:80,borderRadius:10},
  pickerRemove:        {position:'absolute',top:-6,right:-6, zIndex:2},
  thumbNum:            {position:'absolute',bottom:4,left:4,backgroundColor:'rgba(0,0,0,0.75)',borderRadius:99,minWidth:16,height:16,alignItems:'center',justifyContent:'center',paddingHorizontal:4},
  thumbNumText:        {fontSize:9,fontWeight:'900',color:'#fff'},
  pickerAdd:           {width:80,height:80,borderRadius:10,backgroundColor:Colors.surfaceRaised,borderWidth:1.5,borderStyle:'dashed',borderColor:Colors.border,alignItems:'center',justifyContent:'center',gap:4},
  pickerAddText:       {fontSize:10,color:Colors.textMuted,fontWeight:'600'},
  pickerCount:         {fontSize:10,color:Colors.textMuted},
  twoBtn:              {flexDirection:'row',gap:10, marginTop:8},
  cancelBtn:           {flex:1,backgroundColor:'transparent',borderWidth:1,borderColor:Colors.border,borderRadius:10,padding:12,alignItems:'center'},
  cancelBtnText:       {color:Colors.textMuted,fontWeight:'700', fontSize:12},
  submitBtn:           {flex:1,backgroundColor:Colors.brand,borderRadius:10,padding:12,alignItems:'center'},
  submitBtnText:       {color:Colors.black,fontWeight:'900',fontSize:12, letterSpacing:0.3},
});