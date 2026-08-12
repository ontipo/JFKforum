import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";

renderNavbar();

const form = document.getElementById("login-form");
const errorEl = document.getElementById("login-error");
const submitBtn = document.getElementById("login-submit");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.classList.add("hidden");

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  submitBtn.disabled = true;
  submitBtn.textContent = "Connexion…";

  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Se connecter";
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
    return;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("banned_until")
    .eq("id", signInData.user.id)
    .single();

  if (profile?.banned_until && new Date(profile.banned_until) > new Date()) {
    await supabase.auth.signOut();
    submitBtn.disabled = false;
    submitBtn.textContent = "Se connecter";
    errorEl.textContent = `Ce compte est suspendu jusqu'au ${new Date(profile.banned_until).toLocaleString("fr-CA")}.`;
    errorEl.classList.remove("hidden");
    return;
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "Se connecter";
  window.location.href = "index.html";
});
