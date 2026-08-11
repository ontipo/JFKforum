import { supabase } from "./supabaseClient.js";
import { containsLink, timeAgo, escapeHtml } from "./utils.js";
import { userBadgeHtml } from "./userBadge.js";

const AUTO_VISIBLE_DEPTH = 2; // la publication elle-même = 0, ses réponses directes = 1, leurs réponses = 2

// mode "full"    -> page dédiée d'un post (index.html?=ID) : fil complet, imbrication infinie, formulaires de réponse
// mode "preview" -> carte du fil : réponses directes seulement, lecture seule, pas de formulaire
export async function mountCommentSection(container, { postId, postAuthorId, currentUserId, currentProfile, onCountChange, mode = "full" }) {
  const expandedIds = new Set();
  let allComments = [];

  container.innerHTML =
    mode === "full"
      ? `
    <div class="comments-section">
      <div id="comments-list" class="stack"></div>
      <form id="comment-form" class="comment-form">
        <textarea id="comment-input" class="input" rows="2" placeholder="${
          currentUserId ? "Écrire une réponse…" : "Connectez-vous pour répondre"
        }" ${currentUserId ? "" : "disabled"}></textarea>
        <p id="comment-error" class="error-text hidden"></p>
        <div class="comment-form-footer">
          <label class="checkbox-label">
            <input type="checkbox" id="comment-anon" ${currentUserId ? "" : "disabled"} />
            Publier anonymement
          </label>
          <button type="submit" class="btn-outline" ${currentUserId ? "" : "disabled"}>Répondre</button>
        </div>
      </form>
    </div>
  `
      : `<div class="comments-section" id="comments-list"></div>`;

  const list = mode === "full" ? container.querySelector("#comments-list") : container.querySelector("#comments-list");

  async function load() {
    const { data } = await supabase
      .from("comments")
      .select(
        "id, body, is_anonymous, created_at, author_id, parent_comment_id, profiles:author_id (username, role, likes_received, posts_count)"
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    allComments = data || [];
    onCountChange?.(allComments.filter((c) => !c.parent_comment_id).length);
    render();
  }

  function childrenOf(parentId) {
    return allComments.filter((c) => c.parent_comment_id === parentId);
  }

  function render() {
    if (mode === "preview") {
      const topLevel = childrenOf(null);
      list.innerHTML = topLevel.map((c) => renderCommentHtml(c, 1, false)).join("");
      return;
    }

    const topLevel = childrenOf(null);
    list.innerHTML = topLevel.map((c) => renderThread(c, 1)).join("");
    wireInteractions();
  }

  function renderThread(comment, depth) {
    const children = childrenOf(comment.id);
    let childrenHtml = "";

    if (children.length > 0) {
      const visible = depth < AUTO_VISIBLE_DEPTH || expandedIds.has(comment.id);
      if (visible) {
        childrenHtml = `<div class="comment-children">${children.map((c) => renderThread(c, depth + 1)).join("")}</div>`;
      } else {
        childrenHtml = `<button class="see-more-replies" data-reveal="${comment.id}">Tout voir (${children.length} réponse${children.length > 1 ? "s" : ""})</button>`;
      }
    }

    return renderCommentHtml(comment, depth, true, childrenHtml);
  }

  function renderCommentHtml(c, depth, interactive, childrenHtml = "") {
    const isMod = ["moderator", "owner"].includes(currentProfile?.role);
    const isAuthorReply = c.author_id === postAuthorId;
    const displayName = c.is_anonymous
      ? isMod
        ? `Anonyme (@${c.profiles?.username})`
        : "Anonyme"
      : c.profiles?.username;

    const nameHtml = c.is_anonymous
      ? `<span class="name">${escapeHtml(displayName)}</span>`
      : userBadgeHtml({
          username: displayName,
          role: c.profiles?.role,
          likesReceived: c.profiles?.likes_received,
          postsCount: c.profiles?.posts_count
        });

    const replyToggle = interactive && currentUserId ? `<button class="reply-toggle" data-reply-to="${c.id}">Répondre</button>` : "";
    const replyFormSlot = interactive ? `<div class="reply-form-slot" data-reply-form-for="${c.id}"></div>` : "";

    return `
      <div class="comment-item" style="margin-left:${Math.min(depth - 1, 6) * 20}px">
        <div class="comment-avatar">${escapeHtml((displayName || "?")[0] || "?").toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="comment-body-row">
            ${nameHtml}
            ${isAuthorReply ? '<span class="au-tag">AU</span>' : ""}
            <span class="post-time">${timeAgo(c.created_at)}</span>
          </div>
          <p class="comment-text">${escapeHtml(c.body)}</p>
          ${replyToggle}
          ${replyFormSlot}
          ${childrenHtml}
        </div>
      </div>
    `;
  }

  function wireInteractions() {
    list.querySelectorAll("[data-reveal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        expandedIds.add(btn.dataset.reveal);
        render();
      });
    });

    list.querySelectorAll("[data-reply-to]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const parentId = btn.dataset.replyTo;
        const slot = list.querySelector(`[data-reply-form-for="${parentId}"]`);
        if (slot.dataset.open === "true") {
          slot.innerHTML = "";
          slot.dataset.open = "false";
          return;
        }
        slot.dataset.open = "true";
        slot.innerHTML = `
          <form class="comment-form reply-inline-form" style="margin-top:8px">
            <textarea class="input" rows="2" placeholder="Écrire une réponse…"></textarea>
            <p class="error-text hidden"></p>
            <div class="comment-form-footer">
              <label class="checkbox-label"><input type="checkbox" /> Publier anonymement</label>
              <button type="submit" class="btn-outline">Répondre</button>
            </div>
          </form>
        `;
        const form = slot.querySelector("form");
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const textarea = form.querySelector("textarea");
          const errorEl = form.querySelector(".error-text");
          const anon = form.querySelector('input[type="checkbox"]').checked;
          await submitComment(textarea.value, anon, parentId, errorEl);
        });
      });
    });
  }

  async function submitComment(rawBody, anonymous, parentId, errorEl) {
    errorEl?.classList.add("hidden");
    if (!currentUserId) {
      window.location.href = "login.html";
      return;
    }
    const body = rawBody.trim();
    if (!body) return;
    if (containsLink(body)) {
      if (errorEl) {
        errorEl.textContent = "Les liens ne sont pas autorisés dans les commentaires.";
        errorEl.classList.remove("hidden");
      }
      return;
    }

    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      author_id: currentUserId,
      body,
      is_anonymous: anonymous,
      parent_comment_id: parentId || null
    });

    if (error) {
      if (errorEl) {
        errorEl.textContent = error.message;
        errorEl.classList.remove("hidden");
      }
      return;
    }

    if (parentId) expandedIds.add(parentId);
    load();
  }

  if (mode === "full") {
    const form = container.querySelector("#comment-form");
    const input = container.querySelector("#comment-input");
    const anonCheckbox = container.querySelector("#comment-anon");
    const errorEl = container.querySelector("#comment-error");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await submitComment(input.value, anonCheckbox.checked, null, errorEl);
      input.value = "";
      anonCheckbox.checked = false;
    });
  }

  await load();
}
