// ------------------------------------------------------------
// Supabase client — fill in your project's URL and anon key.
// Find these in your Supabase dashboard: Project Settings -> API.
// (Same pattern as SA Recruiters: public anon key is safe to
// ship client-side because RLS policies do the real gatekeeping.)
// ------------------------------------------------------------
const SUPABASE_URL = 'https://gwvltxmbvgodvuybnclv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3dmx0eG1idmdvZHZ1eWJuY2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMjQwMDMsImV4cCI6MjEwNTYwMDAwM30.eQQobSzegEaAZOOHgkmBDXBS44MJIqNXcbOU7orUsew';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ------------------------------------------------------------
// Every device gets a silent anonymous Supabase Auth session on
// first visit (no phone/email step — stays invisible to the user).
// This is what lets RLS policies like "auth.uid() = auth_user_id"
// actually work: without it, auth.uid() is null and every insert
// into members/patrollers/incidents is rejected.
// Requires: Supabase dashboard -> Authentication -> Providers ->
// Anonymous sign-ins, switched ON.
// ------------------------------------------------------------
async function ensureAuthSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) return session.user;

  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) {
    console.error('Anonymous sign-in failed:', error);
    throw new Error("Couldn't start a session. Check your connection and try again.");
  }
  return data.user;
}
