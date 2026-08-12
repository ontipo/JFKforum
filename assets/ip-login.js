import { renderNavbar } from "./navbar.js";
import { isBogonIp, maskIp } from "./utils.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, PROXYCHECK_API_KEY } from "./config.js";

renderNavbar();

const scanStatus = document.getElementById("scan-status");
const scanResult = document.getElementById("scan-result");
const consentBox = document.getElementById("consent-box");
const confirmBtn = document.getElementById("confirm-ip-btn");
const confirmError = document.getElementById("confirm-error");

let detectedIp = null;
let isClean = false;

// Catégories vérifiées. NB : proxycheck.io (palier gratuit, sans clé requise) n'a pas
// de champ distinct pour "datacenter" vs "hosting" vs "cloud", ni de champ "mobile" —
// ces catégories sont approximées par des mots-clés dans le nom du fournisseur/l'ASN.
// C'est une limite du service gratuit, pas un choix de conception.
const CHECK_ROWS = [
  { key: "vpn", label: "VPN" },
  { key: "proxy", label: "Proxy" },
  { key: "tor", label: "Tor" },
  { key: "datacenter", label: "Datacenter" },
  { key: "hosting", label: "Hosting" },
  { key: "cloud", label: "Cloud" },
  { key: "residential", label: "Residential" },
  { key: "mobile", label: "Mobile" },
  { key: "reputation", label: "Réputation" },
  { key: "bot", label: "Bot / crawler" },
  { key: "bogon", label: "Bogon / réservée" }
];

async function run() {
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json");
    const ipJson = await ipRes.json();
    detectedIp = ipJson.ip;
  } catch {
    scanStatus.textContent = "Impossible de détecter ton adresse IP. Réessaie plus tard.";
    return;
  }

  if (isBogonIp(detectedIp)) {
    renderResults(detectedIp, {
      vpn: false, proxy: false, tor: false, datacenter: false, hosting: false, cloud: false,
      residential: false, mobile: false, reputation: false, bot: false, bogon: true
    }, false);
    return;
  }

  try {
    const banRes = await fetch("assets/ip-ban.txt");
    const banText = await banRes.text();
    const bannedIps = banText.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    if (bannedIps.includes(detectedIp)) {
      scanStatus.textContent = `Analyse de connexion — ${maskIp(detectedIp)}`;
      scanResult.classList.remove("hidden");
      scanResult.innerHTML = `<p class="error-text">Cette adresse IP est bannie du forum.</p>`;
      return;
    }
  } catch {
    // Liste indisponible : on continue, la table Supabase ip_bans reste vérifiée côté serveur.
  }

  try {
    // proxycheck.io : palier gratuit accessible sans clé API (limité en volume).
    // Une clé optionnelle (PROXYCHECK_API_KEY dans config.js) augmente la limite si besoin.
    const keyParam = PROXYCHECK_API_KEY ? `&key=${PROXYCHECK_API_KEY}` : "";
    const res = await fetch(
      `https://proxycheck.io/v2/${detectedIp}?vpn=1&asn=1&risk=1${keyParam}`
    );
    const json = await res.json();
    const data = json[detectedIp] || {};

    if (json.status !== "ok" && json.status !== "warning") {
      scanStatus.textContent = "Le service de vérification est indisponible pour le moment. Réessaie plus tard.";
      return;
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
      bot: type === "SES", // moteur de recherche / robot connu de proxycheck.io
      bogon: false
    };

    renderResults(detectedIp, flags, true);
  } catch {
    scanStatus.textContent = "Le service de vérification est indisponible pour le moment. Réessaie plus tard.";
  }
}

function renderResults(ip, flags, apiUsed) {
  scanStatus.textContent = `Analyse de connexion — ${maskIp(ip)}`;
  scanResult.classList.remove("hidden");

  const badRows = ["vpn", "proxy", "tor", "datacenter", "hosting", "cloud", "mobile", "reputation", "bot", "bogon"];
  const goodRows = ["residential"];

  scanResult.innerHTML = `
    <div class="stack" style="margin-top:12px">
      ${CHECK_ROWS.map((row) => {
        const value = flags[row.key];
        const isBad = badRows.includes(row.key) ? value : goodRows.includes(row.key) ? !value : value;
        const icon = row.key === "residential" ? (value ? "✅" : "❌") : value ? "❌" : "✅";
        const answer =
          row.key === "residential" || row.key === "mobile"
            ? value
              ? "Oui"
              : "Non"
            : row.key === "reputation"
            ? value
              ? "Mauvaise"
              : "Normale"
            : value
            ? "Oui"
            : "Non";
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)">
            <span style="font-size:14px">${row.label}</span>
            <span style="font-family:'JetBrains Mono',monospace;font-size:13px">${icon} ${answer}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;

  const forbidden = ["vpn", "proxy", "tor", "datacenter", "hosting", "cloud", "mobile", "reputation", "bot", "bogon"];
  isClean = apiUsed && !forbidden.some((k) => flags[k]);

  if (isClean) {
    consentBox.classList.remove("hidden");
  } else {
    const p = document.createElement("p");
    p.className = "error-text";
    p.style.marginTop = "12px";
    p.textContent = "Cette connexion est refusée pour le porte-parole IP (VPN, proxy, datacenter ou autre signal détecté).";
    scanResult.appendChild(p);
  }
}

document.querySelectorAll(".consent-item").forEach((cb) => {
  cb.addEventListener("change", () => {
    const allChecked = Array.from(document.querySelectorAll(".consent-item")).every((c) => c.checked);
    confirmBtn.disabled = !(allChecked && isClean);
  });
});

confirmBtn.addEventListener("click", async () => {
  confirmError.classList.add("hidden");
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Vérification…";

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ip-register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ claimedIp: detectedIp })
    });
    const json = await res.json();

    if (!res.ok) {
      confirmError.textContent = json.error || "Une erreur est survenue.";
      confirmError.classList.remove("hidden");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "J'accepte le traitement d'IP comme porte-parole de tous mes dires";
      return;
    }

    localStorage.setItem("ip_identity", JSON.stringify({ id: json.ipProfileId, ip: json.ip }));
    window.location.href = "index.html";
  } catch {
    confirmError.textContent = "Impossible de contacter le serveur. Réessaie plus tard.";
    confirmError.classList.remove("hidden");
    confirmBtn.disabled = false;
    confirmBtn.textContent = "J'accepte le traitement d'IP comme porte-parole de tous mes dires";
  }
});

run();
