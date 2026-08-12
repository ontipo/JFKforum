// Publie un commentaire au nom d'un porte-parole IP.
// Revérifie à chaque appel : l'IP réelle de la requête correspond au profil IP visé,
// l'IP n'est pas bannie, le post existe, pas de lien interdit.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function getRealIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : null;
}

const LINK_REGEX = /(https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,})/i;
const ALLOWED_LINK = /^https?:\/\/ontipo\.github\.io\//i;

function containsForbiddenLink(text) {
  const matches = text.match(new RegExp(LINK_REGEX, "gi")) || [];
  return matches.some((m) => !ALLOWED_LINK.test(text.slice(text.indexOf(m))));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { ipProfileId, postId, body, parentCommentId } = await req.json();
    const realIp = getRealIp(req);

    if (!ipProfileId || !postId || !body) {
      return new Response(JSON.stringify({ error: "Champs manquants." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (body.length < 1) {
      return new Response(JSON.stringify({ error: "Le message est vide." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (containsForbiddenLink(body)) {
      return new Response(JSON.stringify({ error: "Les liens sont interdits (sauf ceux de ontipo.github.io)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: ipProfile } = await supabaseAdmin.from("ip_profiles").select("ip").eq("id", ipProfileId).single();
    if (!ipProfile || ipProfile.ip !== realIp) {
      return new Response(JSON.stringify({ error: "Session IP invalide — reconnecte-toi avec ton IP." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: banned } = await supabaseAdmin.from("ip_bans").select("ip").eq("ip", realIp).maybeSingle();
    if (banned) {
      return new Response(JSON.stringify({ error: "Cette adresse IP est bannie du forum." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { error: insertError } = await supabaseAdmin.from("comments").insert({
      post_id: postId,
      ip_author_id: ipProfileId,
      body,
      is_anonymous: false,
      parent_comment_id: parentCommentId || null
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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
