export const SUPABASE_URL = (typeof localStorage !== 'undefined' && localStorage.getItem('raspisanie-supabase-url'))
  || 'https://qyfbteaaglcrglgsbbez.supabase.co';

export const SUPABASE_ANON_KEY = (typeof localStorage !== 'undefined' && localStorage.getItem('raspisanie-supabase-key'))
  || 'sb_publishable_ji7M8s3uSowT8suczfZKpg_mzmq8YEC';

export const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export function getSupabaseClient() {
  if (typeof window !== 'undefined' && window.supabase?.createClient) {
    if (!window._sbClient) {
      window._sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return window._sbClient;
  }
  return null;
}
