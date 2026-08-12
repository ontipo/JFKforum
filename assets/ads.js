import { supabase } from "./supabaseClient.js";
import { escapeHtml } from "./utils.js";

// Charge assets/ads/deploy.txt, choisit une pub au hasard (pondérée par le
// multiplicateur de chances) et l'affiche dans un encart fixe sur le côté.
// Dimension recommandée pour les images : 300 x 600 px (format "half page",
// très visible, standard IAB — évite de faire trop large pour ne pas gêner
// la colonne principale du site).
export async function mountAds() {
  let ads = [];
  try {
    const res = await fetch("assets/ads/deploy.txt");
    const text = await res.text();
    ads = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((line) => {
        const [multiplier, title, image, link] = line.split("=");
        return { multiplier: parseInt(multiplier, 10) || 1, title, image, link };
      })
      .filter((a) => a.title && a.image && a.link);
  } catch {
    return;
  }

  if (ads.length === 0) return;

  const pool = [];
  ads.forEach((ad) => {
    for (let i = 0; i < ad.multiplier; i++) pool.push(ad);
  });
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  const slot = document.createElement("div");
  slot.className = "ad-slot";
  slot.innerHTML = `
    <p class="ad-label">Publicité</p>
    <a href="${chosen.link}" target="_blank" rel="noopener sponsored" id="ad-link">
      <img src="assets/ads/${chosen.image}" alt="${escapeHtml(chosen.title)}" />
      <span class="ad-title">${escapeHtml(chosen.title)}</span>
    </a>
  `;
  document.body.appendChild(slot);

  slot.querySelector("#ad-link").addEventListener("click", () => {
    supabase.rpc("record_ad_click", { p_image_name: chosen.image });
  });
}
