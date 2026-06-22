# Hinke Energi — Installationsskema

Offline-first felt-app (PWA) hvor en Hinke-montør udfylder et varmepumpe-
installationsskema, genererer en PDF og sender den på mail til kontoret — også
uden net (afsendelser lægges i kø og sendes når der igen er forbindelse).

Se [`SPEC.md`](./SPEC.md) for den fulde specifikation og [`CLAUDE.md`](./CLAUDE.md)
for arbejdsretningslinjer.

## Tech

- **Astro** (statisk output) + **vanilla CSS** — ingen UI-framework.
- **PWA**: manifest + Workbox-service worker (`@vite-pwa/astro`) → installérbar og 100 % offline.
- **IndexedDB**: lokale skemaer (kladder) + send-kø.
- **pdf-lib**: client-side PDF.
- **Cloudflare Pages** + én Pages Function `/api/send` der kalder **Resend**.

## Udvikling

```bash
npm install
npm run dev        # lokal udvikling (http://localhost:4321)
npm run build      # statisk output i dist/
npm run preview    # test build lokalt
```

PWA-ikonerne genereres fra `public/logo.svg`-kilden via `npm run generate-pwa-assets`.

### Test af mail-afsendelse lokalt

`/api/send` er en Cloudflare Pages Function og kører ikke i `astro dev`. Test den med Wrangler:

```bash
cp .dev.vars.example .dev.vars   # udfyld dine Resend-secrets
npm run build
npx wrangler pages dev dist
```

Uden gyldige secrets svarer endpointet 500; afsendelser bliver i offline-køen og kan prøves igen.

## Deploy (Cloudflare Pages)

1. Forbind GitHub-repoet til et Cloudflare Pages-projekt.
2. Build-indstillinger: **Build command** `npm run build`, **Output directory** `dist`.
3. Sæt environment variables (Production + Preview):
   - `RESEND_API_KEY` — API-nøgle fra Resend
   - `OFFICE_EMAIL` — kontorets modtager-mail (fx `info@hinke.dk`)
   - `FROM_EMAIL` — afsender på et **verificeret** Resend-domæne
4. Verificér afsender-domænet i Resend (SPF/DKIM), ellers afvises mails.
5. Push til main → auto-build og deploy. `functions/api/send.ts` udstilles som `/api/send`.

## Datamodel

`Survey`-objektet (se `src/scripts/survey.ts`) er bevaret fra prototypen for kontinuitet.
`sendState`: `draft` → `queued` → `sent`.

## Struktur

```
functions/api/send.ts   Pages Function: modtager PDF, kalder Resend
public/                 logo, favicon, PWA-ikoner, manifest
src/
  layouts/Layout.astro  app-shell <head> (manifest, SW, favicon)
  pages/index.astro     formularen
  scripts/
    survey.ts           datamodel + blankSurvey()
    db.ts               IndexedDB: skemaer + send-kø
    form.ts             binding, autosave, skuffe, knapper
    sketch.ts           planskitse-canvas (med maksimér)
    photos.ts           foto-upload + ned-skalering
    pdf.ts              PDF-generering (pdf-lib)
    send.ts             afsendelse + offline-kø
  styles/global.css     design-tokens + komponenter
```

## Status

Trin 1–7 er implementeret (scaffold/PWA, formular, IndexedDB, skitse+foto, PDF, afsendelse+kø,
branding). **Åbent:** Hinkes skabelon-PDF mangler — PDF'en bruger indtil videre et selvstændigt
layout; læg `HinkeEnergiSkabelonFørsteVersion.pdf` i `public/` for at lægge værdierne oven på
skabelonen som baggrund. Trin 8 (Cloudflare-deploy + secrets) udføres når repoet forbindes.
