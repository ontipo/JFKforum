// ============================================================
// Configuration Supabase
// Remplace ces deux valeurs par celles de ton projet Supabase
// (Project Settings > API). La clé "anon" est publique par
// design — ce n'est PAS un secret, la sécurité vient des
// règles RLS définies dans schema.sql.
// ============================================================

const SUPABASE_URL = "https://TON-PROJET.supabase.co";
const SUPABASE_ANON_KEY = "TON-ANON-KEY";

// Le SDK est chargé via CDN dans chaque page HTML (voir <script> en bas du <body>)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
