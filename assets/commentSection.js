import { supabase } from "./supabaseClient.js";
import { containsLink, timeAgo, escapeHtml } from "./utils.js";
import { userBadgeHtml } from "./userBadge.js";

export async function mountCommentSection(container, { postId, postAuthorId, currentUserId, currentProfile, onCountChange }) {
  container.innerHTML = `
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
  `;

  const list = container.querySelector("#comments-list");
  const form = container.querySelector("#comment-form");
  const input = container.querySelector("#comment-input");
  const anonCheckbox = container.querySelector("#comment-anon");
  const errorEl = container.querySelector("#comment-error");

  async function load() {
    const { data } = await supabase
      .from("comments")
      .select("id, body, is_anonymous, created_at, author_id, profiles:author_id (username, role, likes_received)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    onCountChange?.(data?.length || 0);
    list.innerHTML = (data || []).map((c) => renderComment(c)).join("");
  }

  function renderComment(c) {
    const isMod = ["moderator", "owner"].includes(currentProfile?.role);
    const isAuthorReply = c.author_id === postAuthorId;
    const displayName = c.is_anonymous
      ? isMod
        ? `Anonyme (@${c.profiles?.username})`
        : "Anonyme"
      : c.profiles?.username;

    const nameHtml = c.is_anonymous
      ? `<span class="name">${escapeHtml(displayName)}</span>`
      : userBadgeHtml({ username: displayName, role: c.profiles?.role, likesReceived: c.profiles?.likes_received });

    return `
      <div class="comment-item">
        <div class="comment-avatar">${escapeHtml((displayName || "?")[0] || "?").toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="comment-body-row">
            ${nameHtml}
            ${isAuthorReply ? '<span class="au-tag">AU</span>' : ""}
            <span class="post-time">${timeAgo(c.created_at)}</span>
          </div>
          <p class="comment-text">${escapeHtml(c.body)}</p>
        </div>
      </div>
    `;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");

    if (!currentUserId) {
      window.location.href = "/login.html";
      return;
    }
    const body = input.value.trim();
    if (!body) return;
    if (containsLink(body)) {
      errorEl.textContent = "Les liens ne sont pas autorisés dans les commentaires.";
      errorEl.classList.remove("hidden");
      return;
    }

    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      author_id: currentUserId,
      body,
      is_anonymous: anonCheckbox.checked
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }

    input.value = "";
    anonCheckbox.checked = false;
    load();
  });

  await load();
}
