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

window.SUPABASE_URL = 'https://vzitlzzbdnnxigexopdj.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_7zZi5H-rgAQ8PzC99MrHNA__0vA02DQ';
