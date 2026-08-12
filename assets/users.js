import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { escapeHtml, avatarImgHtml } from "./utils.js";
import { userBadgeHtml } from "./userBadge.js";

renderNavbar();

const params = new URLSearchParams(window.location.search);
const q = (params.get("q") || "").trim();

document.getElementById("query-label").textContent = q
  ? `Résultats pour « !${q} »`
  : "Tape un nom d'utilisateur dans la recherche (avec ! devant).";

async function run() {
  if (!q) return;

  const { data: users } = await supabase
    .from("profiles")
    .select("username, role, pfp_url, likes_received, posts_count")
    .ilike("username", `!%${q}%`)
    .limit(30);

  // Les porte-parole IP se cherchent aussi (leur pseudo est "!p" + leur IP)
  const { data: ipUsers } = await supabase
    .from("ip_profiles")
    .select("ip")
    .ilike("ip", `%${q.replace(/^p/i, "")}%`)
    .limit(10);

  const list = document.getElementById("results-list");
  const emptyMsg = document.getElementById("empty-msg");

  const rows = [
    ...(users || []).map((u) => renderUserRow(u)),
    ...(ipUsers || []).map((u) => renderIpRow(u))
  ];

  if (rows.length === 0) {
    emptyMsg.classList.remove("hidden");
    return;
  }

  list.innerHTML = rows.join("");
}

function renderUserRow(u) {
  return `
    <a href="profile.html?user=${encodeURIComponent(u.username)}" class="post-card" style="display:flex;align-items:center;gap:12px;padding:14px">
      <span class="post-avatar" style="width:44px;height:44px">${avatarImgHtml(u.username, u.pfp_url, 44)}</span>
      <span>${userBadgeHtml({ username: u.username, role: u.role, likesReceived: u.likes_received, postsCount: u.posts_count })}</span>
    </a>
  `;
}

function renderIpRow(u) {
  const username = `!p${u.ip}`;
  return `
    <a href="profile.html?user=${encodeURIComponent(username)}" class="post-card" style="display:flex;align-items:center;gap:12px;padding:14px">
      <span class="post-avatar" style="width:44px;height:44px">📶</span>
      <span class="user-badge"><span class="name">${escapeHtml(username)}</span></span>
    </a>
  `;
}

run();
