const DEFAULT_URL = 'https://pojegdivnkuvyiizmesa.supabase.co';
const DEFAULT_KEY = 'sb_publishable_C9xDHNu5FJocypV1ZlHq1Q_mS7tBO_C';
const RETIRED_URL = 'https://qyfbteaaglcrglgsbbez.supabase.co';

const storedUrl = globalThis.localStorage?.getItem('raspisanie-supabase-url')?.trim().replace(/\/+$/, '');
const storedKey = globalThis.localStorage?.getItem('raspisanie-supabase-key')?.trim();
const useStoredConnection = storedUrl && storedKey && storedUrl !== RETIRED_URL;

export const SUPABASE_URL = useStoredConnection ? storedUrl : DEFAULT_URL;
export const SUPABASE_ANON_KEY = useStoredConnection ? storedKey : DEFAULT_KEY;

export const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
};
if (SUPABASE_ANON_KEY.startsWith('eyJ')) HEADERS.Authorization = 'Bearer ' + SUPABASE_ANON_KEY;

export function getSupabaseClient() {
  if (typeof window !== 'undefined' && window.supabase?.createClient) {
    if (!window._sbClient) {
      window._sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return window._sbClient;
  }
  return null;
}
