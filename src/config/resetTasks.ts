import { collection, getDocs, updateDoc, doc, getDoc, setDoc, query, where, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function resetTasksIfNeeded() {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const dayOfWeek = now.getDay();

    const resetSnap = await getDoc(doc(db, 'appState', 'taskResets'));
    const resets = resetSnap.exists() ? resetSnap.data() : {};

    const lastDailyReset  = resets.lastDailyReset  || '';
    const lastWeeklyReset = resets.lastWeeklyReset || '';

    let didDailyReset  = false;
    let didWeeklyReset = false;

    // Daily reset
    if (lastDailyReset !== todayStr) {
      const q = query(collection(db,'tasks'), where('frequency','==','daily'), where('done','==',true));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => updateDoc(doc(db,'tasks',d.id),{done:false})));
      didDailyReset = true;
    }

    // Weekly reset — Mondays only
    if (dayOfWeek === 1 && lastWeeklyReset !== todayStr) {
      const q = query(collection(db,'tasks'), where('frequency','==','weekly'), where('done','==',true));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => updateDoc(doc(db,'tasks',d.id),{done:false})));
      didWeeklyReset = true;
    }

    // Delete resolved issues older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate()-7);
    const resolvedSnap = await getDocs(
      query(collection(db,'issues'), where('status','==','resolved'))
    );
    const toDelete = resolvedSnap.docs.filter(d => {
      const resolvedAt = d.data().resolvedAt?.toDate?.();
      return resolvedAt && resolvedAt < sevenDaysAgo;
    });
    if (toDelete.length > 0) {
      await Promise.all(toDelete.map(d => deleteDoc(doc(db,'issues',d.id))));
      console.log(`Removed ${toDelete.length} old resolved issues`);
    }

    // Save reset timestamps
    if (didDailyReset || didWeeklyReset) {
      await setDoc(doc(db,'appState','taskResets'), {
        lastDailyReset:  didDailyReset  ? todayStr : lastDailyReset,
        lastWeeklyReset: didWeeklyReset ? todayStr : lastWeeklyReset,
        updatedAt: now.toISOString(),
      });
    }

  } catch (err) {
    console.log('Task reset skipped:', err);
  }
}