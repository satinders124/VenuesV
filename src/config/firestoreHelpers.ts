import { onSnapshot, Query, DocumentReference } from 'firebase/firestore';
import { auth } from './firebase';

// Wraps onSnapshot to silently ignore permission-denied errors that occur
// during logout (a brief race: the auth token is cleared before a screen's
// listener has finished tearing down, so one last query fires unauthenticated
// and gets correctly rejected — this is expected, not a bug). Any other
// error, or a permission-denied error while still signed in, still logs
// normally so real issues aren't hidden.
export function safeOnSnapshot(
  ref: Query | DocumentReference,
  onNext: (snapshot: any) => void,
  context?: string
) {
  return onSnapshot(
    ref as any,
    onNext,
    (error: any) => {
      const isPermissionDenied = error?.code === 'permission-denied';
      const isSignedOut = !auth.currentUser;
      if (isPermissionDenied && isSignedOut) {
        // Expected during logout — don't surface as an error
        return;
      }
      console.log(`Firestore listener error${context ? ` (${context})` : ''}:`, error);
    }
  );
}