import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { formatKc, escapeHtml, timeAgo } from "./utils.js";

renderNavbar();

let userId = null;
let isStaff = false;

async function init() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }
  userId = session.user.id;

  // Nettoie les virements expirés avant d'afficher quoi que ce soit
  await supabase.rpc("expire_kc_transfers");

  await refreshBalance();
  await loadIncoming();
  await loadHistory();
}

async function refreshBalance() {
  const { data: profile } = await supabase.from("profiles").select("kc_balance, role").eq("id", userId).single();
  isStaff = ["moderator", "owner"].includes(profile?.role);
  document.getElementById("balance-slot").textContent = isStaff ? "∞ K$ (staff)" : formatKc(profile?.kc_balance || 0);
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
    refreshBalance();
  }
  msg.classList.remove("hidden");
});

// ---- Envoi ----
const sendForm = document.getElementById("send-form");
const amountInput = document.getElementById("send-amount");
const previewEl = document.getElementById("send-preview");

function updatePreview() {
  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) {
    previewEl.textContent = "";
    return;
  }
  const mode = document.querySelector('input[name="fee-mode"]:checked').value;
  if (mode === "receiver_pays_fee") {
    const received = Math.round(amount * 0.975 * 100) / 100;
    previewEl.textContent = `Tu paies ${formatKc(amount)} — le destinataire reçoit ${formatKc(received)}.`;
  } else {
    const charged = Math.round(amount * 1.025 * 100) / 100;
    previewEl.textContent = `Tu paies ${formatKc(charged)} — le destinataire reçoit ${formatKc(amount)}.`;
  }
}
amountInput.addEventListener("input", updatePreview);
document.querySelectorAll('input[name="fee-mode"]').forEach((r) => r.addEventListener("change", updatePreview));

sendForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("send-error");
  errorEl.classList.add("hidden");

  const username = document.getElementById("send-username").value.trim();
  const amount = parseFloat(amountInput.value);
  const feeMode = document.querySelector('input[name="fee-mode"]:checked').value;
  const reason = document.getElementById("send-reason").value.trim();
  const nip = document.getElementById("send-nip").value.trim();

  if (!username || !amount || amount <= 0 || !nip) {
    errorEl.textContent = "Destinataire, montant et NIP sont obligatoires.";
    errorEl.classList.remove("hidden");
    return;
  }

  const { error } = await supabase.rpc("create_kc_transfer", {
    receiver_username: username,
    p_amount: amount,
    p_fee_mode: feeMode,
    p_reason: reason || null,
    p_nip: nip
  });

  if (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
    return;
  }

  sendForm.reset();
  previewEl.textContent = "";
  refreshBalance();
  loadHistory();
  alert("Virement envoyé. Communique le NIP au destinataire par un autre moyen (le NIP n'est jamais visible ici).");
});

// ---- Virements reçus en attente ----
async function loadIncoming() {
  const { data } = await supabase
    .from("kc_transfers")
    .select("id, amount, reason, created_at, expires_at, profiles:sender_id (username)")
    .eq("receiver_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const list = document.getElementById("incoming-list");
  const emptyMsg = document.getElementById("incoming-empty");

  if (!data || data.length === 0) {
    list.innerHTML = "";
    emptyMsg.classList.remove("hidden");
    return;
  }
  emptyMsg.classList.add("hidden");

  list.innerHTML = data
    .map(
      (t) => `
    <div class="post-card" style="padding:12px" data-transfer="${t.id}">
      <p style="margin:0"><strong>${escapeHtml(t.profiles?.username || "?")}</strong> t'envoie ${formatKc(t.amount)}</p>
      ${t.reason ? `<p class="hint-text" style="margin:2px 0 0">${escapeHtml(t.reason)}</p>` : ""}
      <p class="hint-text" style="margin:2px 0 8px">${timeAgo(t.created_at)} · expire le ${new Date(t.expires_at).toLocaleDateString("fr-CA")}</p>
      <div style="display:flex;gap:8px">
        <input class="input nip-input" placeholder="NIP" style="flex:1" />
        <button class="btn-outline accept-transfer-btn" style="flex-shrink:0">Accepter</button>
      </div>
      <p class="error-text hidden" data-err style="margin-top:6px"></p>
    </div>
  `
    )
    .join("");

  list.querySelectorAll("[data-transfer]").forEach((card) => {
    const id = card.dataset.transfer;
    card.querySelector(".accept-transfer-btn").addEventListener("click", async () => {
      const nip = card.querySelector(".nip-input").value.trim();
      const errEl = card.querySelector("[data-err]");
      errEl.classList.add("hidden");

      const { error } = await supabase.rpc("accept_kc_transfer", { transfer_id: id, p_nip: nip });
      if (error) {
        errEl.textContent = error.message;
        errEl.classList.remove("hidden");
        return;
      }
      refreshBalance();
      loadIncoming();
      loadHistory();
    });
  });
}

// ---- Historique ----
async function loadHistory() {
  const { data } = await supabase
    .from("kc_transfers")
    .select("id, amount, charged, reason, status, created_at, sender_id, receiver_id, sender:sender_id (username), receiver:receiver_id (username)")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  const list = document.getElementById("history-list");
  const emptyMsg = document.getElementById("history-empty");

  if (!data || data.length === 0) {
    list.innerHTML = "";
    emptyMsg.classList.remove("hidden");
    return;
  }
  emptyMsg.classList.add("hidden");

  const STATUS_LABEL = { pending: "En attente", accepted: "Accepté", expired: "Expiré (remboursé)", cancelled: "Annulé" };

  list.innerHTML = data
    .map((t) => {
      const isSender = t.sender_id === userId;
      const other = isSender ? t.receiver?.username : t.sender?.username;
      return `
    <div class="post-card" style="padding:12px">
      <p style="margin:0;font-size:13px">
        ${isSender ? `Envoyé à <strong>${escapeHtml(other || "?")}</strong>` : `Reçu de <strong>${escapeHtml(other || "?")}</strong>`}
        — ${formatKc(isSender ? t.charged : t.amount)}
      </p>
      ${t.reason ? `<p class="hint-text" style="margin:2px 0 0">${escapeHtml(t.reason)}</p>` : ""}
      <p class="hint-text" style="margin:2px 0 0">${timeAgo(t.created_at)} · ${STATUS_LABEL[t.status] || t.status}</p>
    </div>
  `;
    })
    .join("");
}

init();
