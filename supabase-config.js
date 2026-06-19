// ---------------------------------------------------------------------------
// Supabase configuration
// ---------------------------------------------------------------------------
// 1. Create a project at https://supabase.com
// 2. Project Settings -> API -> copy "Project URL" and the "anon public" key
// 3. Paste them below, then reload otc.html
//
// The anon key is safe to expose in the browser; access is protected by the
// Row Level Security (RLS) policies defined on the `rfqs` and `quotes` tables
// (see README.md). Both tables must also be added to the `supabase_realtime`
// publication so quotes, counters, and settlements stream live. There is no
// auth — identity is just a display name the user types (kept in localStorage).
// ---------------------------------------------------------------------------

window.SUPABASE_URL = 'https://zaflldqvenbgfaxtzbjc.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphZmxsZHF2ZW5iZ2ZheHR6YmpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTc1MDAsImV4cCI6MjA5NzI5MzUwMH0._ICBXPBxuBkx39eCxeE5nRxD8D4__TE2_pQsyurs6mk';
