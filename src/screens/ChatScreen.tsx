import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, ActivityIndicator, RefreshControl
} from 'react-native';
import {
  collection, addDoc, onSnapshot, query,
  orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useUnread } from '../context/UnreadContext';
import { Ionicons } from '@expo/vector-icons';

type Message  = { id:string; text:string; senderName:string; senderRole:string; createdAt:any; };
type Venue    = { id:string; name:string; suburb:string; };
type Member   = { id:string; name:string; role:string; email:string; venue:string; venues?:string[]; };
type ChatRoom = { id:string; name:string; subtitle:string; type:'venue'|'dm'; avatar:string; avatarColor:string; };
type FilterType = 'venues'|'staff'|'cleaners'|'manager';

const ROLE_COLOR: Record<string,string> = {
  owner:'#f5a623', manager:'#2c7ef7', cleaner:'#00c896', staff:'#a855f7',
};

export default function ChatScreen() {
  const { user } = useAuth();
  const { roomUnreads, markRoomRead } = useUnread();
  const totalUnread = Object.values(roomUnreads).reduce((sum,r)=>sum+(r.count||0),0);

  const isManager = user?.role === 'manager' || user?.role === 'owner';
  const isWorker  = user?.role === 'cleaner' || user?.role === 'staff';

  const [venues,     setVenues]     = useState<Venue[]>([]);
  const [members,    setMembers]    = useState<Member[]>([]);
  const [activeRoom, setActiveRoom] = useState<ChatRoom|null>(null);
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [text,       setText]       = useState('');
  const [loading,    setLoading]    = useState(true);
  const [sending,    setSending]    = useState(false);
  const [filter,     setFilter]     = useState<FilterType>('venues');
  const listRef = useRef<FlatList>(null);

  const getDmId = (memberName: string) => {
    const names = [user?.name||'', memberName].sort();
    return `dm_${names[0].replace(/\s/g,'_')}_${names[1].replace(/\s/g,'_')}`;
  };

  const getInitials = (name:string) =>
    name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?';

  // Load venues and members
  useEffect(() => {
    const u1 = onSnapshot(collection(db,'venues'), snap => {
      setVenues(snap.docs.map(d=>({id:d.id,...d.data()})) as Venue[]);
      setLoading(false);
    });
    const u2 = onSnapshot(collection(db,'users'), snap => {
      setMembers(snap.docs.map(d=>({id:d.id,...d.data()})) as Member[]);
    });
    return ()=>{u1();u2();};
  }, []);

  // Load messages for active room
  useEffect(() => {
    if (!activeRoom) return;
    markRoomRead(activeRoom.id);
    const q = query(collection(db,'chats',activeRoom.id,'messages'),orderBy('createdAt','asc'));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d=>({id:d.id,...d.data()})) as Message[]);
      setTimeout(()=>listRef.current?.scrollToEnd({animated:true}),100);
      markRoomRead(activeRoom.id);
    });
    return unsub;
  }, [activeRoom]);

  const sendMessage = async () => {
    if (!text.trim()||!activeRoom) return;
    setSending(true);
    try {
      await addDoc(collection(db,'chats',activeRoom.id,'messages'), {
        text: text.trim(),
        senderName: user?.name,
        senderRole: user?.role,
        createdAt: serverTimestamp(),
      });
      setText('');
      markRoomRead(activeRoom.id);
    } catch(err){ console.error(err); }
    setSending(false);
  };

  const formatTime = (ts:any) => {
    if (!ts?.toDate) return '';
    const d = ts.toDate();
    const diff = Date.now()-d.getTime();
    if (diff<60000) return 'now';
    if (diff<3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff<86400000) return d.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'});
    return d.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
  };

  const formatMsgTime = (ts:any) => {
    if (!ts?.toDate) return '';
    return ts.toDate().toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'});
  };

  const isMe = (msg:Message) => msg.senderName===user?.name;

  const getChatRooms = (): ChatRoom[] => {
    if (isWorker) {
      if (filter === 'venues') {
        const userVenues = user?.venues || (user?.venue ? [user.venue] : []);
return venues
  .filter(v => userVenues.includes(v.name))
          .map(v=>({
            id:v.id, name:v.name, subtitle:'Group Chat · All team',
            type:'venue' as const, avatar:v.name.charAt(0), avatarColor:'#00c896',
          }));
      }
      if (filter === 'manager') {
        return members
          .filter(m => m.role==='manager' && m.venue===user?.venue)
          .map(m=>({
            id:getDmId(m.name), name:m.name, subtitle:'Site Manager · Direct Message',
            type:'dm' as const, avatar:getInitials(m.name), avatarColor:'#2c7ef7',
          }));
      }
      return [];
    }
    if (filter==='venues') {
      return venues
        .filter(v => user?.role==='owner' ? true : v.name===user?.venue)
        .map(v=>({
          id:v.id, name:v.name, subtitle:v.suburb||'Group Chat',
          type:'venue' as const, avatar:v.name.charAt(0), avatarColor:'#00c896',
        }));
    }
    const role = filter==='staff'?'staff':'cleaner';
    return members
      .filter(m=>m.role===role && m.name!==user?.name && m.venue===user?.venue)
      .map(m=>({
        id:getDmId(m.name), name:m.name, subtitle:`${m.role} · Direct Message`,
        type:'dm' as const, avatar:getInitials(m.name), avatarColor:ROLE_COLOR[m.role]||'#6e7a8a',
      }));
  };

  const rooms = getChatRooms();

  // ── CHAT LIST ───────────────────────────────────────
  if (!activeRoom) {
    const filters: {key:FilterType; label:string}[] = isWorker
      ? [{key:'venues',label:'🏢 Venue'},{key:'manager',label:'💬 Manager'}]
      : [{key:'venues',label:'🏢 Venues'},{key:'staff',label:'🍺 Staff'},{key:'cleaners',label:'🧹 Cleaners'}];

    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.heading}>Chats</Text>
            {totalUnread > 0 && (
              <View style={s.totalBadge}>
                <Text style={s.totalBadgeText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
              </View>
            )}
          </View>
          <View style={s.onlineWrap}>
            <View style={s.onlineDot}/>
            <Text style={s.onlineText}>Live</Text>
          </View>
        </View>

        <View style={s.filterRow}>
  {filters.map(f=>{
    const tabUnread = Object.entries(roomUnreads)
  .filter(([roomId]) => {
    if (f.key === 'venues') return !roomId.startsWith('dm_');
    return roomId.startsWith('dm_');
  })
  .reduce((sum, [, r]) => sum + (r.count || 0), 0);
    return (
      <TouchableOpacity key={f.key} style={[s.filterTab,filter===f.key&&s.filterTabActive]} onPress={()=>setFilter(f.key)}>
        <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
          <Text style={[s.filterTabText,filter===f.key&&s.filterTabTextActive]}>{f.label}</Text>
          {tabUnread > 0 && (
            <View style={{backgroundColor: filter===f.key?'#000':'#f24e6e',borderRadius:99,minWidth:16,height:16,paddingHorizontal:4,alignItems:'center',justifyContent:'center'}}>
              <Text style={{fontSize:9,fontWeight:'800',color: filter===f.key?'#00c896':'#fff'}}>{tabUnread > 9?'9+':tabUnread}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  })}
</View>

        {loading
          ?<ActivityIndicator color="#00c896" style={{marginTop:60}}/>
          :<FlatList
  data={rooms}
  keyExtractor={r=>r.id}
  refreshControl={
    <RefreshControl
      refreshing={false}
      onRefresh={()=>{}}
      tintColor="#00c896"
      colors={['#00c896']}
    />
  }
  ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Ionicons name="chatbubbles-outline" color="#3a4252" size={48}/>
                <Text style={s.emptyText}>
                  {filter==='manager'?'No manager assigned yet':'No chats found'}
                </Text>
              </View>
            }
            renderItem={({item:room})=>{
              const last = roomUnreads[room.id]||null;
              const unread = last?.count || 0;
              return (
                <TouchableOpacity style={s.chatItem} onPress={()=>setActiveRoom(room)}>
                  <View style={s.avatarWrap}>
                    <View style={[s.chatAvatar,{backgroundColor:room.avatarColor+'33'}]}>
                      <Text style={[s.chatAvatarText,{color:room.avatarColor}]}>{room.avatar}</Text>
                    </View>
                    {unread > 0 && (
                      <View style={s.avatarBadge}>
                        <Text style={s.avatarBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.chatInfo}>
                    <View style={s.chatTop}>
                      <Text style={[s.chatName, unread>0&&s.chatNameUnread]}>{room.name}</Text>
                      {last&&<Text style={s.chatTime}>{formatTime(last.lastTime)}</Text>}
                    </View>
                    <Text style={[s.chatLast, unread>0&&s.chatLastUnread]} numberOfLines={1}>
                      {last?.lastText||room.subtitle}
                    </Text>
                  </View>
                  {unread > 0
                    ? <View style={s.unreadBadge}><Text style={s.unreadBadgeText}>{unread > 99 ? '99+' : unread}</Text></View>
                    : <Ionicons name="chevron-forward" color="#3a4252" size={16}/>
                  }
                </TouchableOpacity>
              );
            }}
          />
        }
      </SafeAreaView>
    );
  }

  // ── CONVERSATION ────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      <View style={s.chatHeader}>
        <TouchableOpacity style={s.backBtn} onPress={()=>{setActiveRoom(null);setMessages([]);}}>
          <Ionicons name="arrow-back" color="#eef0f4" size={22}/>
        </TouchableOpacity>
        <View style={[s.chatAvatar,{backgroundColor:activeRoom.avatarColor+'33'}]}>
          <Text style={[s.chatAvatarText,{color:activeRoom.avatarColor}]}>{activeRoom.avatar}</Text>
        </View>
        <View style={s.chatHeaderInfo}>
          <Text style={s.chatHeaderName}>{activeRoom.name}</Text>
          <Text style={s.chatHeaderSub}>{activeRoom.type==='venue'?'Group Chat · All team':'Direct Message'}</Text>
        </View>
        <View style={s.onlineWrap}>
          <View style={s.onlineDot}/>
          <Text style={s.onlineText}>Live</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={60}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item=>item.id}
          contentContainerStyle={s.messageList}
          onContentSizeChange={()=>listRef.current?.scrollToEnd({animated:true})}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Ionicons name="chatbubbles-outline" color="#3a4252" size={40}/>
              <Text style={s.emptyText}>No messages yet</Text>
              <Text style={s.emptySub}>Say hi 👋</Text>
            </View>
          }
          renderItem={({item,index}:any)=>{
            const mine=isMe(item);
            const roleColor=ROLE_COLOR[item.senderRole]||'#6e7a8a';
            const prev=index>0?messages[index-1]:null;
            const showSender=!mine&&(!prev||prev.senderName!==item.senderName);
            const next=messages[index+1];
            const showTime=!next||next.senderName!==item.senderName;
            return (
              <View style={{marginBottom:showTime?10:2}}>
                {showSender&&(
                  <View style={s.senderRow}>
                    <View style={[s.msgAvatar,{backgroundColor:roleColor+'33'}]}>
                      <Text style={[s.msgAvatarText,{color:roleColor}]}>{getInitials(item.senderName)}</Text>
                    </View>
                    <Text style={[s.senderName,{color:roleColor}]}>{item.senderName}</Text>
                  </View>
                )}
                <View style={[s.msgWrap,mine?s.msgWrapMe:s.msgWrapOther]}>
                  {!mine&&<View style={s.msgAvatarSpacer}/>}
                  <View style={[s.bubble,mine?s.bubbleMe:s.bubbleOther]}>
                    <Text style={[s.msgText,mine?s.msgTextMe:s.msgTextOther]}>{item.text}</Text>
                  </View>
                </View>
                {showTime&&(
                  <Text style={[s.time,mine?s.timeMe:s.timeOther]}>{formatMsgTime(item.createdAt)}</Text>
                )}
              </View>
            );
          }}
        />
        <View style={s.inputWrap}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor="#6e7a8a"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[s.sendBtn,(!text.trim()||sending)&&s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!text.trim()||sending}
          >
            {sending
              ?<ActivityIndicator color="#000" size="small"/>
              :<Ionicons name="send" color="#000" size={18}/>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:          {flex:1,backgroundColor:'#080a0e'},
  header:             {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:20,paddingBottom:14,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.07)'},
  headerLeft:         {flexDirection:'row',alignItems:'center',gap:10},
  heading:            {fontSize:22,fontWeight:'800',color:'#eef0f4'},
  totalBadge:         {backgroundColor:'#f24e6e',borderRadius:99,minWidth:20,height:20,paddingHorizontal:6,alignItems:'center',justifyContent:'center'},
  totalBadgeText:     {fontSize:11,fontWeight:'800',color:'#fff'},
  onlineWrap:         {flexDirection:'row',alignItems:'center',gap:5},
  onlineDot:          {width:7,height:7,borderRadius:99,backgroundColor:'#00c896'},
  onlineText:         {fontSize:12,color:'#00c896',fontWeight:'600'},
  filterRow:          {flexDirection:'row',padding:14,gap:8,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.07)'},
  filterTab:          {flex:1,paddingVertical:8,borderRadius:99,backgroundColor:'#161b24',borderWidth:1,borderColor:'rgba(255,255,255,.07)',alignItems:'center'},
  filterTabActive:    {backgroundColor:'#00c896',borderColor:'#00c896'},
  filterTabText:      {fontSize:11,color:'#6e7a8a',fontWeight:'600'},
  filterTabTextActive:{color:'#000'},
  chatItem:           {flexDirection:'row',alignItems:'center',gap:12,padding:16,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.05)'},
  avatarWrap:         {position:'relative',width:48,height:48},
  chatAvatar:         {width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},
  chatAvatarText:     {fontSize:18,fontWeight:'800'},
  avatarBadge:        {position:'absolute',top:-2,right:-2,backgroundColor:'#f24e6e',borderRadius:99,minWidth:18,height:18,paddingHorizontal:4,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#080a0e'},
  avatarBadgeText:    {fontSize:9,fontWeight:'800',color:'#fff'},
  chatInfo:           {flex:1,gap:4},
  chatTop:            {flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  chatName:           {fontSize:15,fontWeight:'600',color:'#eef0f4'},
  chatNameUnread:     {fontWeight:'800',color:'#fff'},
  chatTime:           {fontSize:11,color:'#6e7a8a'},
  chatLast:           {fontSize:13,color:'#6e7a8a'},
  chatLastUnread:     {color:'#eef0f4',fontWeight:'600'},
  unreadBadge:        {backgroundColor:'#00c896',borderRadius:99,minWidth:22,height:22,paddingHorizontal:6,alignItems:'center',justifyContent:'center'},
  unreadBadgeText:    {fontSize:11,fontWeight:'800',color:'#000'},
  emptyWrap:          {alignItems:'center',paddingTop:80,gap:10},
  emptyText:          {fontSize:15,fontWeight:'700',color:'#6e7a8a'},
  emptySub:           {fontSize:13,color:'#3a4252'},
  chatHeader:         {flexDirection:'row',alignItems:'center',gap:12,padding:14,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.07)'},
  backBtn:            {width:36,height:36,alignItems:'center',justifyContent:'center'},
  chatHeaderInfo:     {flex:1},
  chatHeaderName:     {fontSize:15,fontWeight:'700',color:'#eef0f4'},
  chatHeaderSub:      {fontSize:11,color:'#6e7a8a',marginTop:1},
  messageList:        {padding:16,flexGrow:1},
  senderRow:          {flexDirection:'row',alignItems:'center',gap:8,marginBottom:4,marginLeft:8},
  msgAvatar:          {width:24,height:24,borderRadius:12,alignItems:'center',justifyContent:'center'},
  msgAvatarText:      {fontSize:9,fontWeight:'800'},
  msgAvatarSpacer:    {width:32},
  senderName:         {fontSize:11,fontWeight:'700'},
  msgWrap:            {flexDirection:'row',marginHorizontal:8},
  msgWrapMe:          {justifyContent:'flex-end'},
  msgWrapOther:       {justifyContent:'flex-start'},
  bubble:             {maxWidth:'78%',borderRadius:18,paddingHorizontal:14,paddingVertical:10},
  bubbleMe:           {backgroundColor:'#00c896',borderBottomRightRadius:4},
  bubbleOther:        {backgroundColor:'#1c2230',borderBottomLeftRadius:4},
  msgText:            {fontSize:14,lineHeight:20},
  msgTextMe:          {color:'#000'},
  msgTextOther:       {color:'#eef0f4'},
  time:               {fontSize:10,color:'#6e7a8a',marginTop:3,marginHorizontal:12},
  timeMe:             {textAlign:'right'},
  timeOther:          {textAlign:'left'},
  inputWrap:          {flexDirection:'row',alignItems:'flex-end',gap:10,padding:12,borderTopWidth:1,borderTopColor:'rgba(255,255,255,.07)',backgroundColor:'#0f1218'},
  input:              {flex:1,backgroundColor:'#1c2230',borderRadius:22,paddingHorizontal:16,paddingVertical:10,color:'#eef0f4',fontSize:14,maxHeight:100},
  sendBtn:            {width:42,height:42,borderRadius:21,backgroundColor:'#00c896',alignItems:'center',justifyContent:'center',flexShrink:0},
  sendBtnDisabled:    {backgroundColor:'#1c2230'},
});