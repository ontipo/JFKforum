import { supabase } from "./supabaseClient.js";
import { escapeHtml } from "./utils.js";

// Branche l'autocomplétion "@!pseudo" sur un <textarea> : tape @!k -> affiche
// les 3 utilisateurs dont le pseudo se rapproche le plus.
export function attachMentionAutocomplete(textarea) {
  const dropdown = document.createElement("div");
  dropdown.className = "mention-dropdown hidden";
  textarea.insertAdjacentElement("afterend", dropdown);

  let currentMatchStart = -1;

  textarea.addEventListener("input", async () => {
    const cursor = textarea.selectionStart;
    const textBeforeCursor = textarea.value.slice(0, cursor);
    const match = textBeforeCursor.match(/@!([a-zA-Z0-9_]*)$/);

    if (!match) {
      dropdown.classList.add("hidden");
      return;
    }

    currentMatchStart = match.index;
    const query = match[1];
    if (query.length === 0) {
      dropdown.classList.add("hidden");
      return;
    }

    const results = await findClosestUsernames(query);
    if (results.length === 0) {
      dropdown.classList.add("hidden");
      return;
    }

    dropdown.innerHTML = results
      .map((u) => `<button type="button" class="mention-option" data-username="${escapeHtml(u)}">${escapeHtml(u)}</button>`)
      .join("");
    dropdown.classList.remove("hidden");

    dropdown.querySelectorAll(".mention-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const username = btn.dataset.username;
        const before = textarea.value.slice(0, currentMatchStart);
        const after = textarea.value.slice(cursor);
        textarea.value = `${before}${username} ${after}`;
        dropdown.classList.add("hidden");
        textarea.focus();
      });
    });
  });

  textarea.addEventListener("blur", () => {
    // Laisse le temps au clic sur une option de se déclencher avant de fermer.
    setTimeout(() => dropdown.classList.add("hidden"), 150);
  });
}

async function findClosestUsernames(query) {
  const clean = query.replace(/^!/, "");

  const { data } = await supabase
    .from("profiles")
    .select("username")
    .ilike("username", `!%${clean}%`)
    .limit(15);

  const usernames = (data || []).map((u) => u.username);
  if (usernames.length === 0) return [];

  const scored = usernames.map((u) => ({ u, score: similarityScore(u.slice(1).toLowerCase(), clean.toLowerCase()) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.u);
}

// Score simple : correspondance de préfixe > sous-chaîne, pondéré par la proximité de longueur.
function similarityScore(username, query) {
  let score = 0;
  if (username.startsWith(query)) score += 100;
  else if (username.includes(query)) score += 50;
  score -= Math.abs(username.length - query.length);
  return score;
}
