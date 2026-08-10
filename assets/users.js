import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { escapeHtml } from "./utils.js";
import { userBadgeHtml } from "./userBadge.js";

renderNavbar();

const params = new URLSearchParams(window.location.search);
const q = (params.get("q") || "").trim();

document.getElementById("query-label").textContent = q
  ? `Résultats pour « !${q} »`
  : "Tape un nom d'utilisateur dans la recherche (avec ! devant).";

async function run() {
  if (!q) return;

  const { data } = await supabase
    .from("profiles")
    .select("username, role, pfp_url, likes_received, posts_count")
    .ilike("username", `!%${q}%`)
    .limit(30);

  const list = document.getElementById("results-list");
  const emptyMsg = document.getElementById("empty-msg");

  if (!data || data.length === 0) {
    emptyMsg.classList.remove("hidden");
    return;
  }

  list.innerHTML = data
    .map(
      (u) => `
    <a href="profile.html?user=${encodeURIComponent(u.username)}" class="post-card" style="display:flex;align-items:center;gap:12px;padding:14px">
      <span class="post-avatar" style="width:44px;height:44px">${
        u.pfp_url ? `<img src="${u.pfp_url}" alt="" width="44" height="44" />` : escapeHtml((u.username[1] || "?").toUpperCase())
      }</span>
      <span>${userBadgeHtml({ username: u.username, role: u.role, likesReceived: u.likes_received, postsCount: u.posts_count })}</span>
    </a>
  `
    )
    .join("");
}

run();
