import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";

renderNavbar();

const STATUS_LABEL = {
  none: "",
  pending: "En attente de validation par un modérateur.",
  approved: "Vérifié ✓ — tu as accès au contenu 18+.",
  rejected: "Ta dernière demande a été refusée. Tu peux en soumettre une nouvelle."
};

let userId = null;

async function load() {
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
    .select("age_verification_status, age_verified")
    .eq("id", userId)
    .single();

  document.getElementById("status-slot").textContent = STATUS_LABEL[profile?.age_verification_status] || "";

  if (profile?.age_verification_status === "pending" || profile?.age_verified) {
    document.getElementById("form-slot").classList.add("hidden");
  }
}

document.getElementById("age-submit-btn").addEventListener("click", async () => {
  const errorEl = document.getElementById("age-error");
  errorEl.classList.add("hidden");

  const url = document.getElementById("age-url-input").value.trim();
  if (!url) return;

  const { error } = await supabase
    .from("profiles")
    .update({ age_verification_url: url, age_verification_status: "pending" })
    .eq("id", userId);

  if (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
    return;
  }

  load();
});

load();
