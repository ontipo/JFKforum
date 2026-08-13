import { supabase } from "./supabaseClient.js";
import { escapeHtml, timeAgo, avatarImgHtml } from "./utils.js";

const EMOJIS = ["😀", "🤣", "😇", "😍", "😡", "😱", "👋🏻", "🩷"];
const MAX_LEN = 100;

// Trouve (ou crée) la conversation 1:1 avec `friendId`, puis ouvre le panneau de chat.
export async function openDirectMessage(currentUserId, friend) {
  const { data: mine } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", currentUserId);

  const myConvIds = (mine || []).map((r) => r.conversation_id);
  let conversationId = null;

  if (myConvIds.length > 0) {
    const { data: shared } = await supabase
      .from("conversation_members")
      .select("conversation_id, conversations!inner(is_group)")
      .eq("user_id", friend.id)
      .in("conversation_id", myConvIds)
      .eq("conversations.is_group", false);
    if (shared && shared.length > 0) conversationId = shared[0].conversation_id;
  }

  if (!conversationId) {
    const { data: conv, error } = await supabase
      .from("conversations")
      .insert({ is_group: false, created_by: currentUserId })
      .select("id")
      .single();
    if (error) {
      alert("Impossible d'ouvrir la conversation : " + error.message);
      return;
    }
    conversationId = conv.id;
    await supabase.from("conversation_members").insert([
      { conversation_id: conversationId, user_id: currentUserId },
      { conversation_id: conversationId, user_id: friend.id }
    ]);
  }

  openChatPanel(currentUserId, conversationId, friend.username);
}

// Crée un groupe avec les amis sélectionnés puis ouvre le panneau.
export async function createGroupChat(currentUserId, name, memberIds) {
  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ is_group: true, name, created_by: currentUserId })
    .select("id")
    .single();
  if (error) {
    alert("Impossible de créer le groupe : " + error.message);
    return;
  }
  const rows = [currentUserId, ...memberIds].map((user_id) => ({ conversation_id: conv.id, user_id }));
  await supabase.from("conversation_members").insert(rows);
  openChatPanel(currentUserId, conv.id, name);
}

function openChatPanel(currentUserId, conversationId, title) {
  document.getElementById("chat-panel")?.remove();

  const panel = document.createElement("div");
  panel.id = "chat-panel";
  panel.className = "modal-overlay";
  panel.innerHTML = `
    <div class="modal-box" style="max-width:420px;height:70vh;display:flex;flex-direction:column">
      <div class="modal-head">
        <h2 class="font-display">${escapeHtml(title)}</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="chat-settings-btn" class="modal-close" title="Paramètres">⚙</button>
          <button id="chat-close-btn" class="modal-close">Fermer</button>
        </div>
      </div>
      <div id="chat-settings-menu" class="hidden" style="background:var(--raised);border:1px solid var(--line);border-radius:10px;padding:8px;margin-bottom:8px">
        <button id="chat-delete-history-btn" class="btn-outline" style="width:100%;color:#f87171">Supprimer l'historique</button>
      </div>
      <div id="chat-messages" class="stack" style="flex:1;overflow-y:auto;padding-right:4px"></div>
      <form id="chat-form" style="margin-top:10px">
        <div style="display:flex;gap:6px;margin-bottom:6px" id="chat-emoji-row">
          ${EMOJIS.map((e) => `<button type="button" class="emoji-btn" data-emoji="${e}">${e}</button>`).join("")}
        </div>
        <div style="display:flex;gap:8px">
          <input id="chat-input" class="input" maxlength="${MAX_LEN}" placeholder="Écrire un message… (100 caractères max)" />
          <button type="submit" class="btn-outline" style="flex-shrink:0">Envoyer</button>
        </div>
        <p class="hint-text" style="margin-top:4px">Messagerie 100% privée — AUCUNE MODÉRATION du contenu ici.</p>
      </form>
    </div>
  `;
  document.body.appendChild(panel);

  panel.addEventListener("click", (e) => {
    if (e.target === panel) panel.remove();
  });
  panel.querySelector("#chat-close-btn").addEventListener("click", () => panel.remove());

  panel.querySelector("#chat-settings-btn").addEventListener("click", () => {
    panel.querySelector("#chat-settings-menu").classList.toggle("hidden");
  });

  panel.querySelector("#chat-delete-history-btn").addEventListener("click", async () => {
    if (!confirm("Supprimer définitivement tout l'historique de cette conversation (pour tout le monde) ?")) return;
    await supabase.from("messages").delete().eq("conversation_id", conversationId);
    loadMessages();
  });

  panel.querySelectorAll(".emoji-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = panel.querySelector("#chat-input");
      if (input.value.length + btn.dataset.emoji.length <= MAX_LEN) {
        input.value += btn.dataset.emoji;
      }
    });
  });

  const messagesList = panel.querySelector("#chat-messages");

  async function loadMessages() {
    const { data } = await supabase
      .from("messages")
      .select("id, body, sender_id, created_at, profiles:sender_id (username)")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    messagesList.innerHTML = (data || [])
      .map((m) => {
        const isMine = m.sender_id === currentUserId;
        return `
          <div style="align-self:${isMine ? "flex-end" : "flex-start"};max-width:80%">
            <div style="background:${isMine ? "var(--raised)" : "var(--surface)"};border:1px solid var(--line);border-radius:12px;padding:8px 12px;font-size:14px">
              ${!isMine ? `<div class="hint-text" style="margin-bottom:2px">${escapeHtml(m.profiles?.username || "?")}</div>` : ""}
              ${escapeHtml(m.body)}
            </div>
            <div class="hint-text" style="text-align:${isMine ? "right" : "left"};margin-top:2px">${timeAgo(m.created_at)}</div>
          </div>
        `;
      })
      .join("");
    messagesList.style.display = "flex";
    messagesList.style.flexDirection = "column";
    messagesList.style.gap = "8px";
    messagesList.scrollTop = messagesList.scrollHeight;
  }

  panel.querySelector("#chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = panel.querySelector("#chat-input");
    const body = input.value.trim();
    if (!body) return;
    const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: currentUserId, body });
    if (error) {
      alert("Échec de l'envoi : " + error.message);
      return;
    }
    input.value = "";
    loadMessages();
  });

  loadMessages();
}
