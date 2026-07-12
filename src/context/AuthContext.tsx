import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../config/supabase';
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

  const fetchUserData = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('uid', uid)
        .single();
        
      if (data) {
        const userData = { ...data } as User;
        setUser(userData);
        AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData)).catch(() => {});
      } else {
        setUser(null);
        AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
      }
    } catch {
      // Keep cached user if fetch fails
    }
  };

  useEffect(() => {
    // Load cached user immediately so app opens fast
    AsyncStorage.getItem(USER_CACHE_KEY).then(cached => {
      if (cached) {
        setUser(JSON.parse(cached));
        setLoading(false);
      }
    }).catch(() => {});

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setUser(null);
        AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
      }
      setLoading(false);
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await fetchUserData(session.user.id);
      } else {
        setUser(null);
        AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const register = async (
    email: string, password: string,
    name: string, role: Role, venue: string
  ) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.user) {
      const profile = { uid: data.user.id, name, email, role, venue };
      const { error: dbError } = await supabase.from('users').insert([profile]);
      if (dbError) throw dbError;
    }
  };

  const refreshUser = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      await fetchUserData(data.session.user.id);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
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