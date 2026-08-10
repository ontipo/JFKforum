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
// Détection de lien (interdit dans les posts/commentaires)
// ------------------------------------------------------------
const LINK_REGEX = /(https?:\/\/|www\.[a-z0-9-]+\.[a-z]{2,})/i;
export function containsLink(text) {
  return LINK_REGEX.test(text);
}

// ------------------------------------------------------------
// Niveaux / titres selon les likes reçus
// ------------------------------------------------------------
export const LEVELS = [
  { level: 0, threshold: 0, label: "Sans titre" },
  { level: 1, threshold: 10, label: "Niveau I" },
  { level: 2, threshold: 50, label: "Niveau II" },
  { level: 3, threshold: 100, label: "Niveau III" },
  { level: 4, threshold: 250, label: "Niveau IV" },
  { level: 5, threshold: 500, label: "Niveau V" }
];

export function getLevel(likesReceived) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (likesReceived >= lvl.threshold) current = lvl;
  }
  return current;
}

// ------------------------------------------------------------
// ID de post -> lien de partage [SITE]/?={id}
// ------------------------------------------------------------
export function postShareUrl(postId) {
  return `${window.location.origin}/?=${postId}`;
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

export const ROLE_LABEL = {
  owner: "Fondateur",
  moderator: "Modérateur",
  user: null
};

// ------------------------------------------------------------
// Petit helper d'échappement HTML (contenu utilisateur)
// ------------------------------------------------------------
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
