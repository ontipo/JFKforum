import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { escapeHtml, timeAgo } from "./utils.js";

renderNavbar();

let me = null;

async function init() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "/login.html";
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
  }

  await loadCategories();
  await loadPendingImages();
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
    .select("id, username, pfp_pending_url, banner_pending_url, pfp_status, banner_status")
    .or("pfp_status.eq.pending,banner_status.eq.pending");

  const list = document.getElementById("pending-images-list");
  const emptyMsg = document.getElementById("pending-images-empty");

  const rows = [];
  (data || []).forEach((p) => {
    if (p.pfp_status === "pending" && p.pfp_pending_url) rows.push({ ...p, field: "pfp" });
    if (p.banner_status === "pending" && p.banner_pending_url) rows.push({ ...p, field: "banner" });
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
      <p style="margin:0 0 8px"><strong>${escapeHtml(r.username)}</strong> — ${r.field === "pfp" ? "photo de profil" : "bannière"}</p>
      <p class="hint-text" style="word-break:break-all;margin-bottom:10px">${escapeHtml(r.field === "pfp" ? r.pfp_pending_url : r.banner_pending_url)}</p>
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
  const userId = card.dataset.user;
  const field = card.dataset.field;

  const patch =
    field === "pfp"
      ? approve
        ? { pfp_status: "approved", pfp_url: card.querySelector(".hint-text").textContent }
        : { pfp_status: "rejected" }
      : approve
      ? { banner_status: "approved", banner_url: card.querySelector(".hint-text").textContent }
      : { banner_status: "rejected" };

  await supabase.from("profiles").update(patch).eq("id", userId);
  loadPendingImages();
}

// ------------------------------------------------------------
// Suppression de posts
// ------------------------------------------------------------
async function loadPosts() {
  const { data } = await supabase
    .from("posts")
    .select("id, title, created_at, is_anonymous, profiles:author_id (username)")
    .order("created_at", { ascending: false })
    .limit(30);

  const list = document.getElementById("posts-admin-list");
  list.innerHTML = (data || [])
    .map(
      (p) => `
    <div class="post-card" style="padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px" data-post="${p.id}">
      <div style="min-width:0">
        <p style="margin:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.title)}</p>
        <p class="hint-text" style="margin:2px 0 0">${escapeHtml(p.is_anonymous ? "Anonyme" : p.profiles?.username || "")} · ${timeAgo(p.created_at)}</p>
      </div>
      <button class="btn-outline delete-post-btn" style="flex-shrink:0">Supprimer</button>
    </div>
  `
    )
    .join("");

  list.querySelectorAll(".delete-post-btn").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const card = e.target.closest("[data-post]");
      if (!confirm("Supprimer définitivement cette publication ?")) return;
      await supabase.from("posts").delete().eq("id", card.dataset.post);
      card.remove();
    })
  );
}

init();
