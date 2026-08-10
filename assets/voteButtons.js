import { supabase } from "./supabaseClient.js";

export async function mountVoteButtons(container, { postId, authorId, currentUserId }) {
  const isOwnPost = currentUserId && currentUserId === authorId;
  let counts = { like: 0, dislike: 0, superlike: 0 };
  let myVote = null;
  let busy = false;

  async function loadVotes() {
    const { data } = await supabase.from("votes").select("type,user_id").eq("post_id", postId);
    counts = { like: 0, dislike: 0, superlike: 0 };
    myVote = null;
    (data || []).forEach((v) => {
      counts[v.type]++;
      if (v.user_id === currentUserId) myVote = v.type;
    });
    render();
  }

  function render() {
    const score = counts.superlike * 3 + counts.like - counts.dislike;
    container.innerHTML = `
      <div class="vote-group">
        ${voteBtn("superlike", "★", counts.superlike, "Super j'aime (compte pour 3)")}
        ${voteBtn("like", "▲", counts.like, "J'aime")}
        ${voteBtn("dislike", "▼", counts.dislike, "Je n'aime pas")}
        <span class="vote-score">score ${score}</span>
      </div>
    `;
    container.querySelectorAll("[data-vote-type]").forEach((btn) => {
      btn.addEventListener("click", () => vote(btn.dataset.voteType));
    });
  }

  function voteBtn(type, symbol, count, label) {
    const active = myVote === type ? "active" : "";
    const disabledAttr = isOwnPost ? "disabled" : "";
    const title = isOwnPost ? "Vous ne pouvez pas voter pour votre propre publication" : label;
    return `<button class="vote-btn ${active}" data-vote-type="${type}" title="${title}" ${disabledAttr}>
      <span>${symbol}</span><span>${count}</span>
    </button>`;
  }

  async function vote(type) {
    if (!currentUserId) {
      window.location.href = "login.html";
      return;
    }
    if (isOwnPost || busy) return;
    busy = true;

    await supabase.from("votes").delete().eq("post_id", postId).eq("user_id", currentUserId);
    if (myVote !== type) {
      await supabase.from("votes").insert({ post_id: postId, user_id: currentUserId, type });
    }
    await loadVotes();
    busy = false;
  }

  await loadVotes();
}
