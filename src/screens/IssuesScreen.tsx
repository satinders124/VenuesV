import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  ScrollView, TouchableOpacity, Modal,
  TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Dimensions
} from 'react-native';
import {
  collection, onSnapshot, addDoc, updateDoc,
  doc, query, where, serverTimestamp, orderBy
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { safeOnSnapshot } from '../config/firestoreHelpers';
import { useAuth } from '../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notifyIssueRaised, notifyIssueResolved } from '../config/notifications';
import { RefreshControl } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');


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

type Venue = { id: string; name: string; ownerId?: string; };

const PRIORITY_COLOR: Record<Priority, string> = {
  high:'#f24e6e', medium:'#f5a623', low:'#00c896',
};

const ZONES = ['Front Bar','Beer Garden','Restrooms — M','Restrooms — F','Kitchen Entry','Gaming Room','Carpark','External','Supply Room'];

export default function IssuesScreen() {
  const { user } = useAuth();
  const isOwnerOrManager = user?.role === 'owner' || user?.role === 'manager';
  const canRaise   = user?.role === 'owner' || user?.role === 'manager' || user?.role === 'staff';
  const canResolve = user?.role === 'cleaner';
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

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
  const [viewerPhoto,     setViewerPhoto]     = useState<string|null>(null);

  // ── Scoped venues + issues query ──────────────────────
  // Owners filter by ownerId; everyone else by their assigned venue
  // name(s) — both match the Firestore security rules. Issues are then
  // re-subscribed using where('venueId','in', accessibleVenueIds), which
  // the rules can verify per-document (unlike an unfiltered scan).
  useEffect(() => {
    if (!user) return;

    const venuesQuery = user.role === 'owner'
      ? query(collection(db, 'venues'), where('ownerId', '==', user.uid))
      : query(collection(db, 'venues'), where('assignedUids', 'array-contains', user.uid));

    let unsubIssues: (() => void) | null = null;

    const unsubVenues = safeOnSnapshot(venuesQuery, snap => {
      const v = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Venue[];
      setVenues(v);
      if (v.length > 0 && !newVenueId) setNewVenueId(v[0].id);

      if (unsubIssues) unsubIssues();

      const venueIds = v.map(x => x.id).slice(0, 30);
      if (venueIds.length === 0) {
        setIssues([]);
        setLoading(false);
        return;
      }

      const issuesQuery = venueIds.length === 1
        ? query(collection(db,'issues'), where('venueId','==',venueIds[0]), orderBy('createdAt','desc'))
        : query(collection(db,'issues'), where('venueId','in',venueIds), orderBy('createdAt','desc'));

      unsubIssues = safeOnSnapshot(issuesQuery, snap2 => {
        setIssues(snap2.docs.map((d: any) =>({id:d.id,...d.data()})) as Issue[]);
        setLoading(false);
      });
    });

    return () => {
      unsubVenues();
      if (unsubIssues) unsubIssues();
    };
  }, [user]);

  
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
        const response = await fetch(uris[i]);
        const blob = await response.blob();
        const storageRef = ref(storage, `issues/${prefix}_${Date.now()}_${i}.jpg`);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        urls.push(url);
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
      await addDoc(collection(db,'issues'), {
        title:newTitle, zone:newZone, priority:newPriority,
        status:'open', by:user?.name,
        venueId:newVenueId,
        venueName:venues.find(v=>v.id===newVenueId)?.name||'',
        photoUrls,
        createdAt:serverTimestamp(),
      });
      setModal(false);
      setNewTitle(''); setNewZone(ZONES[0]); setNewPriority('medium'); setReportPhotos([]);
    } catch(err:any){ Alert.alert('Error',err.message); }
    setSaving(false);
    await notifyIssueRaised(newTitle, newPriority, newZone, venues.find(v=>v.id===newVenueId)?.name||'', user?.name||'');
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
      await updateDoc(doc(db,'issues',resolveIssueId), {
        status:'resolved',
        resolvedPhotoUrls,
        resolvedNote: resolveNote,
        resolvedBy:user?.name,
        resolvedAt:serverTimestamp(),
      });
      setResolveModal(false);
      setResolvePhotos([]);
      setResolveNote('');
    } catch(err:any){ Alert.alert('Error',err.message); }
    setResolvingSaving(false);
    const issue = issues.find(i=>i.id===resolveIssueId);
if (issue) await notifyIssueResolved(issue.title, venues.find(v=>v.id===issue.venueId)?.name||'', user?.name||'');
  };

  const filteredByVenue = selectedVenue==='all' ? issues : issues.filter(i=>i.venueId===selectedVenue);

  const shown = filteredByVenue
  .filter(i=>i.status===filter)
  .filter(i=>
    search.trim()==='' ||
    getVenueName(i.venueId)?.toLowerCase().includes(search.toLowerCase())
  );

  const openCount     = filteredByVenue.filter(i=>i.status==='open').length;
  const resolvedCount = filteredByVenue.filter(i=>i.status==='resolved').length;

  

  const formatDate = (ts:any) => {
    if (!ts?.toDate) return 'Just now';
    return ts.toDate().toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  };

  const PhotoStrip = ({urls, label, labelColor='#6e7a8a'}: {urls:string[];label:string;labelColor?:string}) => (
    <View style={s.photoSection}>
      <Text style={[s.photoLabel,{color:labelColor}]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.photoStrip}>
        {urls.map((url,i)=>(
          <TouchableOpacity key={i} onPress={()=>setViewerPhoto(url)} style={s.photoThumbWrap}>
            <Image source={{uri:url}} style={s.photoThumb} resizeMode="cover"/>
            <View style={s.photoThumbOverlay}>
              <Ionicons name="expand-outline" color="#fff" size={14}/>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const PhotoPicker = ({photos, setPhotos}: {photos:string[]; setPhotos:(p:string[])=>void}) => (
    <View style={s.pickerWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {photos.map((uri,i)=>(
          <View key={i} style={s.pickerThumbWrap}>
            <Image source={{uri}} style={s.pickerThumb} resizeMode="cover"/>
            <TouchableOpacity style={s.pickerRemove} onPress={()=>removePhoto(photos,setPhotos,i)}>
              <Ionicons name="close-circle" color="#f24e6e" size={20}/>
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < 5 && (
          <TouchableOpacity style={s.pickerAdd} onPress={()=>addPhoto(photos,setPhotos)}>
            <Ionicons name="camera-outline" color="#6e7a8a" size={24}/>
            <Text style={s.pickerAddText}>{photos.length===0?'Add Photos':`${photos.length}/5`}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      {photos.length > 0 && (
        <Text style={s.pickerCount}>{photos.length}/5 photo{photos.length>1?'s':''} selected</Text>
      )}
    </View>
  );

  if (loading) return (
    <SafeAreaView style={s.container}>
      <ActivityIndicator color="#00c896" style={{marginTop:100}}/>
    </SafeAreaView>
  );

  const Header = (
  <View>
    {/* Search above venue tabs */}
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

    {isOwnerOrManager && venues.length > 1 && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.venueTabsWrap} contentContainerStyle={s.venueTabs}>
        <TouchableOpacity style={[s.venueTab,selectedVenue==='all'&&s.venueTabActive]} onPress={()=>setSelectedVenue('all')}>
          <Text style={[s.venueTabText,selectedVenue==='all'&&s.venueTabTextActive]}>All</Text>
        </TouchableOpacity>
        {venues.map(v=>(
          <TouchableOpacity key={v.id} style={[s.venueTab,selectedVenue===v.id&&s.venueTabActive]} onPress={()=>setSelectedVenue(v.id)}>
            <Text style={[s.venueTabText,selectedVenue===v.id&&s.venueTabTextActive]}>{v.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    )}

    <View style={s.toggleRow}>
      <TouchableOpacity style={[s.toggleBtn,filter==='open'&&s.toggleBtnRed]} onPress={()=>{setFilter('open');setSearch('');}}>
        <Text style={[s.toggleText,filter==='open'&&{color:'#f24e6e'}]}>🔴 Open ({openCount})</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.toggleBtn,filter==='resolved'&&s.toggleBtnGreen]} onPress={()=>{setFilter('resolved');setSearch('');}}>
        <Text style={[s.toggleText,filter==='resolved'&&{color:'#00c896'}]}>✅ Resolved ({resolvedCount})</Text>
      </TouchableOpacity>
    </View>

    {canResolve && filter==='open' && (
      <View style={s.notice}>
        <Text style={s.noticeText}>📸 Add photo proof when marking resolved.</Text>
      </View>
    )}
  </View>
);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.heading}>Issues</Text>
          <Text style={s.sub}>{isOwnerOrManager?'All venues':user?.venue}</Text>
        </View>
        {canRaise && (
          <TouchableOpacity style={s.raiseBtn} onPress={()=>setModal(true)}>
            <Ionicons name="add" color="#000" size={18}/>
            <Text style={s.raiseBtnText}>Report</Text>
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
            <Ionicons name={filter==='open'?'checkmark-circle-outline':'time-outline'} color="#3a4252" size={48}/>
            <Text style={s.emptyText}>
              {search ? `No results for "${search}"` : filter==='open' ? 'No open issues 🎉' : 'No resolved issues yet'}
            </Text>
          </View>
        }
        renderItem={({item:issue})=>(
          <View style={[s.issueCard,{borderLeftColor:PRIORITY_COLOR[issue.priority]},filter==='resolved'&&s.issueResolved]}>
            <View style={s.issueTop}>
              <View style={[s.priorityBadge,{backgroundColor:PRIORITY_COLOR[issue.priority]+'22'}]}>
                <Text style={[s.priorityText,{color:PRIORITY_COLOR[issue.priority]}]}>{issue.priority.toUpperCase()}</Text>
              </View>
              {filter==='resolved'&&(
                <View style={s.resolvedBadge}>
                  <Ionicons name="checkmark-circle" color="#00c896" size={12}/>
                  <Text style={s.resolvedBadgeText}>Resolved</Text>
                </View>
              )}
              {isOwnerOrManager && issue.venueId && (
                <Text style={s.issueVenueTag}>🏢 {getVenueName(issue.venueId)}</Text>
              )}
              <Text style={s.issueDate}>{formatDate(issue.createdAt)}</Text>
            </View>

            <Text style={s.issueTitle}>{issue.title}</Text>
            <Text style={s.issueMeta}>📍 {issue.zone} · {issue.by}</Text>

            {issue.photoUrls && issue.photoUrls.length > 0 && (
              <PhotoStrip urls={issue.photoUrls} label={`📷 ${issue.photoUrls.length} photo${issue.photoUrls.length>1?'s':''}`}/>
            )}

            {filter==='resolved' && (issue.resolvedNote || (issue.resolvedPhotoUrls && issue.resolvedPhotoUrls.length > 0)) && (
              <View style={s.resolvedSection}>
                <View style={s.resolvedSectionHeader}>
                  <Ionicons name="checkmark-circle" color="#00c896" size={14}/>
                  <Text style={s.resolvedSectionTitle}>Resolved by {issue.resolvedBy}</Text>
                </View>
                {!!issue.resolvedNote && (
                  <View style={s.resolveNoteWrap}>
                    <Ionicons name="chatbubble-outline" color="#00c896" size={12}/>
                    <Text style={s.resolveNote}>"{issue.resolvedNote}"</Text>
                  </View>
                )}
                {issue.resolvedPhotoUrls && issue.resolvedPhotoUrls.length > 0 && (
                  <PhotoStrip
                    urls={issue.resolvedPhotoUrls}
                    label={`${issue.resolvedPhotoUrls.length} proof photo${issue.resolvedPhotoUrls.length>1?'s':''}`}
                    labelColor="#00c896"
                  />
                )}
              </View>
            )}

            {filter==='open' && canResolve && (
              <TouchableOpacity style={s.resolveBtn} onPress={()=>{setResolveIssueId(issue.id);setResolvePhotos([]);setResolveNote('');setResolveModal(true);}}>
                <Ionicons name="checkmark-circle-outline" color="#00c896" size={16}/>
                <Text style={s.resolveBtnText}>Mark Resolved</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      {/* Full Screen Photo Viewer */}
      <Modal visible={!!viewerPhoto} transparent animationType="fade">
        <View style={s.viewerOverlay}>
          <TouchableOpacity style={s.viewerClose} onPress={()=>setViewerPhoto(null)}>
            <Ionicons name="close" color="#fff" size={28}/>
          </TouchableOpacity>
          {viewerPhoto && (
            <Image source={{uri:viewerPhoto}} style={s.viewerImage} resizeMode="contain"/>
          )}
        </View>
      </Modal>

      {/* Report Modal */}
      <Modal visible={modalOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}>
          <View style={s.modalOverlay}>
            <View style={s.modalBox}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>📸 Report Issue</Text>
                  <TouchableOpacity onPress={()=>{setModal(false);setReportPhotos([]);}}>
                    <Text style={s.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                {isOwnerOrManager && venues.length > 1 && (
                  <>
                    <Text style={s.inputLabel}>VENUE</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:14}}>
                      {venues.map(v=>(
                        <TouchableOpacity key={v.id} style={[s.chip,newVenueId===v.id&&s.chipActive]} onPress={()=>setNewVenueId(v.id)}>
                          <Text style={[s.chipText,newVenueId===v.id&&s.chipTextActive]}>{v.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                <Text style={s.inputLabel}>PRIORITY</Text>
                <View style={s.threeRow}>
                  {(['high','medium','low'] as Priority[]).map(p=>(
                    <TouchableOpacity key={p} style={[s.priorityOption,newPriority===p&&{borderColor:PRIORITY_COLOR[p],backgroundColor:PRIORITY_COLOR[p]+'18'}]} onPress={()=>setNewPriority(p)}>
                      <Text style={[s.priorityOptionText,newPriority===p&&{color:PRIORITY_COLOR[p]}]}>
                        {p==='high'?'🔴':p==='medium'?'🟡':'🟢'} {p.charAt(0).toUpperCase()+p.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.inputLabel}>ZONE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:14}}>
                  {ZONES.map(z=>(
                    <TouchableOpacity key={z} style={[s.chip,newZone===z&&s.chipActive]} onPress={()=>setNewZone(z)}>
                      <Text style={[s.chipText,newZone===z&&s.chipTextActive]}>{z}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={s.inputLabel}>DESCRIPTION</Text>
                <TextInput style={s.input} placeholder="Describe the issue..." placeholderTextColor="#6e7a8a" value={newTitle} onChangeText={setNewTitle} multiline numberOfLines={3}/>

                <Text style={s.inputLabel}>PHOTOS (UP TO 5)</Text>
                <PhotoPicker photos={reportPhotos} setPhotos={setReportPhotos}/>

                <View style={s.twoBtn}>
                  <TouchableOpacity style={s.cancelBtn} onPress={()=>{setModal(false);setReportPhotos([]);}}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.submitBtn} onPress={raiseIssue} disabled={saving||uploading}>
                    {saving||uploading
                      ?<View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                          <ActivityIndicator color="#000" size="small"/>
                          <Text style={s.submitBtnText}>{uploading?'Uploading...':'Saving...'}</Text>
                        </View>
                      :<Text style={s.submitBtnText}>Submit</Text>
                    }
                  </TouchableOpacity>
                </View>
                <View style={{height:20}}/>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Resolve Modal */}
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
  issueCard:           {backgroundColor:'#0f1218',borderWidth:1,borderColor:'rgba(255,255,255,.07)',borderLeftWidth:3,borderRadius:14,padding:16,gap:10},
  issueResolved:       {opacity:0.75},
  issueTop:            {flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},
  priorityBadge:       {paddingHorizontal:8,paddingVertical:3,borderRadius:99},
  priorityText:        {fontSize:10,fontWeight:'700'},
  resolvedBadge:       {flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'rgba(0,200,150,.1)',paddingHorizontal:8,paddingVertical:3,borderRadius:99},
  resolvedBadgeText:   {fontSize:10,fontWeight:'700',color:'#00c896'},
  issueVenueTag:       {fontSize:11,color:'#3a4252'},
  issueDate:           {fontSize:11,color:'#3a4252',marginLeft:'auto'},
  issueTitle:          {fontSize:14,fontWeight:'700',color:'#eef0f4',lineHeight:20},
  issueMeta:           {fontSize:12,color:'#6e7a8a'},
  photoSection:        {gap:6},
  photoLabel:          {fontSize:11,fontWeight:'600'},
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
  viewerOverlay:       {flex:1,backgroundColor:'rgba(0,0,0,.95)',justifyContent:'center',alignItems:'center'},
  viewerClose:         {position:'absolute',top:50,right:20,zIndex:10,backgroundColor:'rgba(255,255,255,.1)',borderRadius:20,padding:8},
  viewerImage:         {width:SCREEN_WIDTH,height:SCREEN_WIDTH*1.2},
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