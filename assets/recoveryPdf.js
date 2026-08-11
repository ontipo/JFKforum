// Génère un PDF contenant le code de récupération et déclenche son téléchargement.
export async function downloadRecoveryPdf(username, code) {
  const { PDFDocument, StandardFonts, rgb } = await import(
    "https://esm.sh/pdf-lib@1.17.1"
  );

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 780;

  page.drawText("Code de récupération du compte", {
    x: margin,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0.05, 0.05, 0.06)
  });
  y -= 30;

  page.drawText(`Nom d'utilisateur : ${username}`, { x: margin, y, size: 12, font: fontRegular });
  y -= 40;

  page.drawText("Conservez ce fichier en lieu sûr. Il est le SEUL moyen de récupérer", {
    x: margin,
    y,
    size: 11,
    font: fontRegular
  });
  y -= 15;
  page.drawText("votre compte en cas d'oubli de vos identifiants. Ne le partagez jamais.", {
    x: margin,
    y,
    size: 11,
    font: fontRegular
  });
  y -= 35;

  let currentPage = page;
  const chunkSize = 60;
  const lineHeight = 14;
  for (let i = 0; i < code.length; i += chunkSize) {
    if (y < 60) {
      currentPage = doc.addPage([595, 842]);
      y = 780;
    }
    currentPage.drawText(code.slice(i, i + chunkSize), { x: margin, y, size: 10, font: fontRegular });
    y -= lineHeight;
  }

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recuperation-${username.replace(/^!/, "")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Extrait le texte brut d'un PDF (utilisé sur la page "mot de passe oublié")
export async function extractTextFromPdf(file) {
  const fullText = await extractRawTextFromPdf(file);
  const match = fullText.match(/code:[A-Za-z0-9$?!%#@]+NIP[A-Za-z0-9$?!%#@]+/);
  return match ? match[0] : null;
}

// Extrait un e-mail du PDF-modèle de récupération "sans code" (assets/password_reset_template2.pdf)
export async function extractEmailFromPdf(file) {
  const fullText = await extractRawTextFromPdf(file);
  const match = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

async function extractRawTextFromPdf(file) {
  const pdfjsLib = await import("https://esm.sh/pdfjs-dist@4.6.82/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://esm.sh/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((item) => item.str).join("");
  }
  return fullText;
}
