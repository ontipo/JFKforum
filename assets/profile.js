import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import {
  getLevel,
  computeAutoBadges,
  AWARDABLE_BADGES,
  badgeImagePath,
  ROLE_LABEL,
  escapeHtml,
  timeAgo,
  containsBannedWord,
  avatarImgHtml,
  bannerImgHtml,
  formatKc
} from "./utils.js";
import { userBadgeHtml } from "./userBadge.js";
import { createPostCard } from "./postCard.js";
import { setOgTags } from "./og.js";

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

async function showIpProfile(ip) {
  const { data: ipProfile } = await supabase.from("ip_profiles").select("*").eq("ip", ip).single();
  loadingMsg.classList.add("hidden");

  if (!ipProfile) {
    notFoundMsg.classList.remove("hidden");
    return;
  }

  const username = `!p${ipProfile.ip}`;

  setOgTags({
    title: `JFKforum - Profil de ${username}`,
    description: `Profil du porte-parole IP ${username} sur JFKforum`,
    url: window.location.href
  });

  document.getElementById("banner-slot").innerHTML = "";
  document.getElementById("avatar-slot").innerHTML = `<span style="font-size:28px">📶</span>`;
  document.getElementById("name-row-slot").innerHTML = `<span class="user-badge"><span class="name">${escapeHtml(username)}</span></span>`;
  document.getElementById("stars-slot").innerHTML = "";
  document.getElementById("action-slot").innerHTML = "";
  document.getElementById("stats-slot").textContent = "Profil porte-parole IP — sans rang ni Kennedcoins";
  document.getElementById("last-seen-slot").textContent =
    `Membre depuis le ${new Date(ipProfile.created_at).toLocaleDateString("fr-CA")} · Vu ${timeAgo(ipProfile.last_seen_at)}`;
  document.getElementById("description-slot").innerHTML = `<p class="hint-text">Les porte-parole IP ne peuvent pas ajouter de description.</p>`;

  document.getElementById("badge-grid-slot").innerHTML = `<p class="hint-text" style="grid-column:1/-1">Les porte-parole IP ne peuvent pas obtenir de badges.</p>`;

  document.getElementById("posts-slot").innerHTML = `<p class="muted">Les porte-parole IP ne peuvent publier que des réponses, pas de publications.</p>`;

  box.classList.remove("hidden");
}


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

  if (targetUsername.startsWith("!p")) {
    await showIpProfile(targetUsername.slice(2));
    return;
  }

  const { data: p } = await supabase.from("profiles").select("*").eq("username", targetUsername).single();
  loadingMsg.classList.add("hidden");

  if (!p) {
    notFoundMsg.classList.remove("hidden");
    return;
  }
  profile = p;

  setOgTags({
    title: `JFKforum - Profil de ${profile.username}`,
    description: profile.description || `Profil de ${profile.username} sur JFKforum`,
    url: window.location.href
  });

  const isOwn = me === profile.id;

  // ---- Bannière ----
  document.getElementById("banner-slot").innerHTML = bannerImgHtml(profile.username, profile.banner_url);

  // ---- Avatar ----
  document.getElementById("avatar-slot").innerHTML = avatarImgHtml(profile.username, profile.pfp_url, 96);

  // ---- Nom + rôle + niveau ----
  const level = getLevel({ role: profile.role, postsCount: profile.posts_count, likesReceived: profile.likes_received });
  document.getElementById("name-row-slot").innerHTML =
    userBadgeHtml({
      username: profile.username,
      role: profile.role,
      likesReceived: profile.likes_received,
      postsCount: profile.posts_count
    }) + (isOwn ? `<a href="settings.html" class="btn-outline" style="margin-left:8px">Paramètres</a>` : "");

  // ---- Étoiles de titre ----
  document.getElementById("stars-slot").innerHTML = renderStars(level.level);

  // ---- Stats + date de création + dernière connexion ----
  const friendsCount = await countAcceptedFriends(profile.id);
  const settings = profile.settings || {};

  const kcLine = isOwn || settings.show_kc_balance ? ` · ${formatKc(profile.kc_balance || 0)}` : "";
  const ageLine = isOwn || settings.show_age_verified ? ` · ${profile.age_verified ? "Âge vérifié ✓" : "Âge non vérifié"}` : "";

  document.getElementById("stats-slot").textContent =
    `${profile.likes_received} points · ${profile.posts_count || 0} publications · ${friendsCount} ami${friendsCount === 1 ? "" : "s"}${kcLine}${ageLine}`;

  const createdLabel = profile.created_at
    ? `Membre depuis le ${new Date(profile.created_at).toLocaleDateString("fr-CA")}`
    : "";

  const lastSeenEl = document.getElementById("last-seen-slot");
  if (settings.hide_last_seen && !isOwn) {
    lastSeenEl.textContent = createdLabel;
  } else if (profile.last_seen_at) {
    const online = Date.now() - new Date(profile.last_seen_at).getTime() < 5 * 60 * 1000;
    lastSeenEl.textContent = `${createdLabel} · ${online ? "En ligne" : `Vu ${timeAgo(profile.last_seen_at)}`}`;
  } else {
    lastSeenEl.textContent = `${createdLabel} · Jamais connecté`;
  }

  // ---- Description ----
  renderDescription(isOwn);

  // ---- Amis (bouton + liste de noms) ----
  if (!isOwn) {
    await renderFriendAction();
  }
  await renderFriendsList(isOwn, settings);

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
      <textarea id="description-input" class="input" rows="3" maxlength="300" placeholder="Parle un peu de toi… (300 caractères max)">${escapeHtml(profile.description || "")}</textarea>
      <p class="hint-text" id="description-count" style="margin-top:2px"></p>
      <button id="description-save-btn" class="btn-outline" style="margin-top:6px">Enregistrer</button>
    `;
    const input = document.getElementById("description-input");
    const countEl = document.getElementById("description-count");
    const updateCount = () => (countEl.textContent = `${input.value.length}/300`);
    input.addEventListener("input", updateCount);
    updateCount();

    document.getElementById("description-save-btn").addEventListener("click", async () => {
      const value = input.value.trim().slice(0, 300);
      if (await containsBannedWord(value)) {
        alert("Cette description contient un mot interdit.");
        return;
      }
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
      renderFriendsList(false, profile.settings || {});
    });
    return;
  }

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
      renderFriendsList(false, profile.settings || {});
    });
    document.getElementById("friend-decline-btn").addEventListener("click", async () => {
      await supabase.from("friends").delete().eq("id", rel.id);
      renderFriendAction();
    });
  }
}

async function renderFriendsList(isOwn, settings) {
  let slot = document.getElementById("friends-list-slot");
  if (!slot) {
    slot = document.createElement("div");
    slot.id = "friends-list-slot";
    document.getElementById("description-slot").insertAdjacentElement("afterend", slot);
  }

  const canSeeList = isOwn || !settings.friends_private;
  if (!canSeeList) {
    slot.innerHTML = `<p class="hint-text" style="margin-top:10px">Liste d'amis privée.</p>`;
    return;
  }

  const { data } = await supabase
    .from("friends")
    .select(
      "requester_id, addressee_id, req:requester_id (username, pfp_url), add:addressee_id (username, pfp_url)"
    )
    .eq("status", "accepted")
    .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`);

  const friendsList = (data || [])
    .map((r) => (r.requester_id === profile.id ? r.add : r.req))
    .filter(Boolean);

  if (friendsList.length === 0) {
    slot.innerHTML = `<p class="hint-text" style="margin-top:10px">Aucun ami pour le moment.</p>`;
    return;
  }

  slot.innerHTML = `<p class="hint-text" style="margin-top:14px;margin-bottom:6px">Amis</p><div id="friend-grid-slot"></div>`;
  renderFriendGrid(document.getElementById("friend-grid-slot"), friendsList, false);
}

function renderFriendGrid(grid, friendsList, expanded) {
  const PER_ROW = 5;
  const LIMIT = expanded ? friendsList.length : PER_ROW * 2 - 1; // 2 rangées, la dernière case = "voir plus"

  const shown = friendsList.slice(0, LIMIT);
  const remaining = friendsList.length - shown.length;

  grid.className = "friend-grid";
  grid.innerHTML =
    shown
      .map(
        (f) => `
      <a href="profile.html?user=${encodeURIComponent(f.username)}" class="friend-avatar-link" title="${escapeHtml(f.username)}">
        ${avatarImgHtml(f.username, f.pfp_url, 60, "")}
      </a>
    `
      )
      .join("") +
    (remaining > 0
      ? `<div class="badge-more" id="friends-more-btn" style="aspect-ratio:1">
          <span>Voir plus !</span><span>+${remaining}</span>
        </div>`
      : "");

  const moreBtn = document.getElementById("friends-more-btn");
  if (moreBtn) moreBtn.addEventListener("click", () => renderFriendGrid(grid, friendsList, true));
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

  // Les badges décernés par un admin passent toujours en premier
  const allBadges = [...awardedBadges, ...autoBadges];

  if (allBadges.length === 0) {
    grid.innerHTML = `<p class="muted" style="grid-column:1/-1">Aucun badge pour le moment.</p>`;
    return;
  }

  renderBadgeGrid(grid, allBadges, false);
}

function badgeTile(b) {
  return `
    <div class="badge-item">
      <img src="${badgeImagePath(b.code)}" alt="${escapeHtml(b.name)}" title="${escapeHtml(b.name)}" />
      <span>${escapeHtml(b.name)}</span>
    </div>
  `;
}

function renderBadgeGrid(grid, allBadges, expanded) {
  const LIMIT = 5;
  if (!expanded && allBadges.length > LIMIT) {
    const shown = allBadges.slice(0, LIMIT - 1);
    const remaining = allBadges.length - shown.length;
    grid.innerHTML =
      shown.map(badgeTile).join("") +
      `<div class="badge-more" id="badge-more-btn"><span>Voir plus !</span><span>+${remaining}</span></div>`;
    document.getElementById("badge-more-btn").addEventListener("click", () => renderBadgeGrid(grid, allBadges, true));
  } else {
    // Vue étendue : liste simple, pas une grille complète
    grid.innerHTML = `<div style="grid-column:1/-1" class="stack">${allBadges
      .map(
        (b) =>
          `<div style="display:flex;align-items:center;gap:10px">
            <img src="${badgeImagePath(b.code)}" alt="" style="width:32px;height:32px;object-fit:contain" />
            <span style="font-size:13px">${escapeHtml(b.name)}</span>
          </div>`
      )
      .join("")}</div>`;
  }
}

async function renderPosts() {
  const slot = document.getElementById("posts-slot");
  const { data } = await supabase
    .from("posts")
    .select(
      "id, title, body, is_anonymous, is_official, is_pinned, admin_boosted, score, image_url, image_status, category_id, hashtags, created_at, author_id, profiles:author_id (username, role, likes_received, posts_count, pfp_url), categories:category_id (name, slug)"
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
