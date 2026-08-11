import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { formatKc } from "./utils.js";

renderNavbar();

async function init() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  await refreshBalance(session.user.id);
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
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const { data, error } = await supabase.rpc("claim_daily_bonus");
  if (error) {
    msg.textContent = "Erreur : " + error.message;
  } else if (data === null) {
    msg.textContent = "Déjà réclamé — reviens dans un moment (minimum 12h entre deux bonus).";
  } else {
    msg.textContent = `Bonus reçu ! Nouveau solde : ${formatKc(data)}`;
    refreshBalance(session.user.id);
  }
  msg.classList.remove("hidden");
});

init();
