import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { createPostCard } from "./postCard.js";
import { openPostModal } from "./postModal.js";
import { escapeHtml } from "./utils.js";

const POST_SELECT =
  "id, title, body, is_anonymous, category_id, hashtags, created_at, author_id, profiles:author_id (username, role, likes_received), categories:category_id (name, slug)";

let categories = [];
let activeCategory = null;
let searchTerm = null;
let currentUserId = null;
let currentProfile = null;

const tabsEl = document.getElementById("tabs");
const shuffleBtn = document.getElementById("shuffle-btn");
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
    if (q) {
      searchTerm = q;
      searchBanner.classList.remove("hidden");
      searchBanner.innerHTML = `Résultats pour « ${escapeHtml(q)} » — <button id="clear-search" class="link-underline" style="background:none;border:none;padding:0">effacer</button>`;
      searchBanner.querySelector("#clear-search").addEventListener("click", () => {
        searchTerm = null;
        history.replaceState(null, "", "/");
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

  let query = supabase.from("posts").select(POST_SELECT).order("created_at", { ascending: false });
  if (activeCategory) query = query.eq("category_id", activeCategory);
  if (searchTerm) {
    const clean = searchTerm.replace(/^#/, "").toLowerCase();
    query = query.or(`title.ilike.%${searchTerm}%,hashtags.cs.{${clean}}`);
  }

  const { data } = await query;
  loadingMsg.classList.add("hidden");

  if (!data || data.length === 0) {
    emptyMsg.classList.remove("hidden");
    return;
  }

  data.forEach((post) => {
    postsList.appendChild(createPostCard(post, { currentUserId, currentProfile }));
  });
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
  history.replaceState(null, "", "/");
  sharedView.classList.add("hidden");
  feedView.classList.remove("hidden");
  renderTabs();
  loadPosts();
});

shuffleBtn.addEventListener("click", () => {
  const cards = Array.from(postsList.children);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    postsList.insertBefore(cards[j], cards[i]);
  }
});

publishFab.addEventListener("click", () => {
  if (!currentUserId) {
    window.location.href = "/login.html";
    return;
  }
  openPostModal({
    categories,
    currentUserId,
    onCreated: () => loadPosts()
  });
});

init();
