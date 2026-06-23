// PDF-generering med pdf-lib. Trin 5: producerer et rent, Hinke-brandet
// installationsskema (side 1 = felter + planskitse, derefter en side med fotos).
//
// Når Hinkes skabelon-PDF (HinkeEnergiSkabelonFørsteVersion.pdf) lægges i /public/,
// kan denne fil udvides til at lægge værdierne oven på skabelonen som baggrund
// (embedPdf + faste feltkoordinater) — se TEMPLATE-hook nederst. Indtil da bruges
// dette selvstændige layout.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Survey } from './survey';
import { PHOTO_SLOTS } from './survey';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const teal = rgb(0.055, 0.486, 0.451);
const tealDeep = rgb(0.039, 0.365, 0.337);
const tealSoft = rgb(0.89, 0.945, 0.937);
const ink = rgb(0.086, 0.125, 0.11);
const grey = rgb(0.36, 0.42, 0.39);
const lineCol = rgb(0.84, 0.87, 0.85);

// Hold tekst inden for WinAnsi (Helvetica) — dansk æøå er Latin-1 og virker.
function sanitize(s: unknown): string {
  return String(s ?? '')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x00-\xFF]/g, '');
}

interface Entry {
  label: string;
  value: string;
  full?: boolean;
}

async function dataUrlToBytes(d: string): Promise<Uint8Array> {
  const res = await fetch(d);
  return new Uint8Array(await res.arrayBuffer());
}

export function pdfFilename(s: Survey): string {
  const navn = sanitize(s.kunde.navn || 'kunde')
    .replace(/[^\w\sæøåÆØÅ-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  const dato = s.kunde.dato || new Date().toISOString().slice(0, 10);
  return `Hinke_installation_${navn || 'kunde'}_${dato}.pdf`.replace(/_+/g, '_');
}

// ---------- værdi-formatering ----------
const m = (v: number | '') => (v === '' || v == null ? '—' : `${v} m`);
const txt = (v: string) => (v ? sanitize(v) : '—');
const ja = (v: boolean) => (v ? 'Ja' : '—');
const komp = (k: { on: boolean; antal: number | '' }) =>
  k.on ? (k.antal === '' || k.antal == null ? 'Ja' : `Ja (antal ${k.antal})`) : '—';
const cap = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '—');

export async function buildPdf(survey: Survey): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage(A4);
  const W = page.getWidth();
  const H = page.getHeight();
  const contentW = W - 2 * MARGIN;
  const colGap = 18;
  const colW = (contentW - colGap) / 2;
  let y = H - MARGIN;
  let col = 0; // 0 = venstre, 1 = højre

  const wrap = (text: string, f: PDFFont, size: number, maxW: number): string[] => {
    const words = sanitize(text).split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (f.widthOfTextAtSize(t, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : ['—'];
  };

  const newPage = (): void => {
    page = doc.addPage(A4);
    y = H - MARGIN;
    col = 0;
  };
  const ensure = (h: number): void => {
    if (y - h < MARGIN + 10) newPage();
  };

  // ---------- header (kun side 1) ----------
  const drawHeader = async (): Promise<void> => {
    try {
      const logoBytes = await dataUrlToBytes('/hinke-logo.png');
      const logo = await doc.embedPng(logoBytes);
      const lh = 26;
      const lw = (logo.width / logo.height) * lh;
      page.drawImage(logo, { x: MARGIN, y: y - lh, width: lw, height: lh });
    } catch {
      /* logo valgfrit */
    }
    const title = 'INSTALLATIONSSKEMA';
    const ts = 15;
    page.drawText(title, {
      x: W - MARGIN - bold.widthOfTextAtSize(title, ts),
      y: y - 20,
      size: ts,
      font: bold,
      color: tealDeep,
    });
    y -= 38;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: W - MARGIN, y },
      thickness: 1.2,
      color: teal,
    });
    y -= 16;
  };

  const drawSection = (title: string): void => {
    if (col === 1) {
      col = 0;
      y -= 30;
    }
    ensure(40);
    page.drawRectangle({
      x: MARGIN,
      y: y - 16,
      width: contentW,
      height: 18,
      color: tealSoft,
    });
    page.drawText(sanitize(title).toUpperCase(), {
      x: MARGIN + 7,
      y: y - 12,
      size: 8.5,
      font: bold,
      color: tealDeep,
    });
    y -= 30;
  };

  const drawEntry = (e: Entry): void => {
    if (e.full) {
      if (col === 1) {
        col = 0;
        y -= 30;
      }
      const lines = wrap(e.value, font, 10, contentW);
      ensure(16 + lines.length * 13);
      page.drawText(sanitize(e.label), { x: MARGIN, y: y - 9, size: 7.5, font: bold, color: grey });
      let ly = y - 22;
      for (const ln of lines) {
        page.drawText(ln, { x: MARGIN, y: ly, size: 10, font, color: ink });
        ly -= 13;
      }
      y = ly - 6;
      col = 0;
      return;
    }
    const x = MARGIN + (col === 0 ? 0 : colW + colGap);
    if (col === 0) ensure(30);
    page.drawText(sanitize(e.label), { x, y: y - 9, size: 7.5, font: bold, color: grey });
    const lines = wrap(e.value, font, 10, colW);
    page.drawText(lines[0] + (lines.length > 1 ? ' …' : ''), {
      x,
      y: y - 22,
      size: 10,
      font,
      color: ink,
    });
    if (col === 1) {
      y -= 30;
      col = 0;
    } else col = 1;
  };

  const section = (title: string, entries: Entry[]): void => {
    drawSection(title);
    entries.forEach(drawEntry);
    if (col === 1) {
      col = 0;
      y -= 30;
    }
  };

  await drawHeader();

  const k = survey.kunde;
  section('Kunde', [
    { label: 'Navn', value: txt(k.navn) },
    { label: 'Telefon', value: txt(k.telefon) },
    { label: 'Adresse', value: txt(k.adresse), full: true },
    { label: 'Dato', value: txt(k.dato) },
    { label: 'Inst. tid', value: txt(k.instTid) },
    { label: 'Placering', value: cap(k.placering) },
  ]);

  const f = survey.forhold;
  section('Installationsforhold', [
    { label: 'Fundament', value: cap(f.fundament) },
    { label: 'Fliser', value: ja(f.fliser) },
    { label: 'Afdækning', value: ja(f.afdaekning) },
  ]);

  const p = survey.planskitse;
  section('Planskitse', [
    { label: 'Højde', value: m(p.h) },
    { label: 'Bredde', value: m(p.b) },
    { label: 'Dybde', value: m(p.d) },
  ]);
  // Skitse-tegning
  if (p.tegning) {
    try {
      const img = await doc.embedPng(await dataUrlToBytes(p.tegning));
      const iw = contentW;
      const ih = Math.min(200, (img.height / img.width) * iw);
      ensure(ih + 10);
      page.drawRectangle({
        x: MARGIN,
        y: y - ih,
        width: iw,
        height: ih,
        borderColor: lineCol,
        borderWidth: 1,
      });
      page.drawImage(img, { x: MARGIN, y: y - ih, width: iw, height: ih });
      y -= ih + 12;
    } catch {
      /* skitse valgfri */
    }
  }

  const t = survey.tillaeg;
  section('Tillæg', [
    { label: 'Inde/Ude', value: m(t.indeUdeM) },
    { label: 'Nedgravet rør', value: m(t.nedgravetRorM) },
    { label: 'Type', value: txt(t.type) },
    { label: 'Radiator', value: txt(t.radiator) },
    { label: 'Rørforbindelse', value: m(t.rorforbindelseM) },
    { label: 'XL Buffer', value: komp(t.xlBuffer) },
    { label: 'Cirkulationspumpe', value: komp(t.cirkupumpe) },
    { label: 'Diamantboring', value: komp(t.diamantboring) },
    { label: 'Olietank', value: txt(t.olietank) },
    { label: 'Demontering', value: txt(t.demontering) },
    { label: 'Service', value: txt(t.service) },
    { label: 'Kundens egne opgaver', value: txt(t.egneOpgaver), full: true },
  ]);

  const tg = survey.billeder.taget;
  const tagetLabels: string[] = [];
  if (tg.instOmraade) tagetLabels.push('Inst. område');
  if (tg.eltavle) tagetLabels.push('Eltavle');
  if (tg.planskitse) tagetLabels.push('Planskitse');
  if (tg.indedel) tagetLabels.push('Indedel');
  if (tg.udedel) tagetLabels.push('Udedel');

  const b = survey.bund;
  section('Bemærkninger & el', [
    { label: 'Billeder taget', value: tagetLabels.length ? tagetLabels.join(', ') : '—', full: true },
    { label: 'Bemærkninger', value: txt(b.bemaerkninger), full: true },
    { label: 'El-installation', value: txt(b.elInstallation), full: true },
    { label: 'Inde/eltavle', value: m(b.indeEltavleM) },
    { label: 'Ekstra tilkøb', value: txt(b.ekstraTilkoeb), full: true },
  ]);

  // ---------- fotos: ét pr. side, så stort som muligt ----------
  await drawPhotoPages(doc, survey, bold);

  return doc.save();
}

async function drawPhotoPages(doc: PDFDocument, survey: Survey, bold: PDFFont): Promise<void> {
  // Ét foto pr. side, så stort som muligt. Faste slots først, derefter ekstra
  // fotos med montørens egne titler. Tomme/ulæselige springes over.
  for (const slot of PHOTO_SLOTS) {
    await drawPhotoPage(doc, bold, slot.label, survey.billeder.fotos[slot.k]);
  }
  for (const extra of survey.billeder.ekstra) {
    await drawPhotoPage(doc, bold, extra.titel || 'Andet', extra.data);
  }
}

async function drawPhotoPage(
  doc: PDFDocument,
  bold: PDFFont,
  label: string,
  data: string | undefined,
): Promise<void> {
  // Ét foto, så stort som muligt (contain inden for margenerne). Brede billeder
  // lægges på en liggende A4 så de fylder mest muligt.
  if (!data) return;

  let img;
  try {
    const bytes = await dataUrlToBytes(data);
    img = data.startsWith('data:image/png')
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes);
  } catch {
    return; // ulæseligt foto — spring over
  }

  const landscape = img.width > img.height;
  const page: PDFPage = doc.addPage(landscape ? [A4[1], A4[0]] : A4);
  const W = page.getWidth();
  const H = page.getHeight();
  let y = H - MARGIN;

  page.drawText(sanitize(label).toUpperCase(), {
    x: MARGIN,
    y: y - 16,
    size: 15,
    font: bold,
    color: tealDeep,
  });
  y -= 24;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: W - MARGIN, y },
    thickness: 1.2,
    color: teal,
  });
  y -= 16;

  // Tilgængeligt område: hele bredden, fra under overskriften til bundmargen.
  const availW = W - 2 * MARGIN;
  const availH = y - MARGIN;
  const r = Math.min(availW / img.width, availH / img.height);
  const iw = img.width * r;
  const ih = img.height * r;
  page.drawImage(img, {
    x: MARGIN + (availW - iw) / 2,
    y: MARGIN + (availH - ih) / 2,
    width: iw,
    height: ih,
  });
}
