import { supabase } from "./supabaseClient.js";
import { renderNavbar } from "./navbar.js";
import { getLevel, escapeHtml, isImageExpired } from "./utils.js";
import { userBadgeHtml } from "./userBadge.js";

renderNavbar();

const loadingMsg = document.getElementById("loading-msg");
const box = document.getElementById("account-box");
const avatarSlot = document.getElementById("avatar-slot");
const badgeSlot = document.getElementById("badge-slot");
const pointsSlot = document.getElementById("points-slot");
const logoutBtn = document.getElementById("logout-btn");

const PFP_SIZE = { width: 150, height: 150 };
const BANNER_SIZE = { width: 1500, height: 500 };

const STATUS_LABEL = {
  none: "Aucune image envoyée",
  pending: "En attente de validation par un modérateur",
  approved: "Approuvée ✓",
  rejected: "Refusée par un modérateur"
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

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();

  loadingMsg.classList.add("hidden");

  if (!profile) return;

  // Expiration lazy : si l'image approuvée en hébergement "en ligne" a plus de 3 mois,
  // on la retire silencieusement et on repasse le statut à "none".
  const patch = {};
  if (isImageExpired(profile.pfp_status, profile.pfp_hosting, profile.pfp_approved_at)) {
    patch.pfp_status = "none";
    patch.pfp_url = null;
  }
  if (isImageExpired(profile.banner_status, profile.banner_hosting, profile.banner_approved_at)) {
    patch.banner_status = "none";
    patch.banner_url = null;
  }
  if (Object.keys(patch).length > 0) {
    await supabase.from("profiles").update(patch).eq("id", userId);
    Object.assign(profile, patch);
  }

  const level = getLevel({
    role: profile.role,
    postsCount: profile.posts_count,
    likesReceived: profile.likes_received
  });

  avatarSlot.innerHTML = profile.pfp_url
    ? `<img src="${profile.pfp_url}" alt="" />`
    : `<span style="font-size:20px;color:var(--silver-500)">${escapeHtml((profile.username[1] || "?").toUpperCase())}</span>`;

  badgeSlot.innerHTML = userBadgeHtml({
    username: profile.username,
    role: profile.role,
    likesReceived: profile.likes_received,
    postsCount: profile.posts_count
  });

  pointsSlot.textContent = `${profile.likes_received} points · ${profile.posts_count || 0} publications · ${level.label}`;

  document.getElementById("pfp-status").textContent = STATUS_LABEL[profile.pfp_status] || STATUS_LABEL.none;
  document.getElementById("banner-status").textContent = STATUS_LABEL[profile.banner_status] || STATUS_LABEL.none;

  box.classList.remove("hidden");
}

// Charge une image et vérifie ses dimensions exactes avant de l'accepter.
function checkImageDimensions(url, { width, height }) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth === width && img.naturalHeight === height);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function submitImage(field, inputId, errorId, size) {
  const input = document.getElementById(inputId);
  const errorEl = document.getElementById(errorId);
  errorEl.classList.add("hidden");

  const url = input.value.trim();
  if (!url) return;

  const hostingChoice = document.querySelector(`input[name="${field}-hosting"]:checked`).value;

  if (hostingChoice === "physical") {
    window.location.href = `buy/${field}.html`;
    return;
  }

  const validSize = await checkImageDimensions(url, size);
  if (!validSize) {
    errorEl.textContent = `L'image doit faire exactement ${size.width} × ${size.height} pixels.`;
    errorEl.classList.remove("hidden");
    return;
  }

  const patch =
    field === "pfp"
      ? { pfp_pending_url: url, pfp_status: "pending", pfp_hosting: "online" }
      : { banner_pending_url: url, banner_status: "pending", banner_hosting: "online" };

  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
    return;
  }

  input.value = "";
  load();
}

document
  .getElementById("pfp-submit-btn")
  .addEventListener("click", () => submitImage("pfp", "pfp-url-input", "pfp-error", PFP_SIZE));
document
  .getElementById("banner-submit-btn")
  .addEventListener("click", () => submitImage("banner", "banner-url-input", "banner-error", BANNER_SIZE));

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "index.html";
});

load();
