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

async function load() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "/login.html";
    return;
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();

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

  box.classList.remove("hidden");
}

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
});

load();
