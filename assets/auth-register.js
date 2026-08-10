import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { generateRecoveryCode } from "./utils.js";
import { sha256Hex } from "./hash.js";
import { downloadRecoveryPdf } from "./recoveryPdf.js";

renderNavbar();

const form = document.getElementById("register-form");
const usernameInput = document.getElementById("reg-username");
const emailInput = document.getElementById("reg-email");
const passwordInput = document.getElementById("reg-password");
const errorEl = document.getElementById("reg-error");
const submitBtn = document.getElementById("reg-submit");

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

  if (!username.startsWith("!") || username.length < 2) {
    showError("Le nom d'utilisateur doit commencer par « ! ».");
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

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });

  if (signUpError) {
    resetSubmit();
    showError(signUpError.message);
    return;
  }

  const userId = signUpData.user?.id;
  if (!userId) {
    resetSubmit();
    showError("Confirmez votre adresse e-mail puis reconnectez-vous pour terminer l'inscription.");
    return;
  }

  const code = generateRecoveryCode();
  const codeHash = await sha256Hex(code);

const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: { username, recovery_code_hash: codeHash }
  }
});

  resetSubmit();

  if (profileError) {
    showError(profileError.message);
    return;
  }

  await downloadRecoveryPdf(username, code);

  form.classList.add("hidden");
  document.getElementById("register-done").classList.remove("hidden");
  setTimeout(() => (window.location.href = "/"), 2500);
});

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function resetSubmit() {
  submitBtn.disabled = false;
  submitBtn.textContent = "Créer mon compte et télécharger mon code";
}
