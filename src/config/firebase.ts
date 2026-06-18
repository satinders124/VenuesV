import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDFWaRNJS4RTM2_9b0HDSTeP-ToRe2rXZw",
  authDomain: "venuev-b24c2.firebaseapp.com",
  projectId: "venuev-b24c2",
  storageBucket: "venuev-b24c2.firebasestorage.app",
  messagingSenderId: "192243799253",
  appId: "1:192243799253:web:efa49e62d649a4379afe5c",
};

const app = initializeApp(firebaseConfig);
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);