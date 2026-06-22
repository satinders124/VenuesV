// NOTE: This client-side task/issue reset has been intentionally disabled.
//
// Reasons:
// 1. It queried 'tasks' and 'issues' with no venueId scoping — it would
//    reset EVERY customer's tasks globally, not just the current user's
//    venues. This was a cross-tenant bug even before Firestore security
//    rules were tightened.
// 2. It writes to 'appState/taskResets', which the security rules now
//    correctly block from client writes (Admin SDK / Cloud Functions only).
// 3. Running this per-user, per-app-open is unreliable and wasteful even
//    if it were scoped correctly — daily/weekly resets and 7-day cleanup
//    now run server-side via the dailyTaskReset scheduled Cloud Function.
//
// This is now a no-op, kept only so the existing import in App.tsx doesn't
// break. Safe to delete the import + this file entirely in a future cleanup.
export async function resetTasksIfNeeded() {
  // Intentionally disabled — see comment above. dailyTaskReset Cloud
  // Function (scheduled, 00:05 Australia/Brisbane) handles this now.
  return;
}