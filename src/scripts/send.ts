// Afsendelse til kontoret + offline-kø (trin 6).
// "Send til kontor" danner PDF'en, lægger en afsendelse i IndexedDB-køen og
// forsøger straks at sende. Er der ikke net (eller fejler kaldet), bliver
// afsendelsen i køen og prøves igen automatisk når der kommer net.
//
// Idempotens: køen har én post pr. skema (nøgle = surveyId), og hver post har
// et stabilt `sendId` der sendes som idempotensnøgle, så genforsøg ikke
// dublerer mailen.
import type { Survey } from './survey';
import { buildPdf, pdfFilename } from './pdf';
import { queueDelete, queueGetAll, queuePut, type QueueItem } from './db';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Læg et skema i send-køen (danner PDF'en og base64-koder den). */
export async function enqueue(survey: Survey): Promise<QueueItem> {
  const bytes = await buildPdf(survey);
  const item: QueueItem = {
    surveyId: survey.id,
    sendId: survey.id + '-' + Date.now().toString(36),
    filename: pdfFilename(survey),
    kunde: survey.kunde.navn,
    adresse: survey.kunde.adresse,
    pdfBase64: bytesToBase64(bytes),
    createdAt: Date.now(),
    attempts: 0,
  };
  await queuePut(item);
  return item;
}

/**
 * Tøm køen. Kalder `onSent(surveyId)` for hver afsendelse der lykkes.
 * Stopper ved netværksfejl (så resten prøves igen senere).
 */
export async function flushQueue(onSent: (surveyId: string) => Promise<void>): Promise<void> {
  if (!navigator.onLine) return;
  const items = await queueGetAll();
  for (const it of items) {
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sendId: it.sendId,
          pdfBase64: it.pdfBase64,
          filename: it.filename,
          kunde: it.kunde,
          adresse: it.adresse,
        }),
      });
      if (res.ok) {
        await queueDelete(it.surveyId);
        await onSent(it.surveyId);
      } else if (res.status >= 400 && res.status < 500) {
        // Permanent klientfejl (fx manglende felter) — bumb forsøg, men bliv i kø
        // så en montør kan se den fejlede. Stop ikke de øvrige.
        await queuePut({ ...it, attempts: it.attempts + 1 });
      } else {
        // Serverfejl — stop og prøv hele køen igen senere.
        break;
      }
    } catch {
      // Netværksfejl — afbryd, køen prøves igen ved næste net/onlinetidspunkt.
      break;
    }
  }
}
