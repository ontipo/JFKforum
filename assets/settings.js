import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";

renderNavbar();

const TOGGLES = [
  { key: "google_translate", label: "Activer Google Traduction sur le site" },
  { key: "public_email", label: "Rendre mon adresse e-mail publique" },
  { key: "receive_emails", label: "Recevoir des e-mails du site" },
  { key: "accept_tags", label: "Accepter que tout le monde me mentionne (sinon, la mention disparaît)" },
  { key: "friends_private", label: "Rendre ma liste d'amis privée" },
  { key: "decline_friend_requests", label: "Refuser les demandes d'amitié" },
  { key: "hide_last_seen", label: "Cacher ma dernière connexion / mon statut en ligne" },
  { key: "show_kc_balance", label: "Rendre mon solde de K$ visible publiquement" },
  { key: "show_age_verified", label: "Rendre mon statut de vérification d'âge visible publiquement" }
];

const DEFAULT_SETTINGS = {
  google_translate: false,
  public_email: false,
  receive_emails: true,
  accept_tags: true,
  friends_private: false,
  decline_friend_requests: false,
  hide_last_seen: false,
  show_kc_balance: false,
  show_age_verified: false,
  blur_18plus_content: false
};

let userId = null;
let ageVerified = false;
let settings = { ...DEFAULT_SETTINGS };

async function init() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    window.location.href = "login.html";
    return;
  }
  userId = session.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings, age_verified")
    .eq("id", userId)
    .single();
  settings = { ...DEFAULT_SETTINGS, ...(profile?.settings || {}) };
  ageVerified = !!profile?.age_verified;

  render();
}

function render() {
  const list = document.getElementById("settings-list");
  const rows = [...TOGGLES];
  if (ageVerified) {
    rows.push({
      key: "blur_18plus_content",
      label: "Avertissement sur les contenus 18 ans et plus (floute l'image jusqu'à ce que je clique)"
    });
  }

  list.innerHTML = rows.map(
    (t) => `
    <div class="settings-row">
      <span>${t.label}</span>
      <label class="toggle">
        <input type="checkbox" data-key="${t.key}" ${settings[t.key] ? "checked" : ""} />
        <span class="toggle-track"></span>
      </label>
    </div>
  `
  ).join("");

  list.querySelectorAll("input[data-key]").forEach((input) => {
    input.addEventListener("change", async () => {
      settings[input.dataset.key] = input.checked;
      await supabase.from("profiles").update({ settings }).eq("id", userId);
      const msg = document.getElementById("saved-msg");
      msg.classList.remove("hidden");
      setTimeout(() => msg.classList.add("hidden"), 1500);
    });
  });
}

init();
