/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Function: POST /api/send
// Modtager PDF (base64) + metadata fra klienten og sender den som vedhæftning
// via Resend. Secrets sættes som Pages environment variables — aldrig i repo.

interface Env {
  RESEND_API_KEY: string;
  OFFICE_EMAIL: string;
  FROM_EMAIL: string;
}

interface SendBody {
  sendId?: string;
  pdfBase64?: string;
  filename?: string;
  kunde?: string;
  adresse?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.RESEND_API_KEY || !env.OFFICE_EMAIL || !env.FROM_EMAIL) {
    return json({ error: 'Mail-konfiguration mangler på serveren' }, 500);
  }

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return json({ error: 'Ugyldig JSON' }, 400);
  }

  const { sendId, pdfBase64, filename } = body;
  const kunde = (body.kunde || '').trim();
  const adresse = (body.adresse || '').trim();

  if (!pdfBase64 || !filename) {
    return json({ error: 'Mangler pdfBase64 eller filename' }, 400);
  }

  const subject = `Installationsskema - ${kunde || 'ukendt kunde'}${adresse ? ', ' + adresse : ''}`;
  const html =
    `<p>Nyt installationsskema er vedhæftet som PDF.</p>` +
    `<p><strong>Kunde:</strong> ${escapeHtml(kunde) || '—'}<br>` +
    `<strong>Adresse:</strong> ${escapeHtml(adresse) || '—'}</p>`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  };
  // Idempotensnøgle: samme afsendelse prøvet igen dublerer ikke mailen.
  if (sendId) headers['Idempotency-Key'] = sendId;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [env.OFFICE_EMAIL],
      subject,
      html,
      attachments: [{ filename, content: pdfBase64 }],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    return json({ error: 'Resend afviste afsendelsen', status: resp.status, detail }, 502);
  }

  const data = (await resp.json()) as { id?: string };
  return json({ ok: true, id: data.id ?? null });
};
