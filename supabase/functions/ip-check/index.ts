// Analyse l'IP réelle de l'appelant (VPN / proxy / datacenter / etc.) via proxycheck.io.
// Appelée côté serveur pour éviter le blocage CORS du navigateur, et pour utiliser
// l'IP réellement observée par l'infrastructure plutôt qu'une IP annoncée par le client.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function getRealIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : null;
}

function isBogonIp(ip) {
  const parts = (ip || "").split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  if (a >= 224) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const realIp = getRealIp(req);
    if (!realIp) {
      return new Response(JSON.stringify({ error: "Impossible de déterminer ton IP." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (isBogonIp(realIp)) {
      return new Response(
        JSON.stringify({
          ip: realIp,
          flags: {
            vpn: false, proxy: false, tor: false, datacenter: false, hosting: false, cloud: false,
            residential: false, mobile: false, reputation: false, bot: false, bogon: true
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(`https://proxycheck.io/v2/${realIp}?vpn=1&asn=1&risk=1`);
    const json = await res.json();
    const data = json[realIp] || {};

    if (json.status !== "ok" && json.status !== "warning") {
      return new Response(JSON.stringify({ error: "Service de vérification indisponible." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const providerText = `${data.provider || ""} ${data.organisation || ""}`.toLowerCase();
    const cloudKeywords = ["amazon", "aws", "google", "microsoft", "azure", "digitalocean", "ovh", "hetzner", "linode", "vultr", "cloud", "hosting", "datacenter", "data center", "server"];
    const mobileKeywords = ["mobile", "wireless", "cellular", "lte", "4g", "5g"];

    const isProxy = data.proxy === "yes";
    const type = (data.type || "").toUpperCase();
    const looksLikeCloud = cloudKeywords.some((k) => providerText.includes(k));
    const looksLikeMobile = mobileKeywords.some((k) => providerText.includes(k));

    const flags = {
      vpn: isProxy && type === "VPN",
      proxy: isProxy && type !== "VPN" && type !== "TOR",
      tor: isProxy && type === "TOR",
      datacenter: looksLikeCloud,
      hosting: looksLikeCloud,
      cloud: looksLikeCloud,
      residential: !isProxy && !looksLikeCloud,
      mobile: looksLikeMobile,
      reputation: (parseInt(data.risk, 10) || 0) >= 75,
      bot: type === "SES",
      bogon: false
    };

    return new Response(JSON.stringify({ ip: realIp, flags }), {
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
