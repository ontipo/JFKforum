import { extractTextFromPdf } from "./recoveryPdf.js";
import { renderNavbar } from "./navbar.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

renderNavbar();

const fileInput = document.getElementById("pdf-input");
const uploadStep = document.getElementById("upload-step");
const resetForm = document.getElementById("reset-form");
const fileNameEl = document.getElementById("file-name");
const newPasswordInput = document.getElementById("new-password");
const submitBtn = document.getElementById("reset-submit");
const doneEl = document.getElementById("reset-done");
const errorEl = document.getElementById("reset-error");

let extractedCode = null;

fileInput.addEventListener("change", async () => {
  errorEl.classList.add("hidden");
  const file = fileInput.files?.[0];
  if (!file) return;

  fileNameEl.textContent = `Fichier : ${file.name}`;

  try {
    const code = await extractTextFromPdf(file);
    if (!code) {
      showError("Impossible de retrouver un code valide dans ce PDF.");
      return;
    }
    extractedCode = code;
    uploadStep.classList.add("hidden");
    resetForm.classList.remove("hidden");
  } catch {
    showError("Ce fichier n'a pas pu être lu.");
  }
});

resetForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");

  const newPassword = newPasswordInput.value;
  if (newPassword.length < 8) {
    showError("Le mot de passe doit contenir au moins 8 caractères.");
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
      showError(json.error || "Une erreur est survenue.");
      return;
    }

    resetForm.classList.add("hidden");
    doneEl.classList.remove("hidden");
    setTimeout(() => (window.location.href = "login.html"), 2000);
  } catch {
    submitBtn.disabled = false;
    submitBtn.textContent = "Réinitialiser le mot de passe";
    showError("Impossible de contacter le serveur. Réessayez plus tard.");
  }
});

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}
