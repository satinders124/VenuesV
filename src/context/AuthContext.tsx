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
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, role: Role, venue: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
const USER_CACHE_KEY = 'venuesv_user_cache';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);