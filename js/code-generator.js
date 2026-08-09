// ============================================================
// Génération du code de récupération
// Format : code:[240 caractères aléatoires]NIP[320 caractères aléatoires]
// Alphabet : A-Z a-z 0-9 $ ? ! % # @
//
// IMPORTANT (sécurité) :
// Le code complet n'est JAMAIS envoyé ni stocké tel quel sur le serveur.
// Seul son hash (SHA-256) est stocké dans profiles.recovery_code_hash.
// Le code lui-même n'existe que dans le PDF téléchargé par l'utilisateur :
// c'est la seule copie, donc s'il est perdu il n'y a plus de moyen de
// remonter jusqu'au compte. Cela reproduit fidèlement le principe demandé.
// ============================================================

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$?!%#@";

function randomSegment(length) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Génère le code complet : code:[240]NIP[320]
 * -> 560 caractères aléatoires au total, entourés des marqueurs "code:" et "NIP".
 */
function generateRecoveryCode() {
  const part1 = randomSegment(240);
  const part2 = randomSegment(320);
  return `code:${part1}NIP${part2}`;
}

/**
 * Hash SHA-256 du code complet, encodé en hexadécimal.
 * C'est cette valeur (et uniquement elle) qui part vers Supabase.
 */
async function hashRecoveryCode(code) {
  const data = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Construit un PDF contenant le code, et déclenche son téléchargement.
 * Nécessite jsPDF (chargé via CDN dans register.html).
 */
function downloadRecoveryCodePdf(username, code) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  doc.setFillColor(8, 8, 10);
  doc.rect(0, 0, 595, 842, "F");

  doc.setTextColor(230, 230, 235);
  doc.setFont("courier", "bold");
  doc.setFontSize(16);
  doc.text("Code de récupération", 48, 70);

  doc.setFont("courier", "normal");
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 158);
  doc.text(`Compte : ${username}`, 48, 95);
  doc.text(`Généré le : ${new Date().toLocaleString("fr-FR")}`, 48, 110);
  doc.text("Conservez ce fichier en lieu sûr. Il est la SEULE preuve", 48, 132);
  doc.text("permettant de récupérer ce compte en cas d'oubli.", 48, 145);

  doc.setTextColor(220, 220, 225);
  doc.setFontSize(9);
  const wrapped = doc.splitTextToSize(code, 500);
  doc.text(wrapped, 48, 175);

  doc.save(`recuperation-${username.replace("!", "")}.pdf`);
}

/**
 * Valide le format brut du code (avant hash), pour éviter d'envoyer
 * n'importe quoi côté formulaire de récupération.
 */
function isValidCodeFormat(code) {
  const pattern = /^code:[A-Za-z0-9$?!%#@]{240}NIP[A-Za-z0-9$?!%#@]{320}$/;
  return pattern.test(code);
}
