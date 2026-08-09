// ============================================================
// Configuration Supabase
// Remplace ces deux valeurs par celles de ton projet Supabase
// (Project Settings > API). La clé "anon" est publique par
// design — ce n'est PAS un secret, la sécurité vient des
// règles RLS définies dans schema.sql.
// ============================================================

const SUPABASE_URL = "https://gsnbixszblvonebjbssg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzbmJpeHN6Ymx2b25lYmpic3NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMDA3ODgsImV4cCI6MjEwMTg3Njc4OH0.DBMnLCYWoWT6q9PdE4F3Nd_hcHOqMczhRV5IqsZlnQI";

// Le SDK est chargé via CDN dans chaque page HTML (voir <script> en bas du <body>)
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
