import { supabase } from "./supabaseClient.js";
import { truncateBody, timeAgo, postShareUrl, escapeHtml, avatarImgHtml, isWithinMinutes, containsLink } from "./utils.js";
import { userBadgeHtml } from "./userBadge.js";
import { mountVoteButtons } from "./voteButtons.js";
import { mountCommentSection } from "./commentSection.js";

export function createPostCard(post, { currentUserId, currentProfile, forceExpanded = false }) {
  const mode = forceExpanded ? "full" : "preview";

  const article = document.createElement("article");
  article.className = "post-card";

  const isMod = ["moderator", "owner"].includes(currentProfile?.role);
  const isOwnPost = currentUserId && post.author_id === currentUserId;
  const displayName = post.is_anonymous
    ? isMod
      ? `Anonyme (@${post.profiles?.username})`
      : "Anonyme"
    : post.profiles?.username;

  const { preview, truncated } = truncateBody(post.body, 300);

  // ---- Filtre 18+ sur toute la publication (pas juste l'image) ----
  const gatedByPostFilter = post.is_18plus && !currentProfile?.age_verified;

  function render() {
    if (gatedByPostFilter) {
      article.innerHTML = `
        <div style="text-align:center;padding:24px">
          <p class="font-mono" style="font-size:12px;color:var(--silver-500);letter-spacing:0.04em">🔞 PUBLICATION 18 ANS ET PLUS</p>
          <p class="hint-text" style="margin-top:8px">La vérification d'âge est requise pour voir cette publication.</p>
          <a href="age-verification.html" class="btn-outline" style="display:inline-block;margin-top:10px">Vérifier mon âge</a>
        </div>
      `;
      return;
    }

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
      : `<a href="profile.html?user=${encodeURIComponent(post.profiles?.username || "")}" class="avatar-link" onclick="event.stopPropagation()"><span class="post-avatar">${avatarImgHtml(
          post.profiles?.username,
          post.profiles?.pfp_url,
          36
        )}</span></a>`;

    const hashtagsHtml =
      post.hashtags?.length > 0
        ? `<div class="hashtags">${post.hashtags.map((h) => `<span class="hashtag">#${escapeHtml(h)}</span>`).join("")}</div>`
        : "";

    const imageHtml = renderImageBlock();

    const canEdit = forceExpanded && isOwnPost && isWithinMinutes(post.created_at, 15);
    const canDeleteSelf = isOwnPost && isWithinMinutes(post.created_at, 5);
    const canDeleteStaff = isMod && !isOwnPost;

    const editBtn = canEdit ? `<button class="share-btn" id="edit-post-btn">Modifier</button>` : "";
    const deleteBtn =
      canDeleteSelf || canDeleteStaff
        ? `<button class="share-btn" id="delete-post-btn" style="color:#f87171">Supprimer</button>`
        : "";

    article.innerHTML = `
      <div class="post-head">
        <div class="post-head-left">
          ${avatarHtml}
          ${nameHtml}
          ${post.is_official ? '<span class="role-tag owner">Officiel</span>' : ""}
          ${post.is_pinned ? '<span class="role-tag">📌 Épinglé</span>' : ""}
          ${post.admin_boosted ? '<span class="role-tag owner">❤️ Aimé par un admin</span>' : ""}
          ${post.is_18plus ? '<span class="role-tag">🔞 18+</span>' : ""}
          <span class="post-time">${timeAgo(post.created_at)}${post.is_edited ? " · modifié" : ""}</span>
        </div>
        <span class="post-category-badge">${escapeHtml(post.categories?.name || "")}</span>
      </div>
      <h3 class="post-title font-display">${escapeHtml(post.title)}</h3>
      <p class="post-body" data-post-text>${escapeHtml(forceExpanded ? post.body : preview)}${
      !forceExpanded && truncated ? ' <span class="see-more">— voir plus</span>' : ""
    }</p>
      ${imageHtml}
      ${hashtagsHtml}
      <div class="post-actions">
        <div id="vote-slot"></div>
        <div class="post-actions-right">
          <span class="comment-count" id="comment-count-slot">…</span>
          ${editBtn}
          ${deleteBtn}
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

    article.querySelector("#delete-post-btn")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Supprimer définitivement cette publication ?")) return;
      const { error } = await supabase.from("posts").delete().eq("id", post.id);
      if (error) {
        alert("Échec : " + error.message);
        return;
      }
      article.remove();
    });

    article.querySelector("#edit-post-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const textEl = article.querySelector("[data-post-text]");
      textEl.innerHTML = `
        <textarea class="input" rows="5" id="edit-post-textarea">${escapeHtml(post.body)}</textarea>
        <p class="error-text hidden" id="edit-post-error" style="margin-top:4px"></p>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button class="btn-outline" id="save-post-edit-btn">Enregistrer</button>
          <button class="btn-outline" id="cancel-post-edit-btn">Annuler</button>
        </div>
      `;
      textEl.querySelector("#cancel-post-edit-btn").addEventListener("click", (ev) => {
        ev.stopPropagation();
        render();
      });
      textEl.querySelector("#save-post-edit-btn").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const newBody = textEl.querySelector("#edit-post-textarea").value.trim();
        const errEl = textEl.querySelector("#edit-post-error");
        if (newBody.length < 20) {
          errEl.textContent = "Le texte doit faire au moins 20 caractères.";
          errEl.classList.remove("hidden");
          return;
        }
        if (containsLink(newBody)) {
          errEl.textContent = "Les liens ne sont pas autorisés (sauf ceux de ontipo.github.io).";
          errEl.classList.remove("hidden");
          return;
        }
        const { error } = await supabase.from("posts").update({ body: newBody, is_edited: true }).eq("id", post.id);
        if (error) {
          errEl.textContent = error.message;
          errEl.classList.remove("hidden");
          return;
        }
        post.body = newBody;
        post.is_edited = true;
        render();
      });
    });

    if (mode === "full") {
      mountCommentSection(article.querySelector("#comments-slot"), {
        postId: post.id,
        postAuthorId: post.author_id,
        currentUserId,
        currentProfile,
        mode: "full",
        onCountChange: (n) => {
          const slot = article.querySelector("#comment-count-slot");
          if (slot) slot.textContent = `${n} réponse${n === 1 ? "" : "s"}`;
        }
      });
    } else {
      mountCommentSection(article.querySelector("#comments-slot"), {
        postId: post.id,
        postAuthorId: post.author_id,
        currentUserId,
        currentProfile,
        mode: "preview"
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
      if (!currentProfile?.age_verified) {
        return `<a href="age-verification.html" class="post-image-placeholder post-image-18" onclick="event.stopPropagation()">
          🔞 Contenu 18+ — vérification d'âge requise (cliquer pour vérifier)
        </a>`;
      }
      if (currentProfile?.settings?.blur_18plus_content) {
        return `
          <div class="post-image-blur-wrap" id="blur-wrap">
            <img src="${post.image_url}" alt="" class="post-image blurred" />
            <button class="post-image-blur-btn" id="reveal-image-btn" onclick="event.stopPropagation()">🔞 Afficher (18+)</button>
          </div>
        `;
      }
      return `<img src="${post.image_url}" alt="" class="post-image" />`;
    }
    return "";
  }

  async function refreshCommentCount() {
    const { count } = await supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", post.id)
      .is("parent_comment_id", null);
    const slot = article.querySelector("#comment-count-slot");
    if (slot) slot.textContent = `${count ?? 0} réponse${count === 1 ? "" : "s"}`;
  }

  if (!forceExpanded && !gatedByPostFilter) {
    article.addEventListener("click", (e) => {
      if (e.target.closest("#vote-slot, #share-btn, #comments-slot, #edit-post-btn, #delete-post-btn")) return;
      window.location.href = `index.html?=${post.id}`;
    });
  }

  render();

  article.addEventListener("click", (e) => {
    if (e.target.id === "reveal-image-btn") {
      const wrap = article.querySelector("#blur-wrap");
      wrap.querySelector("img").classList.remove("blurred");
      e.target.remove();
    }
  });

  return article;
}
