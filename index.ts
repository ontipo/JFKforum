// ============================================================
// Edge Function : recover-account
// Déploiement : supabase functions deploy recover-account
//
// Reçoit { email, codeHash, newPassword }, vérifie que codeHash
// correspond au hash stocké dans profiles.recovery_code_hash,
// puis réinitialise le mot de passe via la clé service_role
// (jamais exposée au client).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, codeHash, newPassword } = await req.json();

    if (!email || !codeHash || !newPassword) {
      return new Response(JSON.stringify({ error: "Champs manquants." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 1. Retrouver l'utilisateur via son email
    const { data: usersList, error: listError } = await admin.auth.admin.listUsers();
    if (listError) throw listError;

    const authUser = usersList.users.find((u) => u.email === email);
    if (!authUser) {
      return new Response(JSON.stringify({ error: "Aucun compte pour cet email." }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // 2. Vérifier le hash du code contre profiles.recovery_code_hash
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("recovery_code_hash")
      .eq("id", authUser.id)
      .single();

    if (profileError || !profile) throw profileError ?? new Error("Profil introuvable.");

    if (profile.recovery_code_hash !== codeHash) {
      return new Response(JSON.stringify({ error: "Code invalide pour ce compte." }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    // 3. Réinitialiser le mot de passe
    const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
      password: newPassword,
    });
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? "Erreur serveur." }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
