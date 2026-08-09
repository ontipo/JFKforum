// ============================================================
// app.js — logique du fil principal
// ============================================================

const CATEGORY_LABELS = { informatique: "Informatique", societe: "Société", autres: "Autres" };

let currentUser = null;   // session Supabase auth
let currentProfile = null; // ligne profiles correspondante
let activeCategory = "all";

async function initSession() {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .single();
    currentProfile = profile;
  }

  renderAccountArea();
}

function renderAccountArea() {
  const area = document.getElementById("accountArea");

  if (!currentUser || !currentProfile) {
    area.innerHTML = `
      <a href="login.html" class="btn-link" style="text-decoration:none; padding:8px 14px; border:1px solid var(--border); border-radius:999px;">Connexion</a>
    `;
    return;
  }

  const level = getLevelFromLikes(currentProfile.total_likes);
  const roleTag = currentProfile.role !== "user"
    ? `<span class="tag-role ${currentProfile.role === "owner" ? "owner" : ""}">${currentProfile.role === "owner" ? "Owner" : "Modérateur"}</span>`
    : "";

  area.innerHTML = `
    <a href="account.html" class="account-chip">
      <span class="avatar" style="${currentProfile.avatar_url ? `background-image:url(${currentProfile.avatar_url}); background-size:cover;` : ""}"></span>
      <span style="font-size:0.85rem;">${currentProfile.username}</span>
      ${roleTag}
    </a>
  `;

  document.getElementById("adminNav").style.display =
    ["moderator", "owner"].includes(currentProfile.role) ? "block" : "none";
}

async function loadPosts() {
  let query = supabase
    .from("posts")
    .select(`
      id, public_id, title, body, is_anonymous, hashtags, created_at,
      category_id,
      categories ( slug, name ),
      profiles:author_id ( username, role, total_likes )
    `)
    .order("created_at", { ascending: false });

  if (activeCategory !== "all") {
    const { data: cat } = await supabase.from("categories").select("id").eq("slug", activeCategory).single();
    if (cat) query = query.eq("category_id", cat.id);
  }

  const { data: posts, error } = await query;

  if (error) {
    console.error(error);
    return;
  }

  renderPosts(posts ?? []);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} j`;
}

function renderPosts(posts) {
  const list = document.getElementById("postList");
  const empty = document.getElementById("feedEmpty");

  if (posts.length === 0) {
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  list.innerHTML = posts.map((post) => {
    const author = post.profiles;
    const level = author ? getLevelFromLikes(author.total_likes) : 0;
    const isMod = author?.role === "moderator" || author?.role === "owner";

    const displayName = post.is_anonymous
      ? `Anonyme${isMod ? ` (@${author.username})` : ""}`
      : (author?.username ?? "Utilisateur supprimé");

    const preview = post.body.length > 300 ? post.body.slice(0, 300) + "…" : post.body;

    return `
      <article class="post-card" data-post-id="${post.id}">
        <div class="post-meta">
          <span class="badge" title="Niveau ${level}"></span>
          <span class="post-author ${post.is_anonymous ? "anon" : ""}">${escapeHtml(displayName)}</span>
          ${author?.role === "owner" ? '<span class="tag-role owner">Owner</span>' : ""}
          ${author?.role === "moderator" ? '<span class="tag-role">Modérateur</span>' : ""}
          <span>·</span>
          <span>${post.categories?.name ?? ""}</span>
          <span>·</span>
          <span>${timeAgo(post.created_at)}</span>
        </div>
        <h2 class="post-title">${escapeHtml(post.title)}</h2>
        <p class="post-preview">${escapeHtml(preview)}</p>
        <div class="post-actions">
          <button class="action-btn" data-action="superlike">✦ Superlike</button>
          <button class="action-btn" data-action="like">▲ J'aime</button>
          <button class="action-btn" data-action="dislike">▽</button>
          <button class="action-btn" data-action="reply">💬 Réponses</button>
          <button class="action-btn" data-action="share">↗ Partager</button>
          <span class="post-id">?=${post.public_id}</span>
        </div>
      </article>
    `;
  }).join("");
}

// --- Navigation catégories ---
document.querySelectorAll(".nav-link[data-category]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".nav-link[data-category]").forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
    activeCategory = link.dataset.category;
    document.getElementById("feedTitle").textContent =
      activeCategory === "all" ? "Tous les posts" : CATEGORY_LABELS[activeCategory];
    loadPosts();
  });
});

// --- Recherche (titre + hashtags, côté client sur la page courante) ---
document.getElementById("searchInput").addEventListener("input", (e) => {
  const term = e.target.value.trim().toLowerCase();
  document.querySelectorAll(".post-card").forEach((card) => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(term) ? "" : "none";
  });
});

// --- Publier (redirige vers connexion si non connecté) ---
document.getElementById("openPublish").addEventListener("click", () => {
  if (!currentUser) {
    window.location.href = "login.html";
    return;
  }
  // Le modal complet de publication (titre, texte, hashtags, anonymat,
  // mentions) est la prochaine brique à construire sur ce socle.
  alert("Le formulaire de publication complet arrive à la prochaine étape.");
});

document.getElementById("shuffleBtn").addEventListener("click", loadPosts);

initSession().then(loadPosts);
