// ============================================================
// SUPABASE CONFIGURATION
// ============================================================

const SUPABASE_URL = "https://nnxpzlcrongncnquelav.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ueHB6bGNyb25nbmNucXVlbGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxMjAxNDAsImV4cCI6MjEwMDY5NjE0MH0.EkGypc_arPAIwiolhOxDrmo8OqNnLCJzUelk7ouRMp8";

let supabaseClient = null;

function initSupabase() {
  if (typeof supabase === 'undefined') {
    console.error('Supabase SDK not loaded.');
    return null;
  }

  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = supabaseClient;
    return supabaseClient;
  } catch (err) {
    console.error('Error initializing Supabase:', err);
    return null;
  }
}

function getSupabase() {
  if (!supabaseClient) {
    return initSupabase();
  }
  return supabaseClient;
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});