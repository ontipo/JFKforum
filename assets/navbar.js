import { supabase } from "./supabaseClient.js";

export async function renderNavbar() {
  const root = document.getElementById("navbar-root");
  if (!root) return;

  root.innerHTML = `
    <div class="navbar-inner">
      <a href="/" class="navbar-logo">Tous</a>
      <form class="navbar-search" id="navbar-search-form">
        <input id="navbar-search-input" placeholder="Rechercher un #hashtag, un titre…" />
      </form>
      <div id="navbar-account"></div>
    </div>
  `;

  document.getElementById("navbar-search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("navbar-search-input").value.trim();
    if (q) window.location.href = `/?recherche=${encodeURIComponent(q)}`;
  });

  await refreshAccountArea();
  supabase.auth.onAuthStateChange(() => refreshAccountArea());
}

async function refreshAccountArea() {
  const area = document.getElementById("navbar-account");
  if (!area) return;

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    area.innerHTML = `<a href="/login.html" class="btn-outline">Se connecter</a>`;
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, pfp_url")
    .eq("id", session.user.id)
    .single();

  if (!profile) {
    area.innerHTML = `<a href="/login.html" class="btn-outline">Se connecter</a>`;
    return;
  }

  area.innerHTML = `
    <a href="/account.html" class="navbar-account">
      <span class="avatar">${
        profile.pfp_url
          ? `<img src="${profile.pfp_url}" alt="" />`
          : (profile.username[1] || "?").toUpperCase()
      }</span>
      <span class="hidden-mobile">${profile.username}</span>
    </a>
  `;
}
