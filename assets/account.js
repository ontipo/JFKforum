import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { getLevel, escapeHtml } from "./utils.js";
import { userBadgeHtml } from "./userBadge.js";

renderNavbar();

const loadingMsg = document.getElementById("loading-msg");
const box = document.getElementById("account-box");
const avatarSlot = document.getElementById("avatar-slot");
const badgeSlot = document.getElementById("badge-slot");
const pointsSlot = document.getElementById("points-slot");
const logoutBtn = document.getElementById("logout-btn");

const STATUS_LABEL = {
  none: "Aucune image envoyée",
  pending: "En attente de validation par un modérateur",
  approved: "Approuvée ✓",
  rejected: "Refusée par un modérateur"
};

let userId = null;

async function load() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "/login.html";
    return;
  }
  userId = session.user.id;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();

  loadingMsg.classList.add("hidden");

  if (!profile) return;

  const level = getLevel(profile.likes_received);

  avatarSlot.innerHTML = profile.pfp_url
    ? `<img src="${profile.pfp_url}" alt="" />`
    : `<span style="font-size:20px;color:var(--silver-500)">${escapeHtml((profile.username[1] || "?").toUpperCase())}</span>`;

  badgeSlot.innerHTML = userBadgeHtml({
    username: profile.username,
    role: profile.role,
    likesReceived: profile.likes_received
  });

  pointsSlot.textContent = `${profile.likes_received} points · ${level.label}`;

  document.getElementById("pfp-status").textContent = STATUS_LABEL[profile.pfp_status] || STATUS_LABEL.none;
  document.getElementById("banner-status").textContent = STATUS_LABEL[profile.banner_status] || STATUS_LABEL.none;

  box.classList.remove("hidden");
}

async function submitImage(field, inputId) {
  const input = document.getElementById(inputId);
  const url = input.value.trim();
  if (!url) return;

  const patch =
    field === "pfp"
      ? { pfp_pending_url: url, pfp_status: "pending" }
      : { banner_pending_url: url, banner_status: "pending" };

  await supabase.from("profiles").update(patch).eq("id", userId);
  input.value = "";
  load();
}

document.getElementById("pfp-submit-btn").addEventListener("click", () => submitImage("pfp", "pfp-url-input"));
document.getElementById("banner-submit-btn").addEventListener("click", () => submitImage("banner", "banner-url-input"));

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
});

load();
