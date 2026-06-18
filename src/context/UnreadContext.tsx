import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  collection, onSnapshot, query, orderBy, limit,
  doc, getDoc, setDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './AuthContext';

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

  // Get all room IDs this user should subscribe to
  const getRoomIds = (venues: any[], members: any[]): string[] => {
    if (!user) return [];

    const getDmId = (memberName: string) => {
      const names = [user.name, memberName].sort();
      return `dm_${names[0].replace(/\s/g,'_')}_${names[1].replace(/\s/g,'_')}`;
    };

    const isOwner   = user.role === 'owner';
    const isManager = user.role === 'manager';
    const isWorker  = user.role === 'cleaner' || user.role === 'staff';

    let roomIds: string[] = [];

    // Venue group chats
    if (isOwner) {
      roomIds = [...venues.map((v: any) => v.id)];
    } else {
      const myVenue = venues.find((v: any) => v.name === user.venue);
      if (myVenue) roomIds.push(myVenue.id);
    }

    // DM rooms
    if (isManager || isOwner) {
      // Managers/owners get DMs with all staff at their venue
      const venueMates = members.filter((m: any) =>
        m.name !== user.name &&
        m.role !== 'owner' &&
        (isOwner ? true : m.venue === user.venue)
      );
      venueMates.forEach((m: any) => roomIds.push(getDmId(m.name)));
    } else if (isWorker) {
      // Workers get DMs with managers at their venue
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

      // Load last read timestamps
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

      // Subscribe to each room
      roomIds.forEach(roomId => {
        const q = query(
          collection(db, 'chats', roomId, 'messages'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const unsub = onSnapshot(q, snap => {
          if (snap.empty) return;
          const latest = snap.docs[0].data();

          setLastRead(currentLastRead => {
            const lr = currentLastRead[roomId] || null;
            const unread = snap.docs.filter(d => {
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

    const u1 = onSnapshot(collection(db, 'venues'), snap => {
      venues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      subscribeToRooms();
    });

    const u2 = onSnapshot(collection(db, 'users'), snap => {
      members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      subscribeToRooms();
    });

    return () => {
      u1();
      u2();
      roomUnsubs.forEach(u => u());
    };
  }, [user?.name]);

  // Calculate total unread
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