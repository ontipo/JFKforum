import { renderNavbar } from "navbar.js";
import { maskIp } from "utils.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "config.js";

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
  scanStatus.textContent = "Analyse de connexion en cours…";

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ip-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const json = await res.json();

    if (!res.ok || !json.ip) {
      scanStatus.textContent = json.error || "Le service de vérification est indisponible pour le moment. Réessaie plus tard.";
      return;
    }

    detectedIp = json.ip;

    // Vérification supplémentaire contre la liste statique (en plus de la table
    // Supabase ip_bans, déjà revérifiée côté serveur au moment de l'inscription).
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
      // Liste indisponible : on continue, la table Supabase reste vérifiée côté serveur.
    }

    renderResults(detectedIp, json.flags, true);
  } catch {
    scanStatus.textContent = "Impossible de contacter le serveur de vérification. Réessaie plus tard.";
  }
}

function renderResults(ip, flags, apiUsed) {
  scanStatus.textContent = `Analyse de connexion — ${maskIp(ip)}`;
  scanResult.classList.remove("hidden");

  scanResult.innerHTML = `
    <div class="stack" style="margin-top:12px">
      ${CHECK_ROWS.map((row) => {
        const value = flags[row.key];
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
