import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import {
  getLevel,
  getLevelBadge,
  computeAutoBadges,
  AWARDABLE_BADGES,
  badgeImagePath,
  ROLE_LABEL,
  escapeHtml,
  timeAgo
} from "./utils.js";
import { userBadgeHtml } from "./userBadge.js";
import { createPostCard } from "./postCard.js";

renderNavbar();

const params = new URLSearchParams(window.location.search);
let targetUsername = params.get("user") || "";
if (targetUsername && !targetUsername.startsWith("!")) targetUsername = "!" + targetUsername;

const loadingMsg = document.getElementById("loading-msg");
const notFoundMsg = document.getElementById("not-found-msg");
const box = document.getElementById("profile-box");

let me = null;
let meProfile = null;
let profile = null;

async function init() {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  me = session?.user?.id || null;

  if (me) {
    const { data } = await supabase.from("profiles").select("*").eq("id", me).single();
    meProfile = data;
  }

  if (!targetUsername) {
    loadingMsg.classList.add("hidden");
    notFoundMsg.classList.remove("hidden");
    return;
  }

  const { data: p } = await supabase.from("profiles").select("*").eq("username", targetUsername).single();
  loadingMsg.classList.add("hidden");

  if (!p) {
    notFoundMsg.classList.remove("hidden");
    return;
  }
  profile = p;

  const isOwn = me === profile.id;

  // ---- Bannière ----
  document.getElementById("banner-slot").innerHTML = profile.banner_url
    ? `<img src="${profile.banner_url}" alt="" />`
    : "";

  // ---- Avatar ----
  document.getElementById("avatar-slot").innerHTML = profile.pfp_url
    ? `<img src="${profile.pfp_url}" alt="" width="96" height="96" />`
    : `<span>${escapeHtml((profile.username[1] || "?").toUpperCase())}</span>`;

  // ---- Nom + rôle + niveau ----
  const level = getLevel({ role: profile.role, postsCount: profile.posts_count, likesReceived: profile.likes_received });
  document.getElementById("name-row-slot").innerHTML =
    userBadgeHtml({
      username: profile.username,
      role: profile.role,
      likesReceived: profile.likes_received,
      postsCount: profile.posts_count
    }) + (isOwn ? `<a href="settings.html" class="btn-outline" style="margin-left:8px">Paramètres</a>` : "");

  // ---- Étoiles de titre (7, dorée pour la 7e, blanche pour 1-6 obtenues, grise sinon) ----
  document.getElementById("stars-slot").innerHTML = renderStars(level.level);

  // ---- Stats + dernière connexion ----
  const friendsCount = await countAcceptedFriends(profile.id);
  document.getElementById("stats-slot").textContent =
    `${profile.likes_received} points · ${profile.posts_count || 0} publications · ${friendsCount} ami${friendsCount === 1 ? "" : "s"}`;

  const settings = profile.settings || {};
  const lastSeenEl = document.getElementById("last-seen-slot");
  if (settings.hide_last_seen && !isOwn) {
    lastSeenEl.textContent = "";
  } else if (profile.last_seen_at) {
    const online = Date.now() - new Date(profile.last_seen_at).getTime() < 5 * 60 * 1000;
    lastSeenEl.textContent = online ? "En ligne" : `Vu ${timeAgo(profile.last_seen_at)}`;
  }

  // ---- Description ----
  renderDescription(isOwn);

  // ---- Bouton ami ----
  if (!isOwn) {
    await renderFriendAction();
  }

  // ---- Badges ----
  await renderBadges(friendsCount);

  // ---- Publications (hors anonymes) ----
  await renderPosts();

  box.classList.remove("hidden");
}

function renderStars(level) {
  let html = "";
  for (let i = 1; i <= 7; i++) {
    const filled = level >= i;
    const color = !filled ? "#3a3a42" : i === 7 ? "#e8c55a" : "#f2f2f5";
    html += `<svg viewBox="0 0 24 24" fill="${color}"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L5.8 21l1.6-7L2 9.2l7.1-.6z"/></svg>`;
  }
  return html;
}

async function countAcceptedFriends(userId) {
  const { count } = await supabase
    .from("friends")
    .select("id", { count: "exact", head: true })
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  return count || 0;
}

function renderDescription(isOwn) {
  const slot = document.getElementById("description-slot");
  if (isOwn) {
    slot.innerHTML = `
      <textarea id="description-input" class="input" rows="3" placeholder="Parle un peu de toi…">${escapeHtml(profile.description || "")}</textarea>
      <button id="description-save-btn" class="btn-outline" style="margin-top:6px">Enregistrer</button>
    `;
    document.getElementById("description-save-btn").addEventListener("click", async () => {
      const value = document.getElementById("description-input").value.trim();
      await supabase.from("profiles").update({ description: value }).eq("id", me);
    });
  } else {
    slot.innerHTML = `<p class="post-body">${escapeHtml(profile.description || "Aucune description.")}</p>`;
  }
}

async function renderFriendAction() {
  const slot = document.getElementById("action-slot");

  if (!me) {
    slot.innerHTML = `<a href="login.html" class="friend-btn">Se connecter pour ajouter en ami</a>`;
    return;
  }

  const { data: rel } = await supabase
    .from("friends")
    .select("*")
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${me})`
    )
    .maybeSingle();

  if (!rel) {
    if (profile.settings?.decline_friend_requests) {
      slot.innerHTML = `<span class="hint-text">N'accepte pas les demandes d'amitié</span>`;
      return;
    }
    slot.innerHTML = `<button class="friend-btn" id="friend-add-btn">+ Ajouter en ami</button>`;
    document.getElementById("friend-add-btn").addEventListener("click", async () => {
      await supabase.from("friends").insert({ requester_id: me, addressee_id: profile.id, status: "pending" });
      renderFriendAction();
    });
    return;
  }

  if (rel.status === "accepted") {
    slot.innerHTML = `<button class="friend-btn accepted" id="friend-remove-btn">Ami ✓ (retirer)</button>`;
    document.getElementById("friend-remove-btn").addEventListener("click", async () => {
      if (!confirm("Retirer cette personne de tes amis ?")) return;
      await supabase.from("friends").delete().eq("id", rel.id);
      renderFriendAction();
    });
    return;
  }

  // pending
  if (rel.requester_id === me) {
    slot.innerHTML = `<button class="friend-btn" id="friend-cancel-btn">Demande envoyée (annuler)</button>`;
    document.getElementById("friend-cancel-btn").addEventListener("click", async () => {
      await supabase.from("friends").delete().eq("id", rel.id);
      renderFriendAction();
    });
  } else {
    slot.innerHTML = `
      <button class="friend-btn" id="friend-accept-btn">Accepter</button>
      <button class="friend-btn" id="friend-decline-btn">Refuser</button>
    `;
    document.getElementById("friend-accept-btn").addEventListener("click", async () => {
      await supabase.from("friends").update({ status: "accepted" }).eq("id", rel.id);
      renderFriendAction();
    });
    document.getElementById("friend-decline-btn").addEventListener("click", async () => {
      await supabase.from("friends").delete().eq("id", rel.id);
      renderFriendAction();
    });
  }
}

async function renderBadges(friendsCount) {
  const grid = document.getElementById("badge-grid-slot");

  const { data: friendRows } = await supabase
    .from("friends")
    .select("requester_id, addressee_id, profiles_requester:requester_id (role), profiles_addressee:addressee_id (role)")
    .eq("status", "accepted")
    .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`);

  let hasStaffFriend = false;
  let hasOwnerFriend = false;
  (friendRows || []).forEach((r) => {
    const otherRole = r.requester_id === profile.id ? r.profiles_addressee?.role : r.profiles_requester?.role;
    if (otherRole === "moderator" || otherRole === "owner") hasStaffFriend = true;
    if (otherRole === "owner") hasOwnerFriend = true;
  });

  const autoBadges = computeAutoBadges({
    postsCount: profile.posts_count || 0,
    likesReceived: profile.likes_received || 0,
    friendsCount,
    hasStaffFriend,
    hasOwnerFriend
  });

  const { data: awarded } = await supabase.from("user_badges").select("badge_code").eq("user_id", profile.id);
  const awardedCodes = new Set((awarded || []).map((b) => b.badge_code));
  const awardedBadges = AWARDABLE_BADGES.filter((b) => awardedCodes.has(b.code));

  const allBadges = [...autoBadges, ...awardedBadges];

  if (allBadges.length === 0) {
    grid.innerHTML = `<p class="muted" style="grid-column:1/-1">Aucun badge pour le moment.</p>`;
    return;
  }

  grid.innerHTML = allBadges
    .map(
      (b) => `
    <div class="badge-item">
      <img src="${badgeImagePath(b.code)}" alt="${escapeHtml(b.name)}" title="${escapeHtml(b.name)}" />
      <span>${escapeHtml(b.name)}</span>
    </div>
  `
    )
    .join("");
}

async function renderPosts() {
  const slot = document.getElementById("posts-slot");
  const { data } = await supabase
    .from("posts")
    .select(
      "id, title, body, is_anonymous, is_official, category_id, hashtags, created_at, author_id, profiles:author_id (username, role, likes_received, posts_count, pfp_url), categories:category_id (name, slug)"
    )
    .eq("author_id", profile.id)
    .eq("is_anonymous", false)
    .order("created_at", { ascending: false });

  if (!data || data.length === 0) {
    slot.innerHTML = `<p class="muted">Aucune publication (non-anonyme).</p>`;
    return;
  }

  slot.innerHTML = "";
  data.forEach((post) => {
    slot.appendChild(createPostCard(post, { currentUserId: me, currentProfile: meProfile }));
  });
}

init();
