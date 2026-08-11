import { supabase } from "./supabaseClient.js";
import { truncateBody, timeAgo, postShareUrl, escapeHtml } from "./utils.js";
import { userBadgeHtml } from "./userBadge.js";
import { mountVoteButtons } from "./voteButtons.js";
import { mountCommentSection } from "./commentSection.js";

export function createPostCard(post, { currentUserId, currentProfile, forceExpanded = false }) {
  let expanded = forceExpanded;

  const article = document.createElement("article");
  article.className = "post-card";

  const isMod = ["moderator", "owner"].includes(currentProfile?.role);
  const displayName = post.is_anonymous
    ? isMod
      ? `Anonyme (@${post.profiles?.username})`
      : "Anonyme"
    : post.profiles?.username;

  const { preview, truncated } = truncateBody(post.body, 300);

  function render() {
    const nameHtml = post.is_anonymous
      ? `<span class="name">${escapeHtml(displayName)}</span>`
      : userBadgeHtml({
          username: displayName,
          role: post.profiles?.role,
          likesReceived: post.profiles?.likes_received,
          postsCount: post.profiles?.posts_count
        });

    const avatarHtml = post.is_anonymous
      ? `<span class="post-avatar">?</span>`
      : `<a href="profile.html?user=${encodeURIComponent(post.profiles?.username || "")}" class="avatar-link" onclick="event.stopPropagation()"><span class="post-avatar">${
          post.profiles?.pfp_url
            ? `<img src="${post.profiles.pfp_url}" alt="" width="36" height="36" />`
            : escapeHtml((post.profiles?.username?.[1] || "?").toUpperCase())
        }</span></a>`;

    const hashtagsHtml =
      post.hashtags?.length > 0
        ? `<div class="hashtags">${post.hashtags.map((h) => `<span class="hashtag">#${escapeHtml(h)}</span>`).join("")}</div>`
        : "";

    const imageHtml = renderImageBlock();

    article.innerHTML = `
      <div class="post-head">
        <div class="post-head-left">
          ${avatarHtml}
          ${nameHtml}
          ${post.is_official ? '<span class="role-tag owner">Officiel</span>' : ""}
          ${post.is_pinned ? '<span class="role-tag">📌 Épinglé</span>' : ""}
          <span class="post-time">${timeAgo(post.created_at)}</span>
        </div>
        <span class="post-category-badge">${escapeHtml(post.categories?.name || "")}</span>
      </div>
      <h3 class="post-title font-display">${escapeHtml(post.title)}</h3>
      <p class="post-body">${escapeHtml(expanded ? post.body : preview)}${
      !expanded && truncated ? ' <span class="see-more">— voir plus</span>' : ""
    }</p>
      ${imageHtml}
      ${hashtagsHtml}
      <div class="post-actions">
        <div id="vote-slot"></div>
        <div class="post-actions-right">
          <span class="comment-count" id="comment-count-slot">…</span>
          <button class="share-btn" id="share-btn">Partager</button>
        </div>
      </div>
      <div id="comments-slot"></div>
    `;

    mountVoteButtons(article.querySelector("#vote-slot"), {
      postId: post.id,
      authorId: post.author_id,
      currentUserId
    });

    refreshCommentCount();

    article.querySelector("#share-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!currentUserId) {
        window.location.href = "login.html";
        return;
      }
      navigator.clipboard.writeText(postShareUrl(post.id));
      const btn = e.currentTarget;
      const original = btn.textContent;
      btn.textContent = "Lien copié";
      setTimeout(() => (btn.textContent = original), 1500);
    });

    if (expanded) {
      mountCommentSection(article.querySelector("#comments-slot"), {
        postId: post.id,
        postAuthorId: post.author_id,
        currentUserId,
        currentProfile,
        onCountChange: (n) => {
          const slot = article.querySelector("#comment-count-slot");
          if (slot) slot.textContent = `${n} réponse${n === 1 ? "" : "s"}`;
        }
      });
    }
  }

  function renderImageBlock() {
    if (post.image_status === "pending") {
      return `<div class="post-image-placeholder">VÉRIFICATION EN COURS D'APPROBATION</div>`;
    }
    if (post.image_status === "approved") {
      return `<img src="${post.image_url}" alt="" class="post-image" />`;
    }
    if (post.image_status === "18+") {
      if (currentProfile?.age_verified) {
        return `<img src="${post.image_url}" alt="" class="post-image" />`;
      }
      return `<a href="age-verification.html" class="post-image-placeholder post-image-18" onclick="event.stopPropagation()">
        🔞 Contenu 18+ — vérification d'âge requise (cliquer pour vérifier)
      </a>`;
    }
    return "";
  }

  async function refreshCommentCount() {
    const { count } = await supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", post.id);
    const slot = article.querySelector("#comment-count-slot");
    if (slot) slot.textContent = `${count ?? 0} réponse${count === 1 ? "" : "s"}`;
  }

  if (!forceExpanded) {
    article.addEventListener("click", (e) => {
      if (e.target.closest("#vote-slot, #share-btn, #comments-slot")) return;
      expanded = !expanded;
      render();
    });
  }

  render();
  return article;
}
