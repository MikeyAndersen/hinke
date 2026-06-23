# Hinke Energi — Installationsskema (felt-app)

Projektspecifikation til implementering. Læs denne sammen med `CLAUDE.md` og brug
`hinke-installationsskema-prototype.html` som visuel/strukturel reference for layout,
felter og dropdown-værdier.

---

## 1. Hvad det er

En offline-first felt-app som en Hinke-montør/sælger bruger på sin **bærbar/PC** ude hos
kunden til at udfylde et installationsskema for en varmepumpe. Når skemaet er færdigt
genereres en **PDF**, som montøren henter lokalt og sender til kontoret via sin egen
mailklient — et udfyldt mailudkast åbnes automatisk. App'en virker uden net; selve
mailen håndteres af mailklienten (fx Outlooks udbakke).

App'en erstatter et eksisterende papir-/Excel-skema (se `HinkeEnergiSkabelonFørsteVersion.pdf`).

## 2. Beslutninger (låst)

| Emne | Valg |
|------|------|
| Output | PDF hentet lokalt + mailudkast via montørens mailklient (mailto) |
| Online/offline | Offline-first; lokale kladder. Mailen håndteres af mailklienten (fx Outlook-udbakke) |
| Primær enhed | Bærbar / PC |
| Hosting | Cloudflare Pages |
| Backend | Ingen — fuldt statisk app (mailto i stedet for server-afsendelse) |
| Login | **Ikke i v1** (hver enhed har sine egne lokale kladder; ingen brugerkonti) |
| Database | **Ikke i v1** (mailen er journalen; D1 kan tilføjes i fase 2 til log) |

> Antagelse der må rettes: ingen login i v1. Hvis flere montører senere skal dele
> kladder eller kontoret skal se en oversigt, tilføjes auth + D1 i fase 2.

## 3. Arkitektur

```
[ Astro PWA (statisk) ]  ──►  IndexedDB (lokale kladder)
        │
        │ "Send til kontor": dan PDF (pdf-lib)
        ├──►  hent PDF lokalt (download)
        └──►  åbn mailto: → montørens mailklient (Outlook) med udfyldt udkast
                 → montøren vedhæfter PDF'en og sender
```

- **Frontend:** Astro, statisk output, vanilla CSS (samme stil som prototypen — ingen Tailwind).
  Én klient-"ø" (vanilla JS eller en let komponent) bærer hele formularen.
- **PWA:** manifest + service worker så app'en kan installeres og køre 100% offline.
  Service worker cacher app-shell; må aldrig blokere offline-brug.
- **Lokal lagring:** IndexedDB (erstatter prototypens `window.storage`). Gemmer hvert
  skema som objekt.
- **PDF:** genereres **client-side** med `pdf-lib`, der lægger felt-værdier, skitse og
  fotos oven på den eksisterende skabelon-PDF som baggrund → pixel-præcis match til Hinkes form.
- **Afsendelse:** "Send til kontor" danner PDF'en, henter den lokalt og åbner et
  mailto-udkast i montørens mailklient (To/emne/brødtekst udfyldt). Montøren vedhæfter
  selv PDF'en. mailto kan ikke vedhæfte filer (RFC 6068), derfor manuel vedhæftning.
- **Offline:** alt virker uden net; mailklienten (fx Outlook) lægger selv mailen i sin
  udbakke til der er forbindelse. Ingen egen send-kø i appen.

## 4. Datamodel

Genbrug strukturen fra prototypen (`survey`-objektet):

```ts
type Survey = {
  id: string; createdAt: number; updatedAt: number;
  sendState: "draft" | "sent";   // erstatter prototypens syncState
  kunde:   { navn; telefon; adresse; dato; instTid; placering: "inde"|"ude"|"begge"|"" };
  forhold: { fundament: "ude"|"inde"|""; fliser: boolean; afdaekning: boolean };
  planskitse: { h; b; d; tegning: string /* dataURL */ };
  billeder: {
    taget: { instOmraade; eltavle; planskitse; indedel; udedel: boolean };
    fotos: { [slot: string]: string /* dataURL, ned-skaleret */ };
  };
  tillaeg: {
    indeUdeM; nedgravetRorM; type; radiator: "S"|"M"|"L"|"XL"|"";
    rorforbindelseM;
    xlBuffer:      { on: boolean; antal: number|"" };
    cirkupumpe:    { on: boolean; antal: number|"" };
    diamantboring: { on: boolean; antal: number|"" };
    olietank:    "Almindelig"|"Nedgravet"|"Ingen opg."|"";
    demontering: "Standard"|"L"|"XL"|"";
    service:     "Basis"|"Udvidet"|"";
    egneOpgaver: string;
  };
  bund: { bemaerkninger; elInstallation; indeEltavleM; ekstraTilkoeb };
};
```

Foto-slots (side 2 i skabelonen): `instOmraade, indedel, udedel, eltavle, andet1, andet2`.

## 5. Felter og felttyper

**Kunde:** Navn, Telefon, Adresse (tekst) · Dato (date) · Inst. tid (tekst) · Placering (Inde/Ude/Begge).

**Installationsforhold:** Fundament (Ude/Inde) · Fliser, Afdækning (afkrydsning).

**Planskitse:** H/B/D (tal, meter) · skitse (canvas, tegn med mus/pen).

**Billeder:** afkrydsning for hvilke billeder er taget (Inst. område, Eltavle, Planskitse,
Indedel, Udedel) · 6 foto-slots med upload/kamera + preview.

**Tillæg:** Inde/Ude, Nedgravet rør, Rørforbindelse (tal, meter) · Type (tekst) ·
Radiator (S/M/L/XL) · XL Buffer / Cirkulationspumpe / Diamantboring (afkrydsning + antal) ·
Olietank (Almindelig/Nedgravet/Ingen opg.) · Demontering (Standard/L/XL) ·
Service (Basis/Udvidet) · Egne opgaver (fritekst).

**Bund:** Bemærkninger (fritekst) · El-installation (tekst) · Inde/eltavle (tal, meter) ·
Ekstra tilkøb (fritekst).

> Dropdown-værdierne stammer fra fanebladet "Dropdown muligheder" i `test.xlsx`.
> XL Buffer/Cirkupumpe/Diamantboring er tolket som afkrydsning + antal — bekræft med Hinke.

## 6. PDF-output

- Brug `HinkeEnergiSkabelonFørsteVersion.pdf` (begge sider) som baggrund i `pdf-lib`.
- Tegn felt-værdier ind på de rigtige positioner (koordinater kalibreres mod skabelonen).
- Side 1: alle felter + planskitse-tegningen i skitse-feltet.
- Side 2: de uploadede fotos placeret i deres respektive rammer (Installations område,
  Indedel, Udedel, Eltavle, Andet, Andet).
- Filnavn: `Hinke_installation_<kundenavn>_<dato>.pdf`.

## 7. Mail-afsendelse (mailto, ingen backend)

- "Send til kontor" henter PDF'en lokalt og åbner `mailto:` i montørens mailklient.
- Emne: `Installationsskema – <kundenavn> – <dato>`. Brødtekst: kort resumé (kunde,
  adresse, telefon, dato) + opfordring til at vedhæfte den downloadede PDF.
- Modtager: sættes i `OFFICE_EMAIL`-konstanten i `src/scripts/send.ts` (pt. tom indtil
  kontorets adresse er bekræftet — montøren udfylder selv modtageren).
- Ingen secrets, ingen Resend, ingen Pages Function, ingen domæne-verifikation.

> IDÉ TIL SENERE: server-afsendelse med automatisk genforsøg (Resend + send-kø) kan
> genindføres, hvis kontoret vil have mails uden manuel vedhæftning.

## 8. Offline-adfærd

- Al udfyldning fungerer uden net; kladder gemmes løbende i IndexedDB.
- "Send til kontor" virker også offline: PDF'en dannes/hentes lokalt og mailudkastet
  åbnes; mailklienten (fx Outlook) sender når der er net igen.
- Vis tydelig status pr. skema (kladde / sendt) som i prototypen.

## 9. Branding

- Logo: `https://hinke.dk/wp-content/themes/yootheme/cache/03/Hinke-logo-RGB-gradient-pos_HP_v1-0350e32b.png`
  (positiv RGB-gradient-version). Hent det, læg i `/public/`, og **udtræk de eksakte
  brandfarver fra logoet** — erstat prototypens placeholder-grøn (`#1f7a4d`).
- Favicon i `/public/` (en evt. `favicon.ico` i `/public/` overstyrer HTML link-tags).
- System-fontstak (ingen webfont) så app'en virker offline uden netværkskald.

## 10. Deploy

- **Cloudflare Pages**, projekt `hinke-installationsskema`. Live på
  `https://hinke-installationsskema.pages.dev`.
- Build: `npm run build`, output `dist/`. Fuldt statisk — ingen Functions/secrets.
- Custom domæne `hinke.nova-tech.dk`: tilføjet på Pages-projektet; kræver en CNAME
  `hinke → hinke-installationsskema.pages.dev` (proxied) i `nova-tech.dk`-zonen.
- Auto-build ved push kræver at GitHub-repoet forbindes i Pages-dashboardet; ellers
  deployes manuelt med `npx wrangler pages deploy dist`.

## 11. Uden for scope (v1) / fase 2

- Brugerlogin og roller.
- D1-database med log over afsendte skemaer + lille kontor-oversigt.
- Redigering af et allerede sendt skema fra kontorets side.
- Eksport til andre formater end PDF.
