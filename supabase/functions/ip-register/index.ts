// Crée (ou réutilise) un profil "porte-parole IP".
// Vérifie que l'IP annoncée par le client correspond bien à l'IP réelle de la requête
// (en-tête envoyé par l'infrastructure Supabase), pour empêcher de s'enregistrer sous
// une IP qui n'est pas la sienne.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function getRealIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { claimedIp } = await req.json();
    const realIp = getRealIp(req);

    if (!realIp || realIp !== claimedIp) {
      return new Response(JSON.stringify({ error: "L'IP ne correspond pas à ta connexion actuelle." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: banned } = await supabaseAdmin.from("ip_bans").select("ip").eq("ip", realIp).maybeSingle();
    if (banned) {
      return new Response(JSON.stringify({ error: "Cette adresse IP est bannie du forum." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: existing } = await supabaseAdmin.from("ip_profiles").select("id").eq("ip", realIp).maybeSingle();

    let profileId;
    if (existing) {
      profileId = existing.id;
      await supabaseAdmin.from("ip_profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", profileId);
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("ip_profiles")
        .insert({ ip: realIp })
        .select("id")
        .single();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      profileId = created.id;
    }

    return new Response(JSON.stringify({ success: true, ipProfileId: profileId, ip: realIp }), {
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
