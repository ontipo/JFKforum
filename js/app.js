// ============================================================
// app.js — logique du fil, du détail d'un post, des réactions
// et de la publication
// ============================================================

const CATEGORY_LABELS = { informatique: "Informatique", societe: "Société", autres: "Autres" };

let currentUser = null;    // session Supabase auth
let currentProfile = null; // ligne profiles correspondante
let activeCategory = "all";
let categoriesCache = [];  // [{id, slug, name}]

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

  const { data: cats } = await supabase.from("categories").select("id, slug, name");
  categoriesCache = cats ?? [];

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

function badgeImg(level) {
  return `<img class="badge" src="${levelBadgeUrl(level)}" alt="Niveau ${level}" title="Niveau ${level}" onerror="this.style.visibility='hidden'" />`;
}

// ------------------------------------------------------------
// FIL PRINCIPAL
// ------------------------------------------------------------
async function loadPosts() {
  let query = supabase
    .from("posts")
    .select(`
      id, public_id, title, body, is_anonymous, hashtags, created_at, category_id,
      categories ( slug, name ),
      profiles:author_id ( id, username, role, total_likes ),
      replies ( count )
    `)
    .order("created_at", { ascending: false });

  if (activeCategory !== "all") {
    const cat = categoriesCache.find((c) => c.slug === activeCategory);
    if (cat) query = query.eq("category_id", cat.id);
  }

  const { data: posts, error } = await query;
  if (error) { console.error(error); return; }

  const reactions = await fetchReactionsFor(posts.map((p) => p.id));
  renderPosts(posts ?? [], reactions);
}

async function fetchReactionsFor(postIds) {
  if (!postIds.length) return [];
  const { data, error } = await supabase
    .from("reactions")
    .select("post_id, type, user_id")
    .in("post_id", postIds);
  if (error) { console.error(error); return []; }
  return data;
}

function summarizeReactions(postId, reactions) {
  const forPost = reactions.filter((r) => r.post_id === postId);
  const counts = { like: 0, superlike: 0, dislike: 0 };
  let mine = null;
  forPost.forEach((r) => {
    counts[r.type]++;
    if (currentUser && r.user_id === currentUser.id) mine = r.type;
  });
  return { counts, mine };
}

function renderPosts(posts, reactions) {
  const list = document.getElementById("postList");
  const empty = document.getElementById("feedEmpty");
  document.getElementById("postDetail").style.display = "none";
  list.style.display = "";

  if (posts.length === 0) {
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  list.innerHTML = posts.map((post) => postCardHtml(post, reactions)).join("");
  attachPostCardHandlers();
}

function postCardHtml(post, reactions) {
  const author = post.profiles;
  const level = author ? getLevelFromLikes(author.total_likes) : 0;
  const isMod = author?.role === "moderator" || author?.role === "owner";
  const isOwnPost = currentUser && author && currentUser.id === author.id;

  const displayName = post.is_anonymous
    ? `Anonyme${isMod ? ` (@${author.username})` : ""}`
    : (author?.username ?? "Utilisateur supprimé");

  const preview = post.body.length > 300 ? post.body.slice(0, 300) + "…" : post.body;
  const replyCount = post.replies?.[0]?.count ?? 0;
  const { counts, mine } = summarizeReactions(post.id, reactions);

  const reactBtn = (type, icon, label) => `
    <button class="action-btn ${mine === type ? "active-" + (type === "dislike" ? "like" : type) : ""} ${isOwnPost || !currentUser ? "disabled" : ""}"
      data-action="react" data-type="${type}" data-post="${post.id}"
      ${isOwnPost || !currentUser ? "disabled title=\"" + (isOwnPost ? "Impossible de réagir à sa propre publication" : "Connecte-toi pour réagir") + "\"" : ""}>
      ${icon} ${label} <span class="count">${counts[type]}</span>
    </button>`;

  return `
    <article class="post-card" data-post-id="${post.id}" data-public-id="${post.public_id}">
      <div class="post-meta">
        ${badgeImg(level)}
        <span class="post-author ${post.is_anonymous ? "anon" : ""}">${escapeHtml(displayName)}</span>
        ${author?.role === "owner" ? '<span class="tag-role owner">Owner</span>' : ""}
        ${author?.role === "moderator" ? '<span class="tag-role">Modérateur</span>' : ""}
        <span>·</span>
        <span>${post.categories?.name ?? ""}</span>
        <span>·</span>
        <span>${timeAgo(post.created_at)}</span>
      </div>
      <h2 class="post-title" data-action="open" data-public="${post.public_id}">${escapeHtml(post.title)}</h2>
      <p class="post-preview" data-action="open" data-public="${post.public_id}">${escapeHtml(preview)}</p>
      <div class="post-actions">
        ${reactBtn("superlike", "✦", "Superlike")}
        ${reactBtn("like", "▲", "J'aime")}
        ${reactBtn("dislike", "▽", "")}
        <button class="action-btn" data-action="open" data-public="${post.public_id}">💬 ${replyCount}</button>
        <button class="action-btn" data-action="share" data-public="${post.public_id}">↗ Partager</button>
        <span class="post-id">?=${post.public_id}</span>
      </div>
    </article>
  `;
}

function attachPostCardHandlers() {
  document.querySelectorAll('[data-action="open"]').forEach((el) => {
    el.addEventListener("click", () => openPost(el.dataset.public));
  });

  document.querySelectorAll('[data-action="share"]').forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const url = `${location.origin}${location.pathname}?=${el.dataset.public}`;
      try {
        await navigator.clipboard.writeText(url);
        const original = el.innerHTML;
        el.innerHTML = "✓ Copié";
        setTimeout(() => (el.innerHTML = original), 1500);
      } catch {
        prompt("Copie ce lien :", url);
      }
    });
  });

  document.querySelectorAll('[data-action="react"]').forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (el.disabled) return;
      await handleReaction(Number(el.dataset.post), el.dataset.type);
    });
  });
}

async function handleReaction(postId, type) {
  if (!currentUser) { window.location.href = "login.html"; return; }

  const { data: existing } = await supabase
    .from("reactions")
    .select("id, type")
    .eq("post_id", postId)
    .eq("user_id", currentUser.id)
    .maybeSingle();

  try {
    if (existing && existing.type === type) {
      await supabase.from("reactions").delete().eq("id", existing.id);
    } else if (existing) {
      await supabase.from("reactions").update({ type }).eq("id", existing.id);
    } else {
      const { error } = await supabase.from("reactions").insert({ post_id: postId, user_id: currentUser.id, type });
      if (error) throw error;
    }
  } catch (err) {
    alert(err.message || "Impossible d'enregistrer la réaction.");
  }

  // Recharge la vue courante (fil ou détail) pour refléter le nouveau compte
  if (document.getElementById("postDetail").style.display === "block") {
    const publicId = document.getElementById("postDetail").dataset.currentPublic;
    openPost(publicId);
  } else {
    loadPosts();
  }
}

// ------------------------------------------------------------
// VUE DÉTAIL D'UN POST — accessible via [SITE]/?={id}
// ------------------------------------------------------------
async function openPost(publicId) {
  history.pushState({}, "", `${location.pathname}?=${publicId}`);
  await renderPostDetailById(publicId);
}

async function renderPostDetailById(publicId) {
  const { data: post, error } = await supabase
    .from("posts")
    .select(`
      id, public_id, title, body, is_anonymous, hashtags, created_at,
      categories ( name ),
      profiles:author_id ( id, username, role, total_likes )
    `)
    .eq("public_id", publicId)
    .single();

  if (error || !post) {
    document.getElementById("postDetail").innerHTML = `<p class="post-preview">Publication introuvable.</p>`;
    document.getElementById("postDetail").style.display = "block";
    document.getElementById("postList").style.display = "none";
    document.getElementById("feedEmpty").style.display = "none";
    return;
  }

  const { data: replies } = await supabase
    .from("replies")
    .select("id, body, is_anonymous, created_at, profiles:author_id ( id, username, role )")
    .eq("post_id", post.id)
    .order("created_at", { ascending: true });

  const reactions = await fetchReactionsFor([post.id]);
  const { counts, mine } = summarizeReactions(post.id, reactions);

  const author = post.profiles;
  const level = author ? getLevelFromLikes(author.total_likes) : 0;
  const isMod = author?.role === "moderator" || author?.role === "owner";
  const isOwnPost = currentUser && author && currentUser.id === author.id;
  const displayName = post.is_anonymous
    ? `Anonyme${isMod ? ` (@${author.username})` : ""}`
    : (author?.username ?? "Utilisateur supprimé");

  const reactBtn = (type, icon, label) => `
    <button class="action-btn ${mine === type ? "active-" + (type === "dislike" ? "like" : type) : ""} ${isOwnPost || !currentUser ? "disabled" : ""}"
      data-action="react" data-type="${type}" data-post="${post.id}"
      ${isOwnPost || !currentUser ? "disabled" : ""}>
      ${icon} ${label} <span class="count">${counts[type]}</span>
    </button>`;

  const repliesHtml = (replies ?? []).map((r) => {
    const rAuthor = r.profiles;
    const rIsMod = rAuthor?.role === "moderator" || rAuthor?.role === "owner";
    const rName = r.is_anonymous ? `Anonyme${rIsMod ? ` (@${rAuthor.username})` : ""}` : (rAuthor?.username ?? "Utilisateur supprimé");
    const isAuthorReply = rAuthor && author && rAuthor.id === author.id;
    return `
      <div class="reply-card">
        <div class="post-meta">
          <span class="post-author ${r.is_anonymous ? "anon" : ""}">${escapeHtml(rName)}</span>
          ${isAuthorReply ? '<span class="au-tag">AU</span>' : ""}
          <span>·</span>
          <span>${timeAgo(r.created_at)}</span>
        </div>
        <p class="detail-body" style="margin:6px 0 0; font-size:0.9rem;">${escapeHtml(r.body)}</p>
      </div>
    `;
  }).join("") || `<p class="post-preview">Aucune réponse pour le moment.</p>`;

  const replyFormHtml = currentUser ? `
    <form class="reply-form" id="replyForm" style="margin-top:18px;">
      <textarea id="replyBody" rows="3" placeholder="Écrire une réponse..." required></textarea>
      <button type="submit" class="btn-primary" style="width:auto; padding:9px 20px;">Répondre</button>
    </form>
  ` : `<p class="field-hint" style="margin-top:14px;"><a href="login.html" class="btn-link">Connecte-toi</a> pour répondre.</p>`;

  const detail = document.getElementById("postDetail");
  detail.dataset.currentPublic = publicId;
  detail.innerHTML = `
    <a href="#" class="back-link" id="backToFeed">← Retour au fil</a>
    <article class="post-card" data-post-id="${post.id}">
      <div class="post-meta">
        ${badgeImg(level)}
        <span class="post-author ${post.is_anonymous ? "anon" : ""}">${escapeHtml(displayName)}</span>
        ${author?.role === "owner" ? '<span class="tag-role owner">Owner</span>' : ""}
        ${author?.role === "moderator" ? '<span class="tag-role">Modérateur</span>' : ""}
        <span>·</span><span>${post.categories?.name ?? ""}</span>
        <span>·</span><span>${timeAgo(post.created_at)}</span>
      </div>
      <h1 class="post-title">${escapeHtml(post.title)}</h1>
      <p class="detail-body">${escapeHtml(post.body)}</p>
      <div class="post-actions">
        ${reactBtn("superlike", "✦", "Superlike")}
        ${reactBtn("like", "▲", "J'aime")}
        ${reactBtn("dislike", "▽", "")}
        <button class="action-btn" data-action="share" data-public="${post.public_id}">↗ Partager</button>
        <span class="post-id">?=${post.public_id}</span>
      </div>
    </article>
    <section style="margin-top:22px;">
      <h3 class="nav-section-label">Réponses</h3>
      ${repliesHtml}
      ${replyFormHtml}
    </section>
  `;

  document.getElementById("postList").style.display = "none";
  document.getElementById("feedEmpty").style.display = "none";
  detail.style.display = "block";

  attachPostCardHandlers();

  document.getElementById("backToFeed").addEventListener("click", (e) => {
    e.preventDefault();
    history.pushState({}, "", location.pathname);
    detail.style.display = "none";
    document.getElementById("postList").style.display = "";
    loadPosts();
  });

  const replyForm = document.getElementById("replyForm");
  if (replyForm) {
    replyForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = document.getElementById("replyBody").value.trim();
      if (!body) return;
      const { error: replyError } = await supabase.from("replies").insert({
        post_id: post.id, author_id: currentUser.id, body, is_anonymous: false,
      });
      if (replyError) { alert(replyError.message); return; }
      renderPostDetailById(publicId);
    });
  }
}

// Lit le format d'URL demandé : [SITE]/?={id} (clé de query vide)
function getPublicIdFromUrl() {
  const params = new URLSearchParams(location.search);
  const id = params.get("");
  return id && /^\d{11}$/.test(id) ? id : null;
}

// ------------------------------------------------------------
// NAVIGATION CATÉGORIES
// ------------------------------------------------------------
document.querySelectorAll(".nav-link[data-category]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".nav-link[data-category]").forEach((l) => l.classList.remove("active"));
    link.classList.add("active");
    activeCategory = link.dataset.category;
    document.getElementById("feedTitle").textContent =
      activeCategory === "all" ? "Tous les posts" : CATEGORY_LABELS[activeCategory];
    history.pushState({}, "", location.pathname);
    document.getElementById("postDetail").style.display = "none";
    document.getElementById("postList").style.display = "";
    loadPosts();
    document.getElementById("sidebar").classList.remove("open");
  });
});

// ------------------------------------------------------------
// RECHERCHE (titre + hashtags, côté client sur la page courante)
// ------------------------------------------------------------
document.getElementById("searchInput").addEventListener("input", (e) => {
  const term = e.target.value.trim().toLowerCase();
  document.querySelectorAll(".post-card").forEach((card) => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(term) ? "" : "none";
  });
});

// ------------------------------------------------------------
// MENU MOBILE
// ------------------------------------------------------------
document.getElementById("sidebarToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

// ------------------------------------------------------------
// PUBLICATION
// ------------------------------------------------------------
const publishOverlay = document.getElementById("publishOverlay");

document.getElementById("openPublish").addEventListener("click", () => {
  if (!currentUser) { window.location.href = "login.html"; return; }
  document.getElementById("publishForm").reset();
  document.getElementById("publishMsg").className = "form-msg";
  publishOverlay.classList.add("open");
});

document.getElementById("closePublish").addEventListener("click", () => publishOverlay.classList.remove("open"));
publishOverlay.addEventListener("click", (e) => { if (e.target === publishOverlay) publishOverlay.classList.remove("open"); });

document.getElementById("publishForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("publishMsg");
  const submitBtn = e.target.querySelector("button[type=submit]");

  const categorySlug = document.getElementById("postCategory").value;
  const title = document.getElementById("postTitle").value.trim();
  const body = document.getElementById("postBody").value.trim();
  const isAnonymous = document.getElementById("postAnonymous").checked;

  const hashtags = [...new Set((body.match(/#[\p{L}0-9_]+/gu) || []).map((h) => h.slice(1).toLowerCase()))].slice(0, 50);
  const mentionedNames = [...new Set((body.match(/@[A-Za-z0-9_]+/g) || []).map((m) => "!" + m.slice(1)))];

  let mentionIds = [];
  if (mentionedNames.length) {
    const { data: mentionedProfiles } = await supabase.from("profiles").select("id, username").in("username", mentionedNames);
    mentionIds = (mentionedProfiles ?? []).map((p) => p.id);
  }

  const category = categoriesCache.find((c) => c.slug === categorySlug);
  if (!category) { msg.textContent = "Catégorie invalide."; msg.className = "form-msg error"; return; }

  submitBtn.disabled = true;
  submitBtn.textContent = "Publication...";

  const { error } = await supabase.from("posts").insert({
    author_id: currentUser.id,
    category_id: category.id,
    title,
    body,
    is_anonymous: isAnonymous,
    hashtags,
    mentions: mentionIds,
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "Publier";

  if (error) {
    msg.textContent = error.message;
    msg.className = "form-msg error";
    return;
  }

  publishOverlay.classList.remove("open");
  loadPosts();
});

document.getElementById("shuffleBtn").addEventListener("click", () => {
  document.getElementById("postDetail").style.display = "none";
  document.getElementById("postList").style.display = "";
  loadPosts().then(() => {
    const list = document.getElementById("postList");
    const cards = [...list.children];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      list.insertBefore(cards[j], cards[i]);
    }
  });
});

// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
initSession().then(async () => {
  const publicId = getPublicIdFromUrl();
  if (publicId) {
    document.getElementById("postList").style.display = "none";
    await renderPostDetailById(publicId);
  } else {
    loadPosts();
  }
});

window.addEventListener("popstate", () => {
  const publicId = getPublicIdFromUrl();
  if (publicId) {
    document.getElementById("postList").style.display = "none";
    renderPostDetailById(publicId);
  } else {
    document.getElementById("postDetail").style.display = "none";
    document.getElementById("postList").style.display = "";
    loadPosts();
  }
});
