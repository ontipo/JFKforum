// Remplissez ces deux valeurs avec celles de votre projet Supabase
// (Project Settings > API). La clé "anon" est publique par nature,
// c'est la sécurité au niveau des lignes (RLS, voir supabase/schema.sql)
// qui protège réellement les données.

export const SUPABASE_URL = "https://rfwhfooczceaamhxfnks.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJmd2hmb29jemNlYWFtaHhmbmtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMTUwMTksImV4cCI6MjEwMTg5MTAxOX0.wEEAIi1mvcK5jtXE0AoZk33F1dZXjUasximDNrpYteQ";

// Clé API IPQualityScore (palier gratuit disponible sur ipqualityscore.com).
// Nécessaire pour la détection VPN/proxy/datacenter du système "porte-parole IP".
// Sans cette clé, la vérification IP refusera tout par prudence.
export const IPQS_API_KEY = "COLLE_TA_CLE_IPQS_ICI";
