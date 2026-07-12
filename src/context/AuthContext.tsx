import React, { createContext, useState, useContext, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Role = 'owner' | 'manager' | 'cleaner' | 'staff';

type User = {
  uid: string;
  name: string;
  email: string;
  role: Role;
  venue: string;
  venues?: string[];
  subscriptionStatus?: string;
  trialEndsAt?: any;
  venueCount?: number;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  isLocked: boolean;
  trialDaysLeft: number | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, role: Role, venue: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({ user:null, loading:true, isLocked:false, trialDaysLeft:null, login:async()=>{}, register:async()=>{}, logout:async()=>{}, refreshUser:async()=>{} });
const USER_CACHE_KEY = 'venuesv_user_cache';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Computed: is this owner's trial expired and no active subscription?
  // Only applies to owners — managers/cleaners/staff are never locked.
  const isLocked = (() => {
    if (!user || user.role !== 'owner') return false;
    if (user.subscriptionStatus === 'active') return false;
    if (!user.trialEndsAt) return false;
    const trialEnd = user.trialEndsAt?.toDate
      ? user.trialEndsAt.toDate()
      : new Date(user.trialEndsAt);
    return new Date() > trialEnd;
  })();

  const trialDaysLeft = (() => {
    if (!user || user.role !== 'owner') return null;
    if (user.subscriptionStatus === 'active') return null;
    if (!user.trialEndsAt) return null;
    const trialEnd = user.trialEndsAt?.toDate
      ? user.trialEndsAt.toDate()
      : new Date(user.trialEndsAt);
    const days = Math.ceil((trialEnd.getTime() - Date.now()) / 864e5);
    return days > 0 ? days : 0;
  })();

  useEffect(() => {
    // Load cached user immediately so app opens fast
    AsyncStorage.getItem(USER_CACHE_KEY).then(cached => {
      if (cached) {
        setUser(JSON.parse(cached));
        setLoading(false);
      }
    }).catch(() => {});

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (snap.exists()) {
            const userData = { uid: firebaseUser.uid, ...snap.data() } as User;
            setUser(userData);
            // Cache for next time
            AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData)).catch(() => {});
          } else {
            setUser(null);
            AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
          }
        } catch {
          // Keep cached user if Firestore fails
        }
      } else {
        setUser(null);
        AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (
    email: string, password: string,
    name: string, role: Role, venue: string
  ) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const profile = { name, email, role, venue };
    await setDoc(doc(db, 'users', cred.user.uid), profile);
  };

  const refreshUser = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    try {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (snap.exists()) {
        const userData = { uid: firebaseUser.uid, ...snap.data() } as User;
        setUser(userData);
        AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData)).catch(() => {});
      }
    } catch { }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, loading, isLocked, trialDaysLeft, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);