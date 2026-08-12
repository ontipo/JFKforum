import { supabase } from "./supabaseClient.js";
import { containsLink, timeAgo, escapeHtml, maskIp, avatarImgHtml, isWithinMinutes } from "./utils.js";
import { userBadgeHtml } from "./userBadge.js";
import { getIpIdentity } from "./ipIdentity.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const AUTO_VISIBLE_DEPTH = 2;

export async function mountCommentSection(container, { postId, postAuthorId, currentUserId, currentProfile, onCountChange, mode = "full" }) {
  const expandedIds = new Set();
  const ipIdentity = !currentUserId ? getIpIdentity() : null;
  const canReply = !!currentUserId || !!ipIdentity;
  const isStaff = ["moderator", "owner"].includes(currentProfile?.role);
  let allComments = [];

  container.innerHTML =
    mode === "full"
      ? `
    <div class="comments-section">
      <div id="comments-list" class="stack"></div>
      <form id="comment-form" class="comment-form">
        <textarea id="comment-input" class="input" rows="2" placeholder="${
          canReply ? "Écrire une réponse…" : "Connectez-vous pour répondre"
        }" ${canReply ? "" : "disabled"}></textarea>
        <p id="comment-error" class="error-text hidden"></p>
        <div class="comment-form-footer">
          <label class="checkbox-label">
            <input type="checkbox" id="comment-anon" ${currentUserId ? "" : "disabled"} />
            Publier anonymement
          </label>
          <button type="submit" class="btn-outline" ${canReply ? "" : "disabled"}>Répondre</button>
        </div>
      </form>
    </div>
  `
      : `<div class="comments-section" id="comments-list"></div>`;

  const list = container.querySelector("#comments-list");

  async function load() {
    const { data } = await supabase
      .from("comments")
      .select(
        "id, body, is_anonymous, is_edited, created_at, author_id, ip_author_id, parent_comment_id, profiles:author_id (username, role, likes_received, posts_count, pfp_url), ip_profiles:ip_author_id (ip)"
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
    const topLevel = childrenOf(null);
    if (mode === "preview") {
      list.innerHTML = topLevel.map((c) => renderCommentHtml(c, 1, false)).join("");
      return;
    }
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

  function displayNameFor(c) {
    if (c.ip_author_id) return `!p${maskIp(c.ip_profiles?.ip || "")}`;
    const isMod = ["moderator", "owner"].includes(currentProfile?.role);
    return c.is_anonymous ? (isMod ? `Anonyme (@${c.profiles?.username})` : "Anonyme") : c.profiles?.username;
  }

  function renderCommentHtml(c, depth, interactive, childrenHtml = "") {
    const isAuthorReply = c.author_id && c.author_id === postAuthorId;
    const displayName = displayNameFor(c);
    const isOwnComment = currentUserId && c.author_id === currentUserId;
    const showRealAvatar = !c.is_anonymous && !c.ip_author_id;

    const nameHtml =
      c.ip_author_id || c.is_anonymous
        ? `<span class="name">${escapeHtml(displayName)}</span>`
        : userBadgeHtml({
            username: displayName,
            role: c.profiles?.role,
            likesReceived: c.profiles?.likes_received,
            postsCount: c.profiles?.posts_count
          });

    const avatarInner = c.ip_author_id
      ? "📶"
      : showRealAvatar
      ? avatarImgHtml(c.profiles?.username, c.profiles?.pfp_url, 28)
      : escapeHtml((displayName || "?")[0] || "?").toUpperCase();

    const avatarHtml = showRealAvatar
      ? `<a href="profile.html?user=${encodeURIComponent(c.profiles?.username || "")}" class="avatar-link" onclick="event.stopPropagation()"><div class="comment-avatar">${avatarInner}</div></a>`
      : `<div class="comment-avatar">${avatarInner}</div>`;

    const replyToggle = interactive && canReply ? `<button class="reply-toggle" data-reply-to="${c.id}">Répondre</button>` : "";
    const replyFormSlot = interactive ? `<div class="reply-form-slot" data-reply-form-for="${c.id}"></div>` : "";

    const canEdit = interactive && isOwnComment && isWithinMinutes(c.created_at, 15);
    const canDeleteSelf = interactive && isOwnComment && isWithinMinutes(c.created_at, 5);
    const canDeleteStaff = interactive && isStaff && !isOwnComment;

    const editBtn = canEdit ? `<button class="reply-toggle" data-edit="${c.id}">Modifier</button>` : "";
    const deleteBtn =
      canDeleteSelf || canDeleteStaff
        ? `<button class="reply-toggle" data-delete="${c.id}" style="color:#f87171">Supprimer</button>`
        : "";

    return `
      <div class="comment-item" style="margin-left:${Math.min(depth - 1, 6) * 20}px" data-comment-id="${c.id}">
        ${avatarHtml}
        <div style="flex:1;min-width:0">
          <div class="comment-body-row">
            ${nameHtml}
            ${isAuthorReply ? '<span class="au-tag">AU</span>' : ""}
            <span class="post-time">${timeAgo(c.created_at)}${c.is_edited ? " · modifié" : ""}</span>
          </div>
          <p class="comment-text" data-comment-text>${escapeHtml(c.body)}</p>
          ${replyToggle}${editBtn}${deleteBtn}
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
              <label class="checkbox-label"><input type="checkbox" ${currentUserId ? "" : "disabled"} /> Publier anonymement</label>
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

    list.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const commentId = btn.dataset.edit;
        const item = list.querySelector(`[data-comment-id="${commentId}"]`);
        const textEl = item.querySelector("[data-comment-text]");
        const current = allComments.find((c) => c.id === commentId)?.body || "";

        textEl.innerHTML = `
          <textarea class="input edit-textarea" rows="2">${escapeHtml(current)}</textarea>
          <p class="error-text hidden" style="margin-top:4px"></p>
          <div style="display:flex;gap:8px;margin-top:6px">
            <button class="btn-outline save-edit-btn">Enregistrer</button>
            <button class="btn-outline cancel-edit-btn">Annuler</button>
          </div>
        `;

        textEl.querySelector(".cancel-edit-btn").addEventListener("click", () => render());
        textEl.querySelector(".save-edit-btn").addEventListener("click", async () => {
          const newBody = textEl.querySelector("textarea").value.trim();
          const errEl = textEl.querySelector(".error-text");
          if (!newBody) return;
          if (containsLink(newBody)) {
            errEl.textContent = "Les liens ne sont pas autorisés (sauf ceux de ontipo.github.io).";
            errEl.classList.remove("hidden");
            return;
          }
          const { error } = await supabase
            .from("comments")
            .update({ body: newBody, is_edited: true })
            .eq("id", commentId);
          if (error) {
            errEl.textContent = error.message;
            errEl.classList.remove("hidden");
            return;
          }
          load();
        });
      });
    });

    list.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Supprimer cette réponse ?")) return;
        await supabase.from("comments").delete().eq("id", btn.dataset.delete);
        load();
      });
    });
  }

  async function submitComment(rawBody, anonymous, parentId, errorEl) {
    errorEl?.classList.add("hidden");
    if (!currentUserId && !ipIdentity) {
      window.location.href = "login.html";
      return;
    }
    const body = rawBody.trim();
    if (!body) return;
    if (containsLink(body)) {
      if (errorEl) {
        errorEl.textContent = "Les liens ne sont pas autorisés (sauf ceux de ontipo.github.io).";
        errorEl.classList.remove("hidden");
      }
      return;
    }

    let error = null;

    if (currentUserId) {
      ({ error } = await supabase.from("comments").insert({
        post_id: postId,
        author_id: currentUserId,
        body,
        is_anonymous: anonymous,
        parent_comment_id: parentId || null
      }));
    } else {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/ip-comment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            ipProfileId: ipIdentity.id,
            postId,
            body,
            parentCommentId: parentId || null
          })
        });
        const json = await res.json();
        if (!res.ok) error = { message: json.error || "Erreur serveur." };
      } catch {
        error = { message: "Impossible de contacter le serveur." };
      }
    }

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
