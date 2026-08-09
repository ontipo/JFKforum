// ============================================================
// Niveaux (titres) — basés sur profiles.total_likes
// Niveau 0: 0 | 1: 10 | 2: 50 | 3: 100 | 4: 250 | 5: 500
// L'image du badge est fournie par vous (carrée ou rectangle) ;
// ici on prépare seulement le calcul du niveau et le chemin
// attendu de l'image : /badges/level-{n}.png
// ============================================================

const LEVEL_THRESHOLDS = [0, 10, 50, 100, 250, 500];

function getLevelFromLikes(totalLikes) {
  let level = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalLikes >= LEVEL_THRESHOLDS[i]) level = i;
  }
  return level;
}

function levelBadgeUrl(level) {
  return `badges/level-${level}.png`;
}
