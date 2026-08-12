// Met à jour les balises <title> et og:* selon le contexte de la page.
// Limite connue : les robots d'aperçu (Facebook, Messenger, WhatsApp, Discord…)
// lisent le HTML brut et n'exécutent PAS ce JavaScript — ceci corrige donc
// l'onglet du navigateur et les partages faits depuis l'app elle-même,
// mais pas les vraies cartes d'aperçu sur les réseaux sociaux.
export function setOgTags({ title, description, url }) {
  if (title) {
    document.title = title;
    setMeta("property", "og:title", title);
  }
  if (description) setMeta("property", "og:description", description);
  if (url) setMeta("property", "og:url", url);
}

function setMeta(attr, key, value) {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}
