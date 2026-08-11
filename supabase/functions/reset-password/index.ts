// Fonction Supabase Edge — vérifie le code de récupération, change le mot de passe,
// puis génère un NOUVEAU code de récupération (l'ancien devient invalide).
// Déployée avec : supabase functions deploy reset-password
// Les variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement.

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
    const { code, newPassword } = await req.json();

    if (!code || !newPassword || newPassword.length < 8) {
      return new Response(JSON.stringify({ error: "Code ou nouveau mot de passe invalide." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );

    const codeHash = await sha256Hex(code.trim());

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq("recovery_code_hash", codeHash)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Code de récupération invalide." }), {
        status: 404,
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

    // Le code utilisé devient invalide : on en génère un nouveau immédiatement.
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
