import { downloadRecoveryPdf } from "./recoveryPdf.js";

// Affiche le choix "comment veux-tu ton code de récupération ?" dans `container`,
// exécute l'action choisie (PDF / copie / refus), puis résout une fois terminé.
export function presentRecoveryChoice(container, username, code) {
  return new Promise((resolve) => {
    container.innerHTML = `
      <div class="stack">
        <h2 class="font-display" style="font-size:17px;text-align:center">
          Comment veux-tu ton code de récupération de compte, en cas de perte de tes informations ?
        </h2>
        <button class="btn-outline" data-choice="pdf">1. Télécharger mon PDF</button>
        <button class="btn-outline" data-choice="copy">2. Copier mon code et le coller dans mes notes</button>
        <button class="btn-outline" data-choice="none" style="color:#f87171;border-color:#f87171">3. Je ne le veux pas</button>
        <p id="recovery-choice-msg" class="hint-text hidden" style="margin-top:6px"></p>
      </div>
    `;

    const msg = container.querySelector("#recovery-choice-msg");

    container.querySelector('[data-choice="pdf"]').addEventListener("click", async () => {
      await downloadRecoveryPdf(username, code);
      resolve("pdf");
    });

    container.querySelector('[data-choice="copy"]').addEventListener("click", async () => {
      await navigator.clipboard.writeText(code);
      msg.textContent =
        "Le code a été copié dans ton presse-papiers — colle-le maintenant dans une note que tu garderas en lieu sûr (attention : une fois que tu quittes cette page, tu ne pourras plus le récupérer).";
      msg.classList.remove("hidden");
      setTimeout(() => resolve("copy"), 3500);
    });

    container.querySelector('[data-choice="none"]').addEventListener("click", () => {
      const sure = confirm(
        "Attention : c'est le SEUL moyen de récupérer ton compte en cas de mot de passe oublié. Si tu refuses et perds tes identifiants, ton compte sera perdu définitivement. Confirmer ?"
      );
      if (sure) resolve("none");
    });
  });
}
