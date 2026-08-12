import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { escapeHtml, timeAgo, AWARDABLE_BADGES } from "./utils.js";

renderNavbar();

let me = null;

async function init() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
  me = profile;

  if (!profile || !["moderator", "owner"].includes(profile.role)) {
    document.getElementById("denied-msg").classList.remove("hidden");
    return;
  }

  document.getElementById("admin-box").classList.remove("hidden");
  if (profile.role !== "owner") {
    document.getElementById("admins-section").classList.add("hidden");
    document.getElementById("badges-section").classList.add("hidden");
  } else {
    populateBadgeSelect();
  }

  await loadCategories();
  await loadPendingImages();
  await loadPendingPostImages();
  await loadAgeVerifications();
  await loadPosts();
}

// ------------------------------------------------------------
// Catégories
// ------------------------------------------------------------
async function loadCategories() {
  const { data } = await supabase.from("categories").select("*").order("name");
  const list = document.getElementById("category-list");
  list.innerHTML = (data || []).map((c) => `<span class="hashtag" style="font-size:13px">${escapeHtml(c.name)}</span>`).join("");
}

document.getElementById("category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("category-error");
  errorEl.classList.add("hidden");

  const nameInput = document.getElementById("category-name");
  const name = nameInput.value.trim();
  if (!name) return;

  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const { error } = await supabase.from("categories").insert({ name, slug });
  if (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
    return;
  }
  nameInput.value = "";
  loadCategories();
});

// ------------------------------------------------------------
// Promotion modérateur (owner uniquement)
// ------------------------------------------------------------
document.getElementById("promote-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("promote-error");
  const successEl = document.getElementById("promote-success");
  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  const input = document.getElementById("promote-username");
  const username = input.value.trim();
  if (!username.startsWith("!")) {
    errorEl.textContent = "Le nom d'utilisateur doit commencer par « ! ».";
    errorEl.classList.remove("hidden");
    return;
  }

  const { data: target, error: findError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("username", username)
    .single();

  if (findError || !target) {
    errorEl.textContent = "Utilisateur introuvable.";
    errorEl.classList.remove("hidden");
    return;
  }

  const { error: updateError } = await supabase.from("profiles").update({ role: "moderator" }).eq("id", target.id);

  if (updateError) {
    errorEl.textContent = updateError.message;
    errorEl.classList.remove("hidden");
    return;
  }

  successEl.textContent = `${username} est maintenant modérateur.`;
  successEl.classList.remove("hidden");
  input.value = "";
});

// ------------------------------------------------------------
// Validation des photos de profil / bannières
// ------------------------------------------------------------
async function loadPendingImages() {
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, username, pfp_pending_url, banner_pending_url, pfp_status, banner_status, pfp_hosting, banner_hosting, pfp_promo_code, banner_promo_code"
    )
    .or("pfp_status.eq.pending,banner_status.eq.pending");

  const list = document.getElementById("pending-images-list");
  const emptyMsg = document.getElementById("pending-images-empty");

  const rows = [];
  (data || []).forEach((p) => {
    if (p.pfp_status === "pending" && p.pfp_pending_url)
      rows.push({ ...p, field: "pfp", hosting: p.pfp_hosting, code: p.pfp_promo_code });
    if (p.banner_status === "pending" && p.banner_pending_url)
      rows.push({ ...p, field: "banner", hosting: p.banner_hosting, code: p.banner_promo_code });
  });

  if (rows.length === 0) {
    list.innerHTML = "";
    emptyMsg.classList.remove("hidden");
    return;
  }
  emptyMsg.classList.add("hidden");

  list.innerHTML = rows
    .map(
      (r) => `
    <div class="post-card" style="padding:14px" data-user="${r.id}" data-field="${r.field}">
      <p style="margin:0 0 8px"><strong>${escapeHtml(r.username)}</strong> — ${r.field === "pfp" ? "photo de profil" : "bannière"}
        ${r.hosting === "physical" ? `<span class="role-tag">Hébergement physique</span>` : ""}
      </p>
      <p class="hint-text" style="word-break:break-all;margin-bottom:10px">${escapeHtml(r.field === "pfp" ? r.pfp_pending_url : r.banner_pending_url)}</p>
      ${
        r.hosting === "physical"
          ? `<p class="hint-text" style="margin-bottom:10px">Code fourni : <strong>${escapeHtml(r.code || "—")}</strong> — à vérifier manuellement.</p>`
          : ""
      }
      <div style="display:flex;gap:8px">
        <button class="btn-outline approve-btn" style="flex:1">Approuver</button>
        <button class="btn-outline reject-btn" style="flex:1">Refuser</button>
      </div>
    </div>
  `
    )
    .join("");

  list.querySelectorAll(".approve-btn").forEach((btn) =>
    btn.addEventListener("click", (e) => resolveImage(e, true))
  );
  list.querySelectorAll(".reject-btn").forEach((btn) =>
    btn.addEventListener("click", (e) => resolveImage(e, false))
  );
}

async function resolveImage(e, approve) {
  const card = e.target.closest("[data-user]");
  const targetUserId = card.dataset.user;
  const field = card.dataset.field;
  const pendingUrl = card.querySelector(".hint-text").textContent;

  const patch =
    field === "pfp"
      ? approve
        ? { pfp_status: "approved", pfp_url: pendingUrl, pfp_approved_at: new Date().toISOString() }
        : { pfp_status: "rejected" }
      : approve
      ? { banner_status: "approved", banner_url: pendingUrl, banner_approved_at: new Date().toISOString() }
      : { banner_status: "rejected" };

  const { data, error } = await supabase.from("profiles").update(patch).eq("id", targetUserId).select();

  if (error) {
    alert("Échec de la mise à jour : " + error.message);
    return;
  }
  if (!data || data.length === 0) {
    alert(
      "La mise à jour n'a touché aucune ligne — c'est presque toujours un problème de policy RLS. " +
        "Vérifie que la policy « staff modifie tous les profils » de supabase/migrations_phase2.sql a bien été exécutée dans Supabase."
    );
    return;
  }

  loadPendingImages();
}

// ------------------------------------------------------------
// Images jointes à une publication (refuser / accepter / 18+)
// ------------------------------------------------------------
async function loadPendingPostImages() {
  const { data } = await supabase
    .from("posts")
    .select("id, title, image_pending_url, profiles:author_id (username)")
    .eq("image_status", "pending");

  const list = document.getElementById("pending-post-images-list");
  const emptyMsg = document.getElementById("pending-post-images-empty");

  if (!data || data.length === 0) {
    list.innerHTML = "";
    emptyMsg.classList.remove("hidden");
    return;
  }
  emptyMsg.classList.add("hidden");

  list.innerHTML = data
    .map(
      (p) => `
    <div class="post-card" style="padding:14px" data-post="${p.id}">
      <p style="margin:0 0 8px"><strong>${escapeHtml(p.profiles?.username || "?")}</strong> — ${escapeHtml(p.title)}</p>
      <p class="hint-text" style="word-break:break-all;margin-bottom:10px" data-url>${escapeHtml(p.image_pending_url)}</p>
      <div style="display:flex;gap:8px">
        <button class="btn-outline post-img-accept" style="flex:1">Accepter</button>
        <button class="btn-outline post-img-18" style="flex:1">18+</button>
        <button class="btn-outline post-img-reject" style="flex:1">Refuser</button>
      </div>
    </div>
  `
    )
    .join("");

  list.querySelectorAll("[data-post]").forEach((card) => {
    const postId = card.dataset.post;
    const url = card.querySelector("[data-url]").textContent;
    card.querySelector(".post-img-accept").addEventListener("click", () => resolvePostImage(postId, url, "approved"));
    card.querySelector(".post-img-18").addEventListener("click", () => resolvePostImage(postId, url, "18+"));
    card.querySelector(".post-img-reject").addEventListener("click", () => resolvePostImage(postId, url, "rejected"));
  });
}

async function resolvePostImage(postId, url, status) {
  const patch = status === "rejected" ? { image_status: "rejected" } : { image_status: status, image_url: url };
  const { error } = await supabase.from("posts").update(patch).eq("id", postId);
  if (error) {
    alert("Échec : " + error.message);
    return;
  }
  loadPendingPostImages();
}

// ------------------------------------------------------------
// Vérification d'âge (photo avec pièce d'identité gouvernementale)
// ------------------------------------------------------------
async function loadAgeVerifications() {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, age_verification_url")
    .eq("age_verification_status", "pending");

  const list = document.getElementById("age-verif-list");
  const emptyMsg = document.getElementById("age-verif-empty");

  if (!data || data.length === 0) {
    list.innerHTML = "";
    emptyMsg.classList.remove("hidden");
    return;
  }
  emptyMsg.classList.add("hidden");

  list.innerHTML = data
    .map(
      (u) => `
    <div class="post-card" style="padding:14px" data-user="${u.id}">
      <p style="margin:0 0 8px"><strong>${escapeHtml(u.username)}</strong></p>
      <p class="hint-text" style="word-break:break-all;margin-bottom:10px">${escapeHtml(u.age_verification_url)}</p>
      <div style="display:flex;gap:8px">
        <button class="btn-outline age-accept" style="flex:1">Approuver (18+)</button>
        <button class="btn-outline age-reject" style="flex:1">Refuser</button>
      </div>
    </div>
  `
    )
    .join("");

  list.querySelectorAll("[data-user]").forEach((card) => {
    const userId = card.dataset.user;
    card.querySelector(".age-accept").addEventListener("click", async () => {
      await supabase
        .from("profiles")
        .update({ age_verification_status: "approved", age_verified: true, age_verified_by: me.id })
        .eq("id", userId);
      loadAgeVerifications();
    });
    card.querySelector(".age-reject").addEventListener("click", async () => {
      await supabase
        .from("profiles")
        .update({ age_verification_status: "rejected", age_verified: false })
        .eq("id", userId);
      loadAgeVerifications();
    });
  });
}

// ------------------------------------------------------------
// Suppression de posts
// ------------------------------------------------------------
async function loadPosts() {
  const { data } = await supabase
    .from("posts")
    .select("id, title, created_at, is_anonymous, is_pinned, admin_boosted, profiles:author_id (username)")
    .order("created_at", { ascending: false })
    .limit(30);

  const list = document.getElementById("posts-admin-list");
  list.innerHTML = (data || [])
    .map(
      (p) => `
    <div class="post-card" style="padding:14px" data-post="${p.id}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="min-width:0">
          <p style="margin:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.title)}</p>
          <p class="hint-text" style="margin:2px 0 0">${escapeHtml(p.is_anonymous ? "Anonyme" : p.profiles?.username || "")} · ${timeAgo(p.created_at)}</p>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn-outline pin-post-btn" style="flex:1;min-width:100px">${p.is_pinned ? "Désépingler" : "Épingler"}</button>
        <button class="btn-outline boost-post-btn" style="flex:1;min-width:100px" ${p.admin_boosted ? "disabled" : ""}>${
        p.admin_boosted ? "Déjà boosté" : "+50 j'aimes"
      }</button>
        <button class="btn-outline delete-post-btn" style="flex:1;min-width:100px">Supprimer</button>
      </div>
    </div>
  `
    )
    .join("");

  list.querySelectorAll("[data-post]").forEach((card) => {
    const postId = card.dataset.post;

    card.querySelector(".delete-post-btn").addEventListener("click", async () => {
      if (!confirm("Supprimer définitivement cette publication ?")) return;
      await supabase.from("posts").delete().eq("id", postId);
      card.remove();
    });

    card.querySelector(".pin-post-btn").addEventListener("click", async (e) => {
      const currentlyPinned = e.target.textContent.trim() === "Désépingler";
      const { error } = await supabase.from("posts").update({ is_pinned: !currentlyPinned }).eq("id", postId);
      if (error) {
        alert("Échec : " + error.message);
        return;
      }
      loadPosts();
    });

    card.querySelector(".boost-post-btn").addEventListener("click", async (e) => {
      const { error } = await supabase.rpc("admin_grant_like_boost", { p_post_id: postId });
      if (error) {
        alert("Échec : " + error.message);
        return;
      }
      e.target.disabled = true;
      e.target.textContent = "Déjà boosté";
    });
  });
}

// ------------------------------------------------------------
// Badges décernables (owner uniquement)
// ------------------------------------------------------------
function populateBadgeSelect() {
  const select = document.getElementById("badge-select");
  select.innerHTML = AWARDABLE_BADGES.map((b) => `<option value="${b.code}">${escapeHtml(b.name)}</option>`).join("");
}

document.getElementById("badge-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("badge-error");
  const successEl = document.getElementById("badge-success");
  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  const usernameInput = document.getElementById("badge-username");
  const username = usernameInput.value.trim();
  const badgeCode = document.getElementById("badge-select").value;

  const { data: target, error: findError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single();

  if (findError || !target) {
    errorEl.textContent = "Utilisateur introuvable.";
    errorEl.classList.remove("hidden");
    return;
  }

  const { error } = await supabase
    .from("user_badges")
    .insert({ user_id: target.id, badge_code: badgeCode, awarded_by: me.id });

  if (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
    return;
  }

  successEl.textContent = `Badge décerné à ${username}.`;
  successEl.classList.remove("hidden");
  usernameInput.value = "";
});

// ------------------------------------------------------------
// Notifications personnalisées (staff)
// ------------------------------------------------------------
document.getElementById("notif-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("notif-error");
  const successEl = document.getElementById("notif-success");
  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  const usernameInput = document.getElementById("notif-username");
  const messageInput = document.getElementById("notif-message");
  const username = usernameInput.value.trim();
  const message = messageInput.value.trim();

  if (!message) return;

  const { data: target, error: findError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single();

  if (findError || !target) {
    errorEl.textContent = "Utilisateur introuvable.";
    errorEl.classList.remove("hidden");
    return;
  }

  const { error } = await supabase
    .from("notifications")
    .insert({ user_id: target.id, type: "custom", message, actor_id: me.id });

  if (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
    return;
  }

  successEl.textContent = `Notification envoyée à ${username}.`;
  successEl.classList.remove("hidden");
  usernameInput.value = "";
  messageInput.value = "";
});

// ------------------------------------------------------------
// Ban d'e-mail (temporaire)
// ------------------------------------------------------------
document.getElementById("ban-email-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("ban-email-error");
  const successEl = document.getElementById("ban-email-success");
  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  const usernameInput = document.getElementById("ban-email-username");
  const username = usernameInput.value.trim();
  const hours = parseInt(document.getElementById("ban-email-duration").value, 10);

  const { data: target, error: findError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single();

  if (findError || !target) {
    errorEl.textContent = "Utilisateur introuvable.";
    errorEl.classList.remove("hidden");
    return;
  }

  const bannedUntil = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const { error } = await supabase.from("profiles").update({ banned_until: bannedUntil }).eq("id", target.id);

  if (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
    return;
  }

  successEl.textContent = `${username} est banni jusqu'au ${new Date(bannedUntil).toLocaleString("fr-CA")}.`;
  successEl.classList.remove("hidden");
  usernameInput.value = "";
});

// ------------------------------------------------------------
// Ban d'IP (permanent)
// ------------------------------------------------------------
document.getElementById("ban-ip-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("ban-ip-error");
  const successEl = document.getElementById("ban-ip-success");
  errorEl.classList.add("hidden");
  successEl.classList.add("hidden");

  const ipInput = document.getElementById("ban-ip-input");
  const ip = ipInput.value.trim();
  if (!ip) return;

  const { error } = await supabase.from("ip_bans").insert({ ip, banned_by: me.id });

  if (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
    return;
  }

  successEl.textContent = `${ip} est banni définitivement.`;
  successEl.classList.remove("hidden");
  ipInput.value = "";
});

init();
