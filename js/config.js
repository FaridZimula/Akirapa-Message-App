// Akirapa Messaging App - Supabase Configuration & Client Initialization

// ====================================================================
// REPLACE THESE WITH YOUR SUPABASE PROJECT CREDENTIALS:
// Find them at https://app.supabase.com -> Project Settings -> API
// ====================================================================
const SUPABASE_URL = window.ENV_SUPABASE_URL || "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = window.ENV_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

let supabaseClient = null;

function initSupabase() {
  if (typeof supabase === 'undefined') {
    console.error('Supabase SDK not loaded. Ensure @supabase/supabase-js is included.');
    return null;
  }

  if (SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL" || !SUPABASE_URL) {
    console.warn('⚠️ Supabase URL is not set in js/config.js. Please update SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = supabaseClient;
    return supabaseClient;
  } catch (err) {
    console.error('Error initializing Supabase client:', err);
    return null;
  }
}

// Global accessor
function getSupabase() {
  if (!supabaseClient) {
    return initSupabase();
  }
  return supabaseClient;
}
