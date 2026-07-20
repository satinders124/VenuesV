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
    // Supabase returns ISO date strings; parse directly
    const trialEnd = new Date(user.trialEndsAt);
    return new Date() > trialEnd;
  })();

  const trialDaysLeft = (() => {
    if (!user || user.role !== 'owner') return null;
    if (user.subscriptionStatus === 'active') return null;
    if (!user.trialEndsAt) return null;
    const trialEnd = new Date(user.trialEndsAt);
    const days = Math.ceil((trialEnd.getTime() - Date.now()) / 864e5);
    return days > 0 ? days : 0;
  })();

  const fetchUserData = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('uid', uid)
        .maybeSingle();
        
      if (error) {
        console.log('fetchUserData error:', error.message);
        // If RLS blocks or table missing, keep cached user but don't crash
        return;
      }
      if (data) {
        const userData = { ...data } as User;
        setUser(userData);
        AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData)).catch(() => {});
      } else {
        console.log('fetchUserData: no profile for uid', uid);
        // If profile missing (invited user not yet repaired), keep auth but clear cache? 
        // Let team APIs repair via ensureMemberProfiles, don't force logout
        // Still keep user as at least uid to avoid infinite loading
        setUser((prev) => prev || null);
      }
    } catch (e) {
      console.log('fetchUserData exception', e);
      // Keep cached user if fetch fails
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    // Safety net: if Supabase hangs (Android emulator network), force loading false after 4s
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        setLoading((prev) => {
          if (prev) console.log('Auth safety timeout - forcing loading false');
          return false;
        });
      }
    }, 4000);

    // Load cached user immediately so app opens fast (Android Studio/Emulator fix)
    AsyncStorage.getItem(USER_CACHE_KEY)
      .then((cached) => {
        if (!mounted) return;
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed?.uid) {
              setUser(parsed as User);
            }
          } catch (e) {
            console.log('Bad cached user JSON, clearing');
            AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        // Don't set loading false here alone - let getSession decide, safety will handle
      });

    // Check active sessions and sets the user
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        if (session?.user) {
          fetchUserData(session.user.id);
        } else {
          setUser(null);
          AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
          setLoading(false);
        }
      })
      .catch((e) => {
        console.log('getSession failed', e);
        if (mounted) setLoading(false);
      });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        await fetchUserData(session.user.id);
      } else {
        setUser(null);
        AsyncStorage.removeItem(USER_CACHE_KEY).catch(() => {});
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const register = async (
    email: string, password: string,
    name: string, role: Role, venue: string
  ) => {
    // The database auth trigger creates the profile. Keeping profile creation
    // server-side prevents a client from assigning itself a privileged role.
    if (role !== 'owner') {
      throw new Error('Team members must be invited by a venue owner.');
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, venue } },
    });
    if (error) throw error;
  };

  const refreshUser = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      await fetchUserData(data.session.user.id);
    }
  };

  const logout = async () => {
    try {
      // Try normal signOut, but don't block if network fails (Android emulator issue)
      await supabase.auth.signOut();
    } catch (e) {
      console.log('signOut error (will force local logout)', e);
      try {
        // Force local scope signout - clears storage even if server unreachable
        await supabase.auth.signOut({ scope: 'local' } as any);
      } catch {}
    } finally {
      // Always clear local state - critical for Android Studio where signOut can hang
      setUser(null);
      setLoading(false);
      try {
        await AsyncStorage.removeItem(USER_CACHE_KEY);
        // Also clear supabase auth storage keys
        await AsyncStorage.removeItem('supabase.auth.token');
      } catch {}
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isLocked, trialDaysLeft, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);