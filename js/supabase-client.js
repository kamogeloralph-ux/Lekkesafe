// ------------------------------------------------------------
// Supabase client — fill in your project's URL and anon key.
// Find these in your Supabase dashboard: Project Settings -> API.
// (Same pattern as SA Recruiters: public anon key is safe to
// ship client-side because RLS policies do the real gatekeeping.)
// ------------------------------------------------------------
const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
