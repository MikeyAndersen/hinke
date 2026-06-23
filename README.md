# Hinke Energi — Installationsskema

Offline-first felt-app (PWA) hvor en Hinke-montør udfylder et varmepumpe-
installationsskema, genererer en PDF og sender den på mail til kontoret — også
uden net (afsendelser lægges i kø og sendes når der igen er forbindelse).

Se [`SPEC.md`](./SPEC.md) for den fulde specifikation og [`DEVELOPMENT.md`](./DEVELOPMENT.md)
for arbejdsretningslinjer.

## Tech

- **Astro** (statisk output) + **vanilla CSS** — ingen UI-framework.
- **PWA**: manifest + Workbox-service worker (`@vite-pwa/astro`) → installérbar og 100 % offline.
- **IndexedDB**: lokale skemaer (kladder) + send-kø.
- **pdf-lib**: client-side PDF.
- **Cloudflare Pages** (statisk hosting). Ingen backend — "Send til kontor" henter
  PDF'en lokalt og åbner et mailudkast via `mailto` i montørens mailklient.

## Udvikling

```bash
npm install
npm run dev        # lokal udvikling (http://localhost:4321)
npm run build      # statisk output i dist/
npm run preview    # test build lokalt
```

PWA-ikonerne genereres fra `public/logo.svg`-kilden via `npm run generate-pwa-assets`.

### Send til kontor

"Send til kontor" danner PDF'en, henter den lokalt (Overførsler/Downloads) og åbner et
`mailto`-udkast i montørens mailklient (fx Outlook) med emne og brødtekst udfyldt.
Montøren vedhæfter selv den downloadede PDF og sender — virker også offline (mailklienten
lægger mailen i sin egen udbakke). Modtager-mailen sættes i `OFFICE_EMAIL` i
`src/scripts/send.ts` (pt. tom indtil kontorets adresse er bekræftet).

## Deploy (Cloudflare Pages)

Fuldt statisk — ingen Functions, ingen secrets.

1. Build-indstillinger: **Build command** `npm run build`, **Output directory** `dist`.
2. Manuelt deploy: `npx wrangler pages deploy dist`. (Auto-build ved push kræver at
   GitHub-repoet forbindes til Pages-projektet i dashboardet.)
3. Custom domæne `hinke.nova-tech.dk`: domænet er tilføjet på Pages-projektet og kræver
   en CNAME `hinke → hinke-installationsskema.pages.dev` (proxied) i `nova-tech.dk`-zonen.

## Datamodel

`Survey`-objektet (se `src/scripts/survey.ts`) er bevaret fra prototypen for kontinuitet.
`sendState`: `draft` → `sent`.

## Struktur

```
public/                 logo, favicon, PWA-ikoner, manifest
src/
  layouts/Layout.astro  app-shell <head> (manifest, SW, favicon)
  pages/index.astro     formularen
  scripts/
    survey.ts           datamodel + blankSurvey()
    db.ts               IndexedDB: skemaer (kladder)
    form.ts             binding, autosave, skuffe, knapper
    sketch.ts           planskitse-canvas (med maksimér)
    photos.ts           foto-upload + ned-skalering
    pdf.ts              PDF-generering (pdf-lib)
    send.ts             send til kontor: hent PDF lokalt + mailto-udkast
  styles/global.css     design-tokens + komponenter
```

## Status

Implementeret: scaffold/PWA, formular, IndexedDB, skitse+foto, PDF, "Send til kontor"
(hent PDF lokalt + mailto-udkast), branding. Deployet på Cloudflare Pages
(`hinke-installationsskema.pages.dev`).

**Åbent:**
- Hinkes skabelon-PDF mangler — PDF'en bruger indtil videre et selvstændigt layout; læg
  `HinkeEnergiSkabelonFørsteVersion.pdf` i `public/` for at lægge værdierne oven på
  skabelonen som baggrund.
- Kontorets modtager-mail (`OFFICE_EMAIL` i `src/scripts/send.ts`) er endnu ikke bekræftet.
- Custom domæne `hinke.nova-tech.dk`: CNAME mangler i `nova-tech.dk`-zonen (se Deploy).
