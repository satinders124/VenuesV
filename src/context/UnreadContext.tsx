import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../config/supabase';
import { getVenueTeamMembers } from '../config/teamApi';
import { useAuth } from './AuthContext';
import { fetchVenuesForUser } from '../config/fetchVenues';

type RoomUnread = { count: number; lastText: string; lastTime: any; };

type UnreadContextType = {
  unreadCount: number;
  roomUnreads: Record<string, RoomUnread>;
  setUnreadCount: (count: number) => void;
  markRoomRead: (roomId: string) => Promise<void>;
};

const UnreadContext = createContext<UnreadContextType>({
  unreadCount: 0,
  roomUnreads: {},
  setUnreadCount: () => {},
  markRoomRead: async () => {},
});

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [roomUnreads, setRoomUnreads] = useState<Record<string, RoomUnread>>({});
  // Use ref instead of state to avoid infinite re-render loop
  const lastReadRef = useRef<Record<string, Date | null>>({});
  const getLastRead = () => lastReadRef.current;

  const [venues, setVenues] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);

  const getRoomIds = (vList: any[], mList: any[]): string[] => {
    if (!user) return [];

    const getDmId = (memberName: string) => {
      const names = [user?.name || user?.email || '', memberName].sort();
      return `dm_${names[0].replace(/\s/g,'_')}_${names[1].replace(/\s/g,'_')}`;
    };

    const dmAllowed: Record<string, string[]> = {
      owner:   ['manager'],
      manager: ['owner', 'staff', 'cleaner'],
      cleaner: ['manager', 'staff'],
      staff:   ['manager', 'cleaner'],
    };
    const allowedRoles = dmAllowed[user.role] || [];

    let roomIds: string[] = [...vList.map((v: any) => v.id)];

    const userName = user?.name || user?.email || '';

    const dmPartners = mList.filter((m: any) =>
      m.name !== userName && allowedRoles.includes(m.role)
    );
    dmPartners.forEach((m: any) => roomIds.push(getDmId(m.name)));

    return [...new Set(roomIds)];
  };

  const markRoomRead = async (roomId: string) => {
    if (!user?.uid) return;
    const key = `${user.uid}_${roomId}`;
    
    await supabase.from('read_receipts').upsert({
      id: key,
      userId: user.uid,
      roomId,
      readAt: new Date().toISOString()
    });
    
    lastReadRef.current = { ...lastReadRef.current, [roomId]: new Date() };
    setRoomUnreads(prev => ({
      ...prev,
      [roomId]: { ...prev[roomId], count: 0 },
    }));
  };

  const fetchMembers = async (venueList: any[]): Promise<any[]> => {
    try {
      const results = await Promise.all(
        venueList.map(v => getVenueTeamMembers(v.id).catch(() => []))
      );
      const allMembers = results.flat();
      return Array.from(new Map(allMembers.map((m: any) => [m.id, m])).values());
    } catch {
      return [];
    }
  };

  const fetchVenuesAndMembers = useCallback(async () => {
    if (!user) return;
    try {
      const vList = await fetchVenuesForUser(user.uid, user.role);
      setVenues(vList);
      const mList = await fetchMembers(vList);
      setMembers(mList);
    } catch (err) {
      console.log('UnreadContext fetch error', err);
    }
  }, [user]);

  useEffect(() => {
    fetchVenuesAndMembers();
    
    if (!user) return;
    const channel = supabase.channel('unread_venues_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venues' }, fetchVenuesAndMembers)
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [fetchVenuesAndMembers, user]);

  const updateUnreadData = useCallback(async () => {
    if (!user?.uid) return;
    
    const roomIds = getRoomIds(venues, members);
    if (roomIds.length === 0) return;
    
    try {
      // First get read receipts
      const keys = roomIds.map(id => `${user.uid}_${id}`);
      const { data: receipts } = await supabase.from('read_receipts').select('roomId, readAt').in('id', keys);
      
      const newLastRead: Record<string, Date | null> = {};
      receipts?.forEach(r => {
        newLastRead[r.roomId] = r.readAt ? new Date(r.readAt) : null;
      });
      lastReadRef.current = { ...lastReadRef.current, ...newLastRead };
      
      // Then get recent messages
      const { data: recentMessages } = await supabase
        .from('chat_messages')
        .select('*')
        .in('roomId', roomIds)
        .order('created_at', { ascending: false });
        
      if (!recentMessages) return;
      
      const userName = user?.name || user?.email || '';
      const newRoomUnreads: Record<string, RoomUnread> = {};
      
      roomIds.forEach(roomId => {
        const roomMsgs = recentMessages.filter(m => m.roomId === roomId);
        if (roomMsgs.length === 0) return;
        
        const latest = roomMsgs[0];
        const lr = newLastRead[roomId] || getLastRead()[roomId] || null;
        
        const unread = roomMsgs.filter(m => {
          if (m.senderName === userName) return false;
          if (!lr) return true;
          return new Date(m.created_at) > lr;
        }).length;
        
        newRoomUnreads[roomId] = {
          count: unread,
          lastText: latest.text,
          lastTime: latest.created_at
        };
      });
      
      setRoomUnreads(newRoomUnreads);
    } catch(err) {
      console.log('Error updating unread', err);
    }
  }, [user, venues, members]);

  useEffect(() => {
    if (venues.length === 0) return;
    updateUnreadData();
    
    const roomIds = getRoomIds(venues, members);
    if (roomIds.length === 0) return;
    
    const channel = supabase.channel('unread_messages_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => {
        updateUnreadData();
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [venues, members, user]);

  useEffect(() => {
    const total = Object.values(roomUnreads).reduce((sum, r) => sum + (r.count || 0), 0);
    setUnreadCount(total);
  }, [roomUnreads]);

  return (
    <UnreadContext.Provider value={{ unreadCount, roomUnreads, setUnreadCount, markRoomRead }}>
      {children}
    </UnreadContext.Provider>
  );
}

export const useUnread = () => useContext(UnreadContext);