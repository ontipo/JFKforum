import { supabase } from "./supabaseClient.js";
import { escapeHtml, avatarImgHtml } from "./utils.js";
import { openDirectMessage, createGroupChat } from "./messaging.js";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

export async function mountFriendsSidebar() {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) return;

  const currentUserId = session.user.id;

  const { data } = await supabase
    .from("friends")
    .select(
      "requester_id, addressee_id, req:requester_id (id, username, pfp_url, last_seen_at), add:addressee_id (id, username, pfp_url, last_seen_at)"
    )
    .eq("status", "accepted")
    .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);

  const friends = (data || [])
    .map((r) => (r.requester_id === currentUserId ? r.add : r.req))
    .filter(Boolean);

  const online = friends.filter((f) => f.last_seen_at && Date.now() - new Date(f.last_seen_at).getTime() < ONLINE_THRESHOLD_MS);
  const offline = friends.filter((f) => !online.includes(f));

  const slot = document.createElement("div");
  slot.className = "friends-sidebar";
  slot.innerHTML = `
    <div class="friends-sidebar-header">
      <p class="font-display" style="font-weight:600;font-size:14px;margin:0">Amis</p>
      <button id="new-group-btn" class="btn-outline" style="font-size:11px;padding:4px 8px">+ Groupe</button>
    </div>
    <div class="friends-sidebar-scroll">
      <p class="hint-text" style="margin:10px 0 4px">En ligne — ${online.length}</p>
      <div class="stack">${online.map((f) => friendRow(f)).join("") || `<p class="hint-text">Personne en ligne.</p>`}</div>
      <p class="hint-text" style="margin:14px 0 4px">Hors ligne — ${offline.length}</p>
      <div class="stack">${offline.map((f) => friendRow(f)).join("") || `<p class="hint-text">Aucun ami hors ligne.</p>`}</div>
    </div>
  `;
  document.body.appendChild(slot);

  slot.querySelectorAll("[data-msg-friend]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const friend = friends.find((f) => f.id === btn.dataset.msgFriend);
      if (friend) openDirectMessage(currentUserId, friend);
    });
  });

  document.getElementById("new-group-btn").addEventListener("click", () => openGroupModal(currentUserId, friends));
}

function friendRow(f) {
  return `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0">
      <a href="profile.html?user=${encodeURIComponent(f.username)}" class="avatar-link">
        <span class="post-avatar" style="width:32px;height:32px">${avatarImgHtml(f.username, f.pfp_url, 32)}</span>
      </a>
      <span style="flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(f.username)}</span>
      <button data-msg-friend="${f.id}" class="btn-outline" style="font-size:11px;padding:4px 8px;flex-shrink:0">Message</button>
    </div>
  `;
}

function openGroupModal(currentUserId, friends) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <form class="modal-box" id="group-form">
      <div class="modal-head">
        <h2 class="font-display">Nouveau groupe</h2>
        <button type="button" class="modal-close" id="group-close-btn">Fermer</button>
      </div>
      <input id="group-name-input" class="input" placeholder="Nom du groupe" />
      <p class="hint-text">Sélectionne les amis à ajouter :</p>
      <div class="stack" style="max-height:200px;overflow-y:auto">
        ${friends
          .map(
            (f) => `
          <label class="checkbox-label">
            <input type="checkbox" class="group-member-cb" value="${f.id}" /> ${escapeHtml(f.username)}
          </label>
        `
          )
          .join("")}
      </div>
      <p id="group-error" class="error-text hidden"></p>
      <button type="submit" class="btn-primary">Créer le groupe</button>
    </form>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector("#group-close-btn").addEventListener("click", () => overlay.remove());

  overlay.querySelector("#group-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = overlay.querySelector("#group-error");
    const name = overlay.querySelector("#group-name-input").value.trim();
    const memberIds = Array.from(overlay.querySelectorAll(".group-member-cb:checked")).map((cb) => cb.value);

    if (!name) {
      errorEl.textContent = "Donne un nom au groupe.";
      errorEl.classList.remove("hidden");
      return;
    }
    if (memberIds.length === 0) {
      errorEl.textContent = "Sélectionne au moins un ami.";
      errorEl.classList.remove("hidden");
      return;
    }

    overlay.remove();
    await createGroupChat(currentUserId, name, memberIds);
  });
}
