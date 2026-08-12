// ------------------------------------------------------------
// Génération du code de récupération
// Format : code:[240 caractères aléatoires]NIP[320 caractères aléatoires]
// Charset : a-z A-Z 0-9 $ ? ! % # @
// ------------------------------------------------------------
const CODE_CHARSET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$?!%#@";

function randomSegment(length) {
  let out = "";
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    out += CODE_CHARSET[array[i] % CODE_CHARSET.length];
  }
  return out;
}

export function generateRecoveryCode() {
  const part1 = randomSegment(240);
  const part2 = randomSegment(320);
  return `code:${part1}NIP${part2}`;
}

// ------------------------------------------------------------
// Aperçu de post : 300 caractères max
// ------------------------------------------------------------
export function truncateBody(body, max = 300) {
  if (body.length <= max) return { preview: body, truncated: false };
  return { preview: body.slice(0, max).trimEnd() + "…", truncated: true };
}

// ------------------------------------------------------------
// Hashtags (#exemple), max 50, uniques, insensibles à la casse
// ------------------------------------------------------------
export function parseHashtags(input) {
  const raw = input
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, "").trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(raw)).slice(0, 50);
}

// ------------------------------------------------------------
// Mentions (@!pseudo) détectées dans le texte du post
// ------------------------------------------------------------
export function parseMentions(text) {
  const matches = text.match(/@!\w+/g) || [];
  return Array.from(new Set(matches.map((m) => m.slice(1))));
}

// ------------------------------------------------------------
// Détection de lien (interdit partout, SAUF les liens vers ontipo.github.io)
// ------------------------------------------------------------
const LINK_REGEX = /(https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,})[^\s]*/gi;
const ALLOWED_LINK_PREFIX = "https://ontipo.github.io/";

export function containsLink(text) {
  const matches = (text || "").match(LINK_REGEX) || [];
  return matches.some((m) => !m.toLowerCase().startsWith(ALLOWED_LINK_PREFIX));
}

// ------------------------------------------------------------
// Niveaux 0 à 7, selon publications + j'aimes reçus
// (niveau 7 = modérateur ou fondateur, peu importe les stats)
// ------------------------------------------------------------
export const LEVELS = [
  { level: 0, posts: 0, likes: 0, label: "Nouveau" },
  { level: 1, posts: 1, likes: 1, label: "Niveau I" },
  { level: 2, posts: 2, likes: 20, label: "Niveau II" },
  { level: 3, posts: 5, likes: 55, label: "Niveau III" },
  { level: 4, posts: 7, likes: 100, label: "Niveau IV" },
  { level: 5, posts: 10, likes: 200, label: "Niveau V" },
  { level: 6, posts: 20, likes: 350, label: "Niveau VI" }
];

// { role, postsCount, likesReceived } -> objet niveau (avec .level et .label)
export function getLevel({ role, postsCount = 0, likesReceived = 0 } = {}) {
  if (role === "moderator" || role === "owner") {
    return { level: 7, posts: Infinity, likes: Infinity, label: "Niveau VII" };
  }
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (postsCount >= lvl.posts && likesReceived >= lvl.likes) current = lvl;
  }
  return current;
}

// Chemin + dimensions de l'image de badge pour un niveau donné (null si niveau 0, pas de badge)
export function getLevelBadge(level) {
  if (!level || level < 1) return null;
  const size = level >= 4 ? { width: 230, height: 150 } : { width: 150, height: 150 };
  return { src: `img/private/${level}-level.svg`, ...size };
}

// ------------------------------------------------------------
// ID de post -> lien de partage [SITE]/?={id}
// (calculé relativement au dossier courant, pour fonctionner
// même si le site est servi depuis un sous-dossier, ex: GitHub Pages)
// ------------------------------------------------------------
export function postShareUrl(postId) {
  const dir = window.location.pathname.replace(/[^/]*$/, "");
  return `${window.location.origin}${dir}index.html?=${postId}`;
}

// ------------------------------------------------------------
// Expiration des images hébergées gratuitement (3 mois après approbation)
// ------------------------------------------------------------
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

export function isImageExpired(status, hosting, approvedAt) {
  if (status !== "approved" || hosting !== "online" || !approvedAt) return false;
  return Date.now() - new Date(approvedAt).getTime() > THREE_MONTHS_MS;
}

// ------------------------------------------------------------
// Temps relatif (à la française)
// ------------------------------------------------------------
export function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  const units = [
    ["an", 31536000],
    ["mois", 2592000],
    ["semaine", 604800],
    ["jour", 86400],
    ["heure", 3600],
    ["minute", 60]
  ];
  for (const [label, secs] of units) {
    const value = Math.floor(seconds / secs);
    if (value >= 1) return `il y a ${value} ${label}${value > 1 && label !== "mois" ? "s" : ""}`;
  }
  return "à l'instant";
}

// ------------------------------------------------------------
// KennedCoins (K$)
// ------------------------------------------------------------
export const KC_RATE_CAD = 0.1165; // valeur d'un K$ en CAD

export function cadToKc(cad) {
  return Math.round((cad / KC_RATE_CAD) * 100) / 100;
}

export function formatKc(amount) {
  return `${Number(amount).toFixed(2)} K$`;
}

// ------------------------------------------------------------
// Liste des mots bannis (assets/banned.txt) — pseudos, titres, textes, descriptions
// ------------------------------------------------------------
let bannedWordsCache = null;

export async function loadBannedWords() {
  if (bannedWordsCache) return bannedWordsCache;
  try {
    const res = await fetch("assets/banned.txt");
    const text = await res.text();
    bannedWordsCache = text
      .split("\n")
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith("#"));
  } catch {
    bannedWordsCache = [];
  }
  return bannedWordsCache;
}

export async function containsBannedWord(text) {
  const words = await loadBannedWords();
  const lower = (text || "").toLowerCase();
  return words.some((w) => lower.includes(w));
}

// ------------------------------------------------------------
// Code de parrainage (10 caractères, A-Z 0-9, majuscules seulement)
// ------------------------------------------------------------
const SPONSOR_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export function generateSponsorCode() {
  const array = new Uint32Array(10);
  crypto.getRandomValues(array);
  let out = "";
  for (let i = 0; i < 10; i++) out += SPONSOR_CHARSET[array[i] % SPONSOR_CHARSET.length];
  return out;
}

// ------------------------------------------------------------
// Porte-parole IP : masque les 3 derniers chiffres pour l'affichage,
// mais l'IP complète reste stockée en base.
// ------------------------------------------------------------
export function maskIp(ip) {
  const parts = (ip || "").split(".");
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
}

export function ipUsername(ip) {
  return `!p${ip}`;
}

// ------------------------------------------------------------
// IP bogon / réservée (RFC 1918, loopback, link-local, etc.)
// Vérifiable localement, sans service tiers.
// ------------------------------------------------------------
export function isBogonIp(ip) {
  const parts = (ip || "").split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  if (a >= 224) return true; // multicast / réservé
  return false;
}

// ------------------------------------------------------------
// Résolution de l'avatar / bannière : essaie d'abord le dossier
// géré manuellement sur GitHub (img/public/{user}/…), sinon retombe
// sur le lien approuvé par un modérateur (Supabase), sinon rien.
// ------------------------------------------------------------
export function avatarImgHtml(username, fallbackUrl, size, cssClass = "") {
  const clean = (username || "").replace(/^!/, "");
  const initial = escapeHtml((username?.[1] || "?").toUpperCase());
  const localSrc = `img/public/${clean}/pfp.png`;
  const onSupabaseError = `this.remove();this.parentElement.textContent='${initial}';`;
  const onLocalError = fallbackUrl
    ? `this.onerror=function(){${onSupabaseError}};this.src='${fallbackUrl}';`
    : onSupabaseError;
  return `<img src="${localSrc}" alt="" width="${size}" height="${size}" class="${cssClass}" onerror="${onLocalError}" />`;
}

export function bannerImgHtml(username, fallbackUrl) {
  const clean = (username || "").replace(/^!/, "");
  const pngSrc = `img/public/${clean}/banner.png`;
  const gifSrc = `img/public/${clean}/banner.gif`;
  const fallback = fallbackUrl ? `this.onerror=null;this.src='${fallbackUrl}';` : `this.remove();`;
  return `<img src="${pngSrc}" alt="" onerror="this.onerror=null;this.src='${gifSrc}';this.onerror=function(){${fallback}};" />`;
}

// ------------------------------------------------------------
// Validation basique de lien (utilisé partout où un lien d'image est soumis)
// ------------------------------------------------------------
export function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// Âge à partir d'une date de naissance (format YYYY-MM-DD)
// ------------------------------------------------------------
export function computeAge(birthdate) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export const ROLE_LABEL = {
  owner: "Fondateur",
  moderator: "Modérateur",
  user: null
};

// ------------------------------------------------------------
// Badges automatiques (calculés à partir des stats du profil)
// ------------------------------------------------------------
export const AUTO_BADGES = [
  { code: "debutant", name: "Débutant", check: (s) => s.postsCount >= 1 },
  { code: "publieur", name: "Publieur", check: (s) => s.postsCount >= 5 },
  { code: "yappeur", name: "Yappeur", check: (s) => s.postsCount >= 20 },
  { code: "spammeur", name: "Spammeur", check: (s) => s.postsCount >= 50 },
  { code: "shut-up", name: "Shut up!!! (blague!)", check: (s) => s.postsCount >= 100 },
  { code: "auto-jaime", name: "Auto-j'aime", check: (s) => s.likesReceived >= 3 },
  { code: "aime", name: "Aimé", check: (s) => s.likesReceived >= 10 },
  { code: "beaucoup-aime", name: "Beaucoup aimé", check: (s) => s.likesReceived >= 50 },
  { code: "trop-aime", name: "Trop aimé", check: (s) => s.likesReceived >= 200 },
  { code: "bot-des-likes", name: "Bot des likes", check: (s) => s.likesReceived >= 500 },
  { code: "populaire", name: "Populaire", check: (s) => s.likesReceived >= 1000 },
  { code: "amitie", name: "Amitié", check: (s) => s.friendsCount >= 1 },
  { code: "amis-proches", name: "Amis proches", check: (s) => s.friendsCount >= 3 },
  { code: "beaucoup-damis", name: "Beaucoup d'amis", check: (s) => s.friendsCount >= 10 },
  { code: "sage", name: "Sage", check: (s) => s.friendsCount >= 30 },
  { code: "amitie-accordee", name: "Amitié accordée", check: (s) => s.hasStaffFriend },
  { code: "amitie-couronnee", name: "Amitié couronnée", check: (s) => s.hasOwnerFriend }
];

// Badges décernables uniquement par le fondateur (via le panneau admin)
export const AWARDABLE_BADGES = [
  { code: "croix-de-fer", name: "Croix de fer" },
  { code: "croix-laudienne", name: "Croix Laudienne" },
  { code: "croix-arcienne", name: "Croix Arcienne" },
  { code: "croix-de-merite", name: "Croix de mérite" },
  { code: "croix-honorifique", name: "Croix honorifique" }
];

export function badgeImagePath(code) {
  return `img/private/${code}.svg`;
}

// Calcule la liste des badges automatiques obtenus à partir des stats du profil
export function computeAutoBadges(stats) {
  return AUTO_BADGES.filter((b) => b.check(stats));
}

// ------------------------------------------------------------
// Petit helper d'échappement HTML (contenu utilisateur)
// ------------------------------------------------------------
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
