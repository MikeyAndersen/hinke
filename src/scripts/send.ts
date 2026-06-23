// Send til kontor — uden backend.
// "Send til kontor" danner PDF'en, henter den lokalt (ned i Overførsler/Downloads)
// og åbner montørens mailklient (mailto:) med et udfyldt udkast. Montøren vedhæfter
// selv den downloadede PDF og sender. Virker også offline — Outlook lægger mailen
// i sin egen udbakke til der er net igen.
//
// Bemærk: mailto: kan ikke vedhæfte filer (RFC 6068), derfor download + manuel
// vedhæftning frem for en server der sender mailen.
//
// IDÉ TIL SENERE: en offline send-kø (server + automatisk genforsøg) kan
// genindføres, hvis kontoret vil have mails sendt direkte uden manuel vedhæftning.
// Den tidligere Resend/Cloudflare Pages Function-løsning ligger i git-historikken.
import type { Survey } from './survey';
import { buildPdf, pdfFilename } from './pdf';

// Kontorets modtager-mail. Bevidst tom indtil adressen er bekræftet med Hinke —
// montøren udfylder selv modtageren i mailklienten. Sæt fx 'info@hinke.dk' her.
const OFFICE_EMAIL = '';

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Dan PDF'en og hent den lokalt. Returnerer filnavnet. */
export async function downloadPdf(survey: Survey): Promise<string> {
  const bytes = await buildPdf(survey);
  const filename = pdfFilename(survey);
  triggerDownload(bytes, filename);
  return filename;
}

function mailtoUrl(survey: Survey, filename: string): string {
  const k = survey.kunde;
  const subject =
    `Installationsskema – ${k.navn || 'uden navn'}` + (k.dato ? ' – ' + k.dato : '');
  const body = [
    'Installationsskema fra Hinke-montør.',
    '',
    `Kunde: ${k.navn || '—'}`,
    `Adresse: ${k.adresse || '—'}`,
    `Telefon: ${k.telefon || '—'}`,
    `Dato: ${k.dato || '—'}`,
    '',
    `Vedhæft venligst den downloadede PDF: ${filename}`,
    '(ligger i mappen Overførsler / Downloads).',
  ].join('\n');
  return (
    `mailto:${encodeURIComponent(OFFICE_EMAIL)}` +
    `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  );
}

/** Hent PDF'en lokalt og åbn mailklienten med et udfyldt udkast. */
export async function sendToOffice(survey: Survey): Promise<void> {
  const filename = await downloadPdf(survey);
  window.location.href = mailtoUrl(survey, filename);
}
