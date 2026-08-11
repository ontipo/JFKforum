import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { createPostCard } from "./postCard.js";
import { openPostModal } from "./postModal.js";
import { escapeHtml } from "./utils.js";

const POST_SELECT =
  "id, title, body, is_anonymous, is_official, is_pinned, admin_boosted, score, image_url, image_status, category_id, hashtags, created_at, author_id, profiles:author_id (username, role, likes_received, posts_count, pfp_url), categories:category_id (name, slug)";

let categories = [];
let activeCategory = null;
let searchTerm = null;
let currentUserId = null;
let currentProfile = null;
let sortMode = "recent";

const tabsEl = document.getElementById("tabs");
const sortSelect = document.getElementById("sort-select");
const searchBanner = document.getElementById("search-banner");
const loadingMsg = document.getElementById("loading-msg");
const emptyMsg = document.getElementById("empty-msg");
const postsList = document.getElementById("posts-list");
const feedView = document.getElementById("feed-view");
const sharedView = document.getElementById("shared-view");
const sharedSlot = document.getElementById("shared-post-slot");
const publishFab = document.getElementById("publish-fab");

async function init() {
  await renderNavbar();
  await loadSession();
  supabase.auth.onAuthStateChange(() => loadSession());
  await loadCategories();

  const params = new URLSearchParams(window.location.search);
  const sharedId = params.get(""); // format [SITE]/?={id}
  const q = params.get("recherche");

  if (sharedId) {
    await showSharedPost(sharedId);
  } else {
    if (q && currentUserId) {
      searchTerm = q;
      searchBanner.classList.remove("hidden");
      searchBanner.innerHTML = `Résultats pour « ${escapeHtml(q)} » — <button id="clear-search" class="link-underline" style="background:none;border:none;padding:0">effacer</button>`;
      searchBanner.querySelector("#clear-search").addEventListener("click", () => {
        searchTerm = null;
        history.replaceState(null, "", window.location.pathname);
        searchBanner.classList.add("hidden");
        loadPosts();
      });
    }
    renderTabs();
    await loadPosts();
  }
}

async function loadSession() {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  currentUserId = session?.user?.id || null;
  if (session) {
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    currentProfile = data;
  } else {
    currentProfile = null;
  }
}

async function loadCategories() {
  const { data } = await supabase.from("categories").select("*").order("name");
  categories = data || [];
}

function renderTabs() {
  tabsEl.innerHTML = `
    <button class="tab ${activeCategory === null ? "active" : ""}" data-cat="">Tous</button>
    ${categories
      .map((c) => `<button class="tab ${activeCategory === c.id ? "active" : ""}" data-cat="${c.id}">${escapeHtml(c.name)}</button>`)
      .join("")}
  `;
  tabsEl.querySelectorAll("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.cat || null;
      renderTabs();
      loadPosts();
    });
  });
}

async function loadPosts() {
  loadingMsg.classList.remove("hidden");
  emptyMsg.classList.add("hidden");
  postsList.innerHTML = "";

  let query = supabase.from("posts").select(POST_SELECT);
  if (activeCategory) query = query.eq("category_id", activeCategory);
  if (searchTerm) {
    // PostgREST : dans un filtre .or(), le joker s'écrit "*" (pas "%"), et les
    // virgules/parenthèses cassent la syntaxe du filtre — on les retire.
    const clean = searchTerm.replace(/^#/, "").trim().replace(/[,()]/g, "");
    query = query.or(`title.ilike.*${clean}*,hashtags.cs.{${clean.toLowerCase()}}`);
  }

  if (sortMode === "liked") {
    query = query.order("score", { ascending: false });
  } else if (sortMode === "pinned") {
    query = query.order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
  } else {
    // "recent" et "random" partent toutes les deux du plus récent ;
    // "random" est ensuite mélangé côté client juste après le rendu.
    query = query.order("created_at", { ascending: false });
  }

  const { data } = await query;
  loadingMsg.classList.add("hidden");

  if (!data || data.length === 0) {
    emptyMsg.classList.remove("hidden");
    return;
  }

  const visible = currentUserId ? data : data.slice(0, 5);

  visible.forEach((post) => {
    postsList.appendChild(createPostCard(post, { currentUserId, currentProfile }));
  });

  if (!currentUserId && data.length > 5) {
    const prompt = document.createElement("div");
    prompt.className = "post-card";
    prompt.style.textAlign = "center";
    prompt.innerHTML = `<p class="post-body">Connecte-toi pour voir plus de publications.</p><a href="login.html" class="btn-outline" style="display:inline-block;margin-top:8px">Se connecter</a>`;
    postsList.appendChild(prompt);
  }

  if (sortMode === "random") shuffleFeed();
}

function shuffleFeed() {
  const cards = Array.from(postsList.children);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    postsList.insertBefore(cards[j], cards[i]);
  }
}

async function showSharedPost(id) {
  feedView.classList.add("hidden");
  sharedView.classList.remove("hidden");
  const { data } = await supabase.from("posts").select(POST_SELECT).eq("id", id).single();
  sharedSlot.innerHTML = "";
  if (data) {
    sharedSlot.appendChild(createPostCard(data, { currentUserId, currentProfile, forceExpanded: true }));
  } else {
    sharedSlot.innerHTML = `<p class="muted">Cette publication est introuvable.</p>`;
  }
}

document.getElementById("back-to-feed").addEventListener("click", () => {
  history.replaceState(null, "", window.location.pathname);
  sharedView.classList.add("hidden");
  feedView.classList.remove("hidden");
  renderTabs();
  loadPosts();
});

sortSelect?.addEventListener("change", () => {
  sortMode = sortSelect.value;
  loadPosts();
});

publishFab.addEventListener("click", () => {
  if (!currentUserId) {
    window.location.href = "login.html";
    return;
  }
  openPostModal({
    categories,
    currentUserId,
    currentProfile,
    onCreated: () => loadPosts()
  });
});

init();
