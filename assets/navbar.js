import { supabase } from "./supabaseClient.js";

export async function renderNavbar() {
  const root = document.getElementById("navbar-root");
  if (!root) return;

  const {
    data: { session }
  } = await supabase.auth.getSession();

  root.innerHTML = `
    <div class="navbar-inner">
      <a href="https://ontipo.github.io/JFKforum/index.html" class="navbar-logo">
        <img src="https://ontipo.github.io/JFKforum/assets/site.svg" alt="Forum" style="height:32px;width:auto;display:block" />
      </a>
      <form class="navbar-search" id="navbar-search-form">
        <input id="navbar-search-input" placeholder="${
          session ? "Rechercher… (!pseudo pour un utilisateur)" : "Connecte-toi pour rechercher"
        }" ${session ? "" : "disabled"} />
      </form>
      <div id="navbar-kc"></div>
      <div id="navbar-notif"></div>
      <div id="navbar-admin-link"></div>
      <div id="navbar-account"></div>
    </div>
  `;

  document.getElementById("navbar-search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!session) return;
    const q = document.getElementById("navbar-search-input").value.trim();
    if (!q) return;
    if (q.startsWith("!")) {
      window.location.href = `users.html?q=${encodeURIComponent(q.slice(1))}`;
    } else {
      window.location.href = `index.html?recherche=${encodeURIComponent(q)}`;
    }
  });

  await refreshAccountArea();
  await refreshNotifBell();
  supabase.auth.onAuthStateChange(() => {
    refreshAccountArea();
    refreshNotifBell();
  });

  renderFooter();
}

function renderFooter() {
  if (document.getElementById("site-footer")) return;
  const footer = document.createElement("footer");
  footer.id = "site-footer";
  footer.style.cssText = "text-align:center;padding:24px 16px 40px;color:var(--silver-700);font-size:12px";
  footer.textContent = "No-log policy - JFKforum.";
  document.body.appendChild(footer);
}

async function refreshAccountArea() {
  const area = document.getElementById("navbar-account");
  const adminArea = document.getElementById("navbar-admin-link");
  if (!area) return;

  const { avatarImgHtml, formatKc } = await import("./utils.js");

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    area.innerHTML = `<a href="login.html" class="btn-outline">Se connecter</a>`;
    if (adminArea) adminArea.innerHTML = "";
    document.getElementById("navbar-kc").innerHTML = "";
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, pfp_url, role, kc_balance")
    .eq("id", session.user.id)
    .single();

  if (!profile) {
    area.innerHTML = `<a href="login.html" class="btn-outline">Se connecter</a>`;
    if (adminArea) adminArea.innerHTML = "";
    return;
  }

  area.innerHTML = `
    <a href="account.html" class="navbar-account">
      <span class="avatar">${avatarImgHtml(profile.username, profile.pfp_url, 32)}</span>
      <span class="hidden-mobile">${profile.username}</span>
    </a>
  `;

  // Heartbeat : met à jour la dernière connexion (visible côté console si ça échoue)
  supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.user.id)
    .then(({ error }) => {
      if (error) console.error("Heartbeat last_seen_at a échoué :", error.message);
    });

  if (adminArea) {
    adminArea.innerHTML = ["moderator", "owner"].includes(profile.role)
      ? `<a href="admin.html" class="btn-outline" title="Administration">⚙</a>`
      : "";
  }

  const kcArea = document.getElementById("navbar-kc");
  if (kcArea) {
    const isStaff = ["moderator", "owner"].includes(profile.role);
    kcArea.innerHTML = `<a href="kc.html" class="btn-outline">${isStaff ? "∞ K$" : formatKc(profile.kc_balance || 0)}</a>`;
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
    .select("id, type, message, read, created_at, source_post_id, profiles:actor_id (username)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const { timeAgo, escapeHtml } = await import("./utils.js");

  if (!data || data.length === 0) {
    dropdown.innerHTML = `<p class="muted" style="font-size:13px;padding:8px">Aucune notification.</p>`;
    return;
  }

  dropdown.innerHTML = data
    .map((n) => {
      const actorName = n.profiles?.username || "Quelqu'un";
      const label =
        n.type === "custom" ? n.message || "Notification" : (NOTIF_LABEL[n.type] || (() => "Notification"))(actorName);
      const href = n.type === "custom" ? "#" : n.source_post_id ? `index.html?=${n.source_post_id}` : "#";
      return `
        <div style="display:flex;align-items:flex-start;gap:4px;padding:8px;border-radius:8px;font-size:13px;${
          n.read ? "opacity:0.6" : "background:var(--raised)"
        }">
          <a href="${href}" data-notif="${n.id}" style="flex:1;min-width:0">
            ${escapeHtml(label)}
            <div class="hint-text">${timeAgo(n.created_at)}</div>
          </a>
          <button data-delete-notif="${n.id}" title="Supprimer" style="background:none;border:none;color:var(--silver-700);font-size:14px;flex-shrink:0;cursor:pointer">×</button>
        </div>
      `;
    })
    .join("");

  dropdown.querySelectorAll("[data-notif]").forEach((el) => {
    el.addEventListener("click", async () => {
      await supabase.from("notifications").update({ read: true }).eq("id", el.dataset.notif);
    });
  });

  dropdown.querySelectorAll("[data-delete-notif]").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await supabase.from("notifications").delete().eq("id", el.dataset.deleteNotif);
      loadNotifDropdown(dropdown, userId);
    });
  });
}
