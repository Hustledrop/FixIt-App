// FixIt User Account Architecture — Prepared for future auth
// Pluggable backend: currently uses localStorage, ready for Supabase/Firebase
// 
// To activate Supabase: replace localAdapter with supabaseAdapter
// import { createClient } from '@supabase/supabase-js'
//
// Schema (future):
// user: { id, email, createdAt, lang, location }
// diagnosisHistory: [{ id, userId, problem, category, result, createdAt }]
// savedImages: [{ id, userId, url, createdAt }]
// favoriteParts: [{ id, userId, partName, category, query }]
// preferences: { lang, gps, units }

const STORAGE_KEY = 'fixit_user';

// Local adapter — swap out for Supabase/Firebase when ready
const localAdapter = {
  getUser:   ()    => JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'),
  setUser:   (u)   => localStorage.setItem(STORAGE_KEY, JSON.stringify(u)),
  clearUser: ()    => localStorage.removeItem(STORAGE_KEY),
  // History stored separately for size
  getHistory: ()   => JSON.parse(localStorage.getItem('fixit_history') || '[]'),
  addHistory: (h)  => {
    const arr = JSON.parse(localStorage.getItem('fixit_history') || '[]');
    arr.unshift(h);
    localStorage.setItem('fixit_history', JSON.stringify(arr.slice(0, 50)));
  },
};

export const UserAccount = {
  // Current user (null if not logged in)
  current: () => localAdapter.getUser(),

  // Guest mode — saves prefs locally without account
  savePreferences: (prefs) => {
    const user = localAdapter.getUser() || { id: 'guest', createdAt: new Date().toISOString() };
    localAdapter.setUser({ ...user, ...prefs });
  },

  // Save a diagnosis to history (works for guests too)
  saveDiagnosis: ({ problem, category, result }) => {
    localAdapter.addHistory({
      id: Date.now().toString(),
      problem: problem?.substring(0, 200),
      category,
      status: result?.status,
      confidence: result?.confidence,
      createdAt: new Date().toISOString(),
    });
  },

  // Get diagnosis history
  getHistory: () => localAdapter.getHistory(),

  // Future: login/logout — no-ops until backend is wired
  login:  async () => { throw new Error('Auth not implemented yet'); },
  logout: async () => { localAdapter.clearUser(); },
  signup: async () => { throw new Error('Auth not implemented yet'); },
};

export default UserAccount;
