// Fonction Supabase Edge — réinitialisation sans PDF de code.
// Vérification faible (par design, faute d'un autre secret disponible) : la personne
// doit prouver qu'elle connaît l'adresse e-mail EXACTE du compte, en la recopiant dans
// le PDF-modèle (assets/password_reset_template2.pdf) puis en le renvoyant. Le texte est
// extrait côté client puis revérifié ici, côté serveur, avant tout changement.
//
// Déployée avec : supabase functions deploy reset-password-no-pdf

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const CODE_CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$?!%#@";

function randomSegment(length) {
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_CHARSET[array[i] % CODE_CHARSET.length];
  return out;
}

function generateRecoveryCode() {
  return `code:${randomSegment(240)}NIP${randomSegment(320)}`;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { username, claimedEmail, newPassword } = await req.json();

    if (!username || !claimedEmail || !newPassword || newPassword.length < 8) {
      return new Response(JSON.stringify({ error: "Champs manquants ou mot de passe trop court." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Utilisateur introuvable." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    if (authError || !authUser?.user?.email) {
      return new Response(JSON.stringify({ error: "Impossible de vérifier ce compte." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (authUser.user.email.trim().toLowerCase() !== claimedEmail.trim().toLowerCase()) {
      return new Response(JSON.stringify({ error: "L'adresse e-mail ne correspond pas à ce compte." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: newPassword
    });
    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const newCode = generateRecoveryCode();
    const newCodeHash = await sha256Hex(newCode);
    await supabaseAdmin.from("profiles").update({ recovery_code_hash: newCodeHash }).eq("id", profile.id);

    return new Response(JSON.stringify({ success: true, username: profile.username, newCode }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "Erreur serveur." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
