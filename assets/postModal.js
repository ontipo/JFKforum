import { supabase } from "./supabaseClient.js";
import { containsLink, parseHashtags, parseMentions, escapeHtml } from "./utils.js";

export function openPostModal({ categories, currentUserId, currentProfile, onCreated }) {
  const isStaff = ["moderator", "owner"].includes(currentProfile?.role);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  overlay.innerHTML = `
    <form class="modal-box" id="post-form">
      <div class="modal-head">
        <h2 class="font-display">Nouvelle publication</h2>
        <button type="button" class="modal-close" id="modal-close">Fermer</button>
      </div>

      <select id="post-category" class="input">
        ${categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
      </select>

      <input id="post-title" class="input" placeholder="Titre" />
      <textarea id="post-body" class="input" rows="6" placeholder="Votre texte… (mentionnez avec @!pseudo)"></textarea>
      <input id="post-hashtags" class="input" placeholder="#hashtags séparés par des espaces (50 max)" />
      <p id="hashtag-count" class="hint-text hidden"></p>

      <label class="checkbox-label">
        <input type="checkbox" id="post-anon" />
        Publier en tant qu'anonyme
      </label>

      ${
        isStaff
          ? `<label class="checkbox-label">
              <input type="checkbox" id="post-official" />
              Publication officielle (staff)
            </label>`
          : ""
      }

      <p id="post-error" class="error-text hidden"></p>

      <button type="submit" class="btn-primary" id="post-submit">Publier</button>
    </form>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector("#modal-close").addEventListener("click", close);

  const hashtagsInput = overlay.querySelector("#post-hashtags");
  const hashtagCountEl = overlay.querySelector("#hashtag-count");
  hashtagsInput.addEventListener("input", () => {
    const tags = parseHashtags(hashtagsInput.value);
    if (hashtagsInput.value) {
      hashtagCountEl.textContent = `${tags.length}/50 hashtags détectés`;
      hashtagCountEl.classList.remove("hidden");
    } else {
      hashtagCountEl.classList.add("hidden");
    }
  });

  const form = overlay.querySelector("#post-form");
  const errorEl = overlay.querySelector("#post-error");
  const submitBtn = overlay.querySelector("#post-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");

    const title = overlay.querySelector("#post-title").value.trim();
    const body = overlay.querySelector("#post-body").value.trim();
    const categoryId = overlay.querySelector("#post-category").value;
    const anonymous = overlay.querySelector("#post-anon").checked;
    const official = isStaff ? overlay.querySelector("#post-official")?.checked || false : false;
    const hashtags = parseHashtags(hashtagsInput.value);

    if (!title || !body) {
      errorEl.textContent = "Le titre et le texte sont obligatoires.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (containsLink(title) || containsLink(body)) {
      errorEl.textContent = "Les liens sont interdits dans les publications.";
      errorEl.classList.remove("hidden");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Publication…";

    const mentions = parseMentions(body);
    const { data, error } = await supabase
      .from("posts")
      .insert({
        title,
        body,
        author_id: currentUserId,
        is_anonymous: anonymous,
        is_official: official,
        category_id: categoryId,
        hashtags,
        mentions
      })
      .select()
      .single();

    submitBtn.disabled = false;
    submitBtn.textContent = "Publier";

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove("hidden");
      return;
    }

    onCreated?.(data);
    close();
  });
}
