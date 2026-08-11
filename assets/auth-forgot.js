import { extractTextFromPdf, extractEmailFromPdf } from "./recoveryPdf.js";
import { renderNavbar } from "./navbar.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { presentRecoveryChoice } from "./recoveryChoice.js";

renderNavbar();

// ------------------------------------------------------------
// Flux normal : PDF de code de récupération
// ------------------------------------------------------------
const fileInput = document.getElementById("pdf-input");
const uploadStep = document.getElementById("upload-step");
const resetForm = document.getElementById("reset-form");
const fileNameEl = document.getElementById("file-name");
const newPasswordInput = document.getElementById("new-password");
const submitBtn = document.getElementById("reset-submit");
const doneEl = document.getElementById("reset-done");
const errorEl = document.getElementById("reset-error");
const recoveryChoiceBox = document.getElementById("recovery-choice-box");
const noPdfLinkWrap = document.getElementById("no-pdf-link-wrap");

let extractedCode = null;

fileInput.addEventListener("change", async () => {
  errorEl.classList.add("hidden");
  const file = fileInput.files?.[0];
  if (!file) return;

  fileNameEl.textContent = `Fichier : ${file.name}`;

  try {
    const code = await extractTextFromPdf(file);
    if (!code) {
      showError(errorEl, "Impossible de retrouver un code valide dans ce PDF.");
      return;
    }
    extractedCode = code;
    uploadStep.classList.add("hidden");
    resetForm.classList.remove("hidden");
    noPdfLinkWrap.classList.add("hidden");
  } catch {
    showError(errorEl, "Ce fichier n'a pas pu être lu.");
  }
});

resetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");

  const newPassword = newPasswordInput.value;
  if (newPassword.length < 8) {
    showError(errorEl, "Le mot de passe doit contenir au moins 8 caractères.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Réinitialisation…";

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ code: extractedCode, newPassword })
    });
    const json = await res.json();

    submitBtn.disabled = false;
    submitBtn.textContent = "Réinitialiser le mot de passe";

    if (!res.ok) {
      showError(errorEl, json.error || "Une erreur est survenue.");
      return;
    }

    await afterResetSuccess(json.username, json.newCode);
  } catch {
    submitBtn.disabled = false;
    submitBtn.textContent = "Réinitialiser le mot de passe";
    showError(errorEl, "Impossible de contacter le serveur. Réessayez plus tard.");
  }
});

async function afterResetSuccess(username, newCode) {
  resetForm.classList.add("hidden");
  document.getElementById("no-pdf-step").classList.add("hidden");
  noPdfLinkWrap.classList.add("hidden");

  if (newCode) {
    recoveryChoiceBox.classList.remove("hidden");
    await presentRecoveryChoice(recoveryChoiceBox, username, newCode);
    recoveryChoiceBox.classList.add("hidden");
  }

  doneEl.classList.remove("hidden");
  setTimeout(() => (window.location.href = "login.html"), 2000);
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

// ------------------------------------------------------------
// Flux de secours : "Je n'ai pas de PDF" (vérification par e-mail)
// ------------------------------------------------------------
const showNoPdfBtn = document.getElementById("show-no-pdf-btn");
const noPdfStep = document.getElementById("no-pdf-step");
const noPdfDoneBtn = document.getElementById("no-pdf-done-btn");
const noPdfUploadStep = document.getElementById("no-pdf-upload-step");
const noPdfInput = document.getElementById("no-pdf-input");
const noPdfUsernameInput = document.getElementById("no-pdf-username");
const noPdfPasswordInput = document.getElementById("no-pdf-new-password");
const noPdfSubmitBtn = document.getElementById("no-pdf-submit-btn");
const noPdfErrorEl = document.getElementById("no-pdf-error");

showNoPdfBtn.addEventListener("click", () => {
  noPdfStep.classList.remove("hidden");
  showNoPdfBtn.parentElement.classList.add("hidden");
});

noPdfDoneBtn.addEventListener("click", () => {
  noPdfUploadStep.classList.remove("hidden");
  noPdfDoneBtn.classList.add("hidden");
});

noPdfSubmitBtn.addEventListener("click", async () => {
  noPdfErrorEl.classList.add("hidden");

  const file = noPdfInput.files?.[0];
  const username = noPdfUsernameInput.value.trim();
  const newPassword = noPdfPasswordInput.value;

  if (!file || !username || !newPassword) {
    showError(noPdfErrorEl, "Joins le fichier, ton pseudo et un nouveau mot de passe.");
    return;
  }
  if (newPassword.length < 8) {
    showError(noPdfErrorEl, "Le mot de passe doit contenir au moins 8 caractères.");
    return;
  }

  noPdfSubmitBtn.disabled = true;
  noPdfSubmitBtn.textContent = "Vérification…";

  let claimedEmail;
  try {
    claimedEmail = await extractEmailFromPdf(file);
  } catch {
    claimedEmail = null;
  }

  if (!claimedEmail) {
    noPdfSubmitBtn.disabled = false;
    noPdfSubmitBtn.textContent = "Vérifier et réinitialiser";
    showError(noPdfErrorEl, "Aucune adresse e-mail trouvée dans le fichier. As-tu bien remplacé le texte en rouge ?");
    return;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/reset-password-no-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ username, claimedEmail, newPassword })
    });
    const json = await res.json();

    noPdfSubmitBtn.disabled = false;
    noPdfSubmitBtn.textContent = "Vérifier et réinitialiser";

    if (!res.ok) {
      showError(noPdfErrorEl, json.error || "Une erreur est survenue.");
      return;
    }

    await afterResetSuccess(json.username, json.newCode);
  } catch {
    noPdfSubmitBtn.disabled = false;
    noPdfSubmitBtn.textContent = "Vérifier et réinitialiser";
    showError(noPdfErrorEl, "Impossible de contacter le serveur. Réessayez plus tard.");
  }
});
