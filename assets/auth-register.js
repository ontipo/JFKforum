import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { generateRecoveryCode, containsBannedWord } from "./utils.js";
import { sha256Hex } from "./hash.js";
import { presentRecoveryChoice } from "./recoveryChoice.js";
import { setOgTags } from "./og.js";

renderNavbar();

const form = document.getElementById("register-form");
const usernameInput = document.getElementById("reg-username");
const emailInput = document.getElementById("reg-email");
const passwordInput = document.getElementById("reg-password");
const errorEl = document.getElementById("reg-error");
const submitBtn = document.getElementById("reg-submit");

// ------------------------------------------------------------
// Bannière de parrainage (?sponsor=CODE dans l'URL)
// ------------------------------------------------------------
const sponsorCode = new URLSearchParams(window.location.search).get("sponsor");

async function showSponsorBanner() {
  if (!sponsorCode) return;
  const { data } = await supabase.from("profiles").select("username").eq("sponsor_code", sponsorCode).single();
  if (!data) return;

  document.getElementById("sponsor-text").textContent =
    `Vous avez été invité(e) à rejoindre JFKforum par l'utilisateur ${data.username}, et c'est pourquoi vous avez ce lien de parrainage. Créez votre compte dès maintenant pour profiter des avantages que vous pourriez avoir.`;
  document.getElementById("sponsor-banner").classList.remove("hidden");

  setOgTags({
    title: `JFKforum - Parrainage de ${data.username}`,
    description: `Rejoins JFKforum grâce au lien de parrainage de ${data.username}.`,
    url: window.location.href
  });
}
showSponsorBanner();

usernameInput.addEventListener("input", () => {
  if (!usernameInput.value.startsWith("!")) {
    usernameInput.value = "!" + usernameInput.value.replace(/^!*/, "");
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");

  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const birthdate = document.getElementById("reg-birthdate").value;

  if (!username.startsWith("!") || username.length < 3) {
    showError("Le nom d'utilisateur doit commencer par « ! » et faire au moins 3 caractères.");
    return;
  }
  if (await containsBannedWord(username)) {
    showError("Ce nom d'utilisateur contient un mot interdit.");
    return;
  }
  if (password.length < 8) {
    showError("Le mot de passe doit contenir au moins 8 caractères.");
    return;
  }
  if (!document.getElementById("reg-tos").checked) {
    showError("Vous devez accepter les conditions d'utilisation pour vous inscrire.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Création…";

  // Le code est généré AVANT signUp, pour qu'il soit envoyé dans les métadonnées
  // et récupéré par le trigger SQL "handle_new_user" (voir supabase/schema.sql).
  const code = generateRecoveryCode();
  const codeHash = await sha256Hex(code);

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        recovery_code_hash: codeHash,
        birthdate: birthdate || null,
        referred_by_code: sponsorCode || null
      }
    }
  });

  resetSubmit();

  if (signUpError) {
    showError(signUpError.message);
    return;
  }

  form.classList.add("hidden");
  const choiceBox = document.getElementById("recovery-choice-box");
  choiceBox.classList.remove("hidden");
  await presentRecoveryChoice(choiceBox, username, code);

  choiceBox.classList.add("hidden");
  document.getElementById("register-done").classList.remove("hidden");
});

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function resetSubmit() {
  submitBtn.disabled = false;
  submitBtn.textContent = "Créer mon compte";
}
