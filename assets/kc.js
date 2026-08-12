import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { formatKc, generateSponsorCode, escapeHtml } from "./utils.js";

renderNavbar();

let currentUserId = null;

async function init() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }
  currentUserId = session.user.id;

  await refreshBalance(currentUserId);
  await loadSponsorSection();
}

async function refreshBalance(userId) {
  const { data: profile, error } = await supabase.from("profiles").select("kc_balance, role").eq("id", userId).single();

  if (error || !profile) {
    document.getElementById("balance-slot").textContent = "Erreur de chargement";
    return;
  }

  const isStaff = ["moderator", "owner"].includes(profile.role);
  document.getElementById("balance-slot").textContent = isStaff ? "∞ K$ (staff)" : formatKc(profile.kc_balance || 0);
}

document.getElementById("daily-bonus-btn").addEventListener("click", async () => {
  const msg = document.getElementById("bonus-msg");

  const { data, error } = await supabase.rpc("claim_daily_bonus");
  if (error) {
    msg.textContent = "Erreur : " + error.message;
  } else if (data === null) {
    msg.textContent = "Déjà réclamé — reviens dans un moment (minimum 12h entre deux bonus).";
  } else {
    msg.textContent = `Bonus reçu ! Nouveau solde : ${formatKc(data)}`;
    refreshBalance(currentUserId);
  }
  msg.classList.remove("hidden");
});

// ------------------------------------------------------------
// Parrainage
// ------------------------------------------------------------
async function loadSponsorSection() {
  const { data: profile } = await supabase.from("profiles").select("sponsor_code").eq("id", currentUserId).single();
  const slot = document.getElementById("sponsor-slot");

  if (!profile?.sponsor_code) {
    slot.innerHTML = `<button id="create-sponsor-btn" class="btn-outline">Créer un lien de parrainage</button>`;
    document.getElementById("create-sponsor-btn").addEventListener("click", createSponsorCode);
    return;
  }

  renderSponsorLink(profile.sponsor_code);
}

async function createSponsorCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateSponsorCode();
    const { error } = await supabase.from("profiles").update({ sponsor_code: code }).eq("id", currentUserId);
    if (!error) {
      renderSponsorLink(code);
      return;
    }
    // Collision improbable sur le code unique -> on retente avec un autre code
  }
  document.getElementById("sponsor-slot").innerHTML = `<p class="error-text">Impossible de créer le lien, réessaie.</p>`;
}

function renderSponsorLink(code) {
  const link = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, "")}register.html?sponsor=${code}`;
  const shareText = `😱😱😱\n\n🥰 Rejoins moi aujourd'hui sur JFKforum en appuyant sur le lien si dessous! 😂\n\n🤑 Tu m'aideras à gagner de l'argent et tu en gagneras aussi après l'inscription (beaucoup..). 💰\n\n👇🏻👇🏼👇🏽\n\n${link}\n\n👆🏽👆🏼👆🏻\n\n🤯 Rejoins moi aujourd'hui sur cette plateforme amusante :) 😜\n\n👇🏻👇🏼👇🏽`;

  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
  const messengerUrl = `fb-messenger://share/?link=${encodeURIComponent(link)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  document.getElementById("sponsor-slot").innerHTML = `
    <p class="hint-text" style="margin-bottom:6px">Ton lien permanent :</p>
    <p class="hint-text" style="word-break:break-all;color:var(--silver-300)">${escapeHtml(link)}</p>
    <p class="hint-text" style="margin-top:8px">+14 K$ pour toi et +7 K$ pour la personne parrainée, une fois son e-mail vérifié.</p>
    <div class="share-row">
      <a href="${fbUrl}" target="_blank" class="share-btn-icon" title="Publier sur Facebook">
        <svg viewBox="0 0 24 24" fill="var(--silver-300)"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/></svg>
      </a>
      <a href="${messengerUrl}" class="share-btn-icon" title="Envoyer sur Messenger">
        <svg viewBox="0 0 24 24" fill="var(--silver-300)"><path d="M12 2C6.48 2 2 6.15 2 11.27c0 2.91 1.44 5.51 3.7 7.21V22l3.38-1.86c.9.25 1.86.38 2.92.38 5.52 0 10-4.15 10-9.27C22 6.15 17.52 2 12 2zm1.02 12.49-2.55-2.72-4.98 2.72 5.48-5.82 2.61 2.72 4.92-2.72-5.48 5.82z"/></svg>
      </a>
      <a href="${whatsappUrl}" target="_blank" class="share-btn-icon" title="Envoyer sur WhatsApp">
        <svg viewBox="0 0 24 24" fill="var(--silver-300)"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.36 5.07L2 22l5.06-1.33A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm5.2 14.2c-.22.62-1.28 1.18-1.77 1.24-.45.06-1.02.08-1.65-.1-.38-.11-.87-.28-1.5-.55-2.64-1.14-4.36-3.8-4.5-3.98-.13-.18-1.08-1.44-1.08-2.75 0-1.3.68-1.94.92-2.2.24-.27.53-.33.7-.33h.5c.16 0 .38-.06.6.45.22.53.75 1.83.82 1.96.07.13.11.29.02.47-.09.18-.14.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.27-.11.53.15.27.68 1.12 1.46 1.81 1 .89 1.85 1.17 2.11 1.3.27.13.42.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.24.09 1.55.73 1.82.87.27.13.45.2.51.31.07.13.07.7-.16 1.32z"/></svg>
      </a>
    </div>
  `;
}

init();
