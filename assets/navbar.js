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
      <div id="navbar-notif"></div>
      <div id="navbar-admin-link"></div>
      <div id="navbar-account"></div>
    </div>
  `;

  document.getElementById("navbar-search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("navbar-search-input").value.trim();
    if (q) window.location.href = `/?recherche=${encodeURIComponent(q)}`;
  });

  await refreshAccountArea();
  await refreshNotifBell();
  supabase.auth.onAuthStateChange(() => {
    refreshAccountArea();
    refreshNotifBell();
  });
}

async function refreshAccountArea() {
  const area = document.getElementById("navbar-account");
  const adminArea = document.getElementById("navbar-admin-link");
  if (!area) return;

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    area.innerHTML = `<a href="/login.html" class="btn-outline">Se connecter</a>`;
    if (adminArea) adminArea.innerHTML = "";
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, pfp_url, role")
    .eq("id", session.user.id)
    .single();

  if (!profile) {
    area.innerHTML = `<a href="/login.html" class="btn-outline">Se connecter</a>`;
    if (adminArea) adminArea.innerHTML = "";
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

  if (adminArea) {
    adminArea.innerHTML = ["moderator", "owner"].includes(profile.role)
      ? `<a href="/admin.html" class="btn-outline" title="Administration">⚙</a>`
      : "";
  }
}

// ------------------------------------------------------------
// Cloche de notifications
// ------------------------------------------------------------
async function refreshNotifBell() {
  const area = document.getElementById("navbar-notif");
  if (!area) return;

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    area.innerHTML = "";
    return;
  }

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", session.user.id)
    .eq("read", false);

  area.innerHTML = `
    <button id="notif-bell-btn" class="btn-outline" style="position:relative">
      🔔${count > 0 ? `<span style="position:absolute;top:-4px;right:-4px;background:var(--silver-100);color:var(--void);font-size:9px;font-family:'JetBrains Mono',monospace;border-radius:999px;min-width:15px;height:15px;display:flex;align-items:center;justify-content:center;padding:0 3px">${count > 9 ? "9+" : count}</span>` : ""}
    </button>
    <div id="notif-dropdown" class="hidden" style="position:absolute;right:16px;top:60px;width:300px;max-height:400px;overflow-y:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow-silver-hover);z-index:40;padding:8px"></div>
  `;

  const btn = area.querySelector("#notif-bell-btn");
  const dropdown = area.querySelector("#notif-dropdown");

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains("hidden");
    if (isHidden) {
      await loadNotifDropdown(dropdown, session.user.id);
      dropdown.classList.remove("hidden");
    } else {
      dropdown.classList.add("hidden");
    }
  });

  document.addEventListener("click", (e) => {
    if (!area.contains(e.target)) dropdown.classList.add("hidden");
  });
}

const NOTIF_LABEL = {
  mention: (name) => `${name} vous a mentionné`,
  like: (name) => `${name} a aimé votre publication`,
  comment: (name) => `${name} a répondu à votre publication`
};

async function loadNotifDropdown(dropdown, userId) {
  const { data } = await supabase
    .from("notifications")
    .select("id, type, read, created_at, source_post_id, profiles:actor_id (username)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const { timeAgo } = await import("./utils.js");

  if (!data || data.length === 0) {
    dropdown.innerHTML = `<p class="muted" style="font-size:13px;padding:8px">Aucune notification.</p>`;
    return;
  }

  dropdown.innerHTML = data
    .map((n) => {
      const actorName = n.profiles?.username || "Quelqu'un";
      const label = (NOTIF_LABEL[n.type] || (() => "Notification"))(actorName);
      const href = n.source_post_id ? `/?=${n.source_post_id}` : "#";
      return `
        <a href="${href}" data-notif="${n.id}" style="display:block;padding:8px;border-radius:8px;font-size:13px;${
        n.read ? "opacity:0.6" : "background:var(--raised)"
      }">
          ${label}
          <div class="hint-text">${timeAgo(n.created_at)}</div>
        </a>
      `;
    })
    .join("");

  dropdown.querySelectorAll("[data-notif]").forEach((el) => {
    el.addEventListener("click", async () => {
      await supabase.from("notifications").update({ read: true }).eq("id", el.dataset.notif);
    });
  });
}
