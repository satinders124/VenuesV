import { db } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';

export async function seedTasks() {
  // Delete existing tasks first
  const existing = await getDocs(collection(db, 'tasks'));
  for (const d of existing.docs) await deleteDoc(d.ref);

  const tasks = [
    // ── DAILY TASKS ──
    { title:'Vacuum all areas',              zone:'All Areas',    frequency:'daily',  priority:'high',   icon:'🧹', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Mop and sanitise floors',       zone:'All Areas',    frequency:'daily',  priority:'high',   icon:'🪣', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Clean and restock restrooms',   zone:'Restrooms',    frequency:'daily',  priority:'high',   icon:'🚻', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Wipe down tables and benches',  zone:'Front Bar',    frequency:'daily',  priority:'medium', icon:'🍺', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Empty all rubbish bins',        zone:'All Areas',    frequency:'daily',  priority:'medium', icon:'🗑️', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Restock hand soap dispensers',  zone:'Restrooms',    frequency:'daily',  priority:'medium', icon:'🧴', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Wipe down gaming machines',     zone:'Gaming Room',  frequency:'daily',  priority:'low',    icon:'🎰', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Sweep carpark entrance',        zone:'Carpark',      frequency:'daily',  priority:'low',    icon:'🚗', assignedTo:'all',   venueId:'eagle-heights', done:false },

    // ── WEEKLY TASKS ──
    { title:'Deep clean all restrooms',      zone:'Restrooms',    frequency:'weekly', priority:'high',   icon:'🚿', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Clean windows and glass doors', zone:'All Areas',    frequency:'weekly', priority:'medium', icon:'🪟', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Degrease kitchen entry floor',  zone:'Kitchen Entry',frequency:'weekly', priority:'high',   icon:'🍽️', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Pressure wash beer garden',     zone:'Beer Garden',  frequency:'weekly', priority:'medium', icon:'🌿', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Clean behind bar equipment',    zone:'Front Bar',    frequency:'weekly', priority:'medium', icon:'🍺', assignedTo:'all',   venueId:'eagle-heights', done:false },
    { title:'Full carpark litter sweep',     zone:'Carpark',      frequency:'weekly', priority:'low',    icon:'🚗', assignedTo:'all',   venueId:'eagle-heights', done:false },
  ];

  for (const task of tasks) {
    await addDoc(collection(db, 'tasks'), { ...task, createdAt: serverTimestamp() });
  }

  console.log('✅ Tasks seeded!');
}