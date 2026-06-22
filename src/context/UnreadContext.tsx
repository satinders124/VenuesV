import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  collection, onSnapshot, query, orderBy, limit, where,
  doc, getDoc, setDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { safeOnSnapshot } from '../config/firestoreHelpers';
import { useAuth } from './AuthContext';

const TEAM_URL = 'https://us-central1-venuev-b24c2.cloudfunctions.net/getVenueTeamMembers';

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
  const [lastRead,    setLastRead]    = useState<Record<string, Date | null>>({});

  const getRoomIds = (venues: any[], members: any[]): string[] => {
    if (!user) return [];

    const getDmId = (memberName: string) => {
      const names = [user.name, memberName].sort();
      return `dm_${names[0].replace(/\s/g,'_')}_${names[1].replace(/\s/g,'_')}`;
    };

    const isOwner   = user.role === 'owner';
    const isManager = user.role === 'manager';
    const isWorker  = user.role === 'cleaner' || user.role === 'staff';

    let roomIds: string[] = [...venues.map((v: any) => v.id)];

    if (isManager || isOwner) {
      const venueMates = members.filter((m: any) =>
        m.name !== user.name && m.role !== 'owner'
      );
      venueMates.forEach((m: any) => roomIds.push(getDmId(m.name)));
    } else if (isWorker) {
      const managers = members.filter((m: any) =>
        m.role === 'manager' && m.venue === user.venue
      );
      managers.forEach((m: any) => roomIds.push(getDmId(m.name)));
    }

    return [...new Set(roomIds)];
  };

  const markRoomRead = async (roomId: string) => {
    if (!user?.name) return;
    const key = `${user.name}_${roomId}`.replace(/\s/g, '_');
    await setDoc(doc(db, 'readReceipts', key), {
      userId: user.name,
      roomId,
      readAt: serverTimestamp(),
    });
    setLastRead(prev => ({ ...prev, [roomId]: new Date() }));
    setRoomUnreads(prev => ({
      ...prev,
      [roomId]: { ...prev[roomId], count: 0 },
    }));
  };

  // Team members fetched via Cloud Function instead of a live Firestore
  // listener — see DashboardScreen for the full explanation. This means
  // the chat room list (DMs available) refreshes on venue list changes,
  // not instantly when a new team member is added elsewhere.
  const fetchMembers = async (venueList: any[]): Promise<any[]> => {
    try {
      const results = await Promise.all(
        venueList.map(v =>
          fetch(TEAM_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callerUid: user?.uid, venueId: v.id }),
          }).then(r => r.json()).catch(() => ({ members: [] }))
        )
      );
      const allMembers = results.flatMap(r => r.members || []);
      return Array.from(new Map(allMembers.map((m: any) => [m.id, m])).values());
    } catch {
      return [];
    }
  };

  useEffect(() => {
    if (!user?.name) return;

    let venues:  any[] = [];
    let members: any[] = [];
    let roomUnsubs: (() => void)[] = [];

    const subscribeToRooms = () => {
      roomUnsubs.forEach(u => u());
      roomUnsubs = [];

      const roomIds = getRoomIds(venues, members);
      if (roomIds.length === 0) return;

      roomIds.forEach(async roomId => {
        const key = `${user.name}_${roomId}`.replace(/\s/g, '_');
        try {
          const snap = await getDoc(doc(db, 'readReceipts', key));
          if (snap.exists()) {
            const readAt = snap.data().readAt?.toDate?.() || null;
            setLastRead(prev => ({ ...prev, [roomId]: readAt }));
          }
        } catch {}
      });

      roomIds.forEach(roomId => {
        const q = query(
          collection(db, 'chats', roomId, 'messages'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const unsub = safeOnSnapshot(q, snap => {
          if (snap.empty) return;
          const latest = snap.docs[0].data();

          setLastRead(currentLastRead => {
            const lr = currentLastRead[roomId] || null;
            const unread = snap.docs.filter((d: any) => {
              const data = d.data();
              if (data.senderName === user.name) return false;
              if (!lr) return true;
              const msgTime = data.createdAt?.toDate?.();
              return msgTime && msgTime > lr;
            }).length;

            setRoomUnreads(prev => ({
              ...prev,
              [roomId]: {
                count: unread,
                lastText: latest.text || '',
                lastTime: latest.createdAt,
              },
            }));

            return currentLastRead;
          });
        });
        roomUnsubs.push(unsub);
      });
    };

    // Scoped venues query — owners by ownerId, everyone else by
    // assignedUids array-contains.
    const venuesQuery = user.role === 'owner'
      ? query(collection(db, 'venues'), where('ownerId', '==', user.uid))
      : query(collection(db, 'venues'), where('assignedUids', 'array-contains', user.uid));

    const u1 = safeOnSnapshot(venuesQuery, async snap => {
      venues = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      members = await fetchMembers(venues);
      subscribeToRooms();
    });

    return () => {
      u1();
      roomUnsubs.forEach(u => u());
    };
  }, [user?.name]);

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