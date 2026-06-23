# Udvikling — Hinke Energi Installationsskema

Operationelle retningslinjer for arbejdet i dette repo. Læs `SPEC.md` for det fulde
billede og brug `hinke-installationsskema-prototype.html` som reference for layout,
felter og dropdown-værdier.

## Produkt i én sætning

Offline-first felt-app (bærbar/PC) hvor en Hinke-montør udfylder et varmepumpe-
installationsskema, genererer en PDF og sender den til kontoret via sin egen mailklient
(et mailto-udkast åbnes; PDF'en hentes lokalt og vedhæftes) — virker også uden net.

## Tech stack

- **Astro** (statisk output), **vanilla CSS** — ingen Tailwind, ingen UI-framework medmindre nødvendigt.
- **PWA**: manifest + service worker (app-shell cache; må aldrig blokere offline-brug).
- **IndexedDB** til lokale kladder og send-kø.
- **pdf-lib** til client-side PDF oven på skabelon-PDF'en.
- **Cloudflare Pages** (statisk hosting). Ingen backend — afsendelse sker via `mailto` i klienten.

## Kommandoer

```bash
npm install
npm run dev      # lokal udvikling
npm run build    # output i dist/
npm run preview  # test build lokalt
```

## Foreslået struktur

```
public/                 logo, favicon, manifest, skabelon-PDF, ikoner
src/
  pages/index.astro     app-shellen
  scripts/              form-state, indexeddb, pdf, send (mailto), sketch, photos
  styles/               vanilla CSS (genbrug prototypens tokens)
```

## Byggerækkefølge (anbefalet)

1. Scaffold Astro + PWA-manifest + service worker. Bekræft "installer app" + offline-load virker.
2. Port formularen fra prototypen 1:1 (felter, dropdowns, segmenterede valg, chips, antal-felter).
3. IndexedDB-lag: gem/hent kladder + skema-liste (afløser prototypens `window.storage`).
4. Skitse-canvas + foto-upload med ned-skalering (genbrug logikken fra prototypen).
5. PDF-generering med pdf-lib oven på skabelon-PDF'en; kalibrer feltkoordinater. Side 2 = fotos.
6. "Send til kontor"-flow: dan PDF, hent den lokalt og åbn et mailto-udkast i mailklienten.
7. Brand-assets: hent logo, udtræk eksakte farver, sæt favicon. Erstat placeholder-grøn.
8. Deploy til Cloudflare Pages (statisk, ingen secrets). Sæt custom domæne + CNAME.

## Konventioner

- Dansk i UI-tekster; sætningsform, plain verbs ("Gem kladde", "Send til kontor", "Nyt skema").
- Behold prototypens datamodel (`survey`-objektet) så der er kontinuitet — se SPEC §4.
- Favicon i `/public/` (en `favicon.ico` i `/public/` overstyrer HTML link-tags).
- System-fontstak — ingen webfont-kald (skal virke offline).
- Modtager-mail sættes ét sted (`OFFICE_EMAIL` i `src/scripts/send.ts`), pt. tom indtil bekræftet.

## Vigtigt / gotchas

- Service worker skal versioneres/invalidere cache ved deploy, ellers risikerer montøren en
  gammel app-version.
- PDF og fotos kan blive store: ned-skalér fotos før lagring (maks ~1100px, JPEG ~0.7) som i prototypen.
- `mailto:` kan ikke vedhæfte filer — derfor hentes PDF'en lokalt og vedhæftes manuelt.
- `mailto:` åbner OS'ets standard-mailklient; popper kun Outlook hvis det er sat som standard.
- Hold mailto-brødtekst kort (~1–2k tegn), da nogle klienter afkorter længere tekst.

## Åbent punkt at få bekræftet med Hinke

- XL Buffer / Cirkulationspumpe / Diamantboring: er afkrydsning + antal den rigtige tolkning?
- Hvilken modtager-mail skal kontoret bruge (default-forslag: `info@hinke.dk`)?
