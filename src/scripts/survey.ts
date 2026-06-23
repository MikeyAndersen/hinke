// Datamodellen for et installationsskema. Bevaret fra prototypens `survey`-objekt
// (SPEC §4) for kontinuitet — `syncState` er erstattet af `sendState`.

export type Placering = 'inde' | 'ude' | 'begge' | '';
export type Fundament = 'ude' | 'inde' | '';
export type Radiator = 'S' | 'M' | 'L' | 'XL' | '';
export type Olietank = 'Almindelig' | 'Nedgravet' | 'Ingen opg.' | '';
export type Demontering = 'Standard' | 'L' | 'XL' | '';
export type Service = 'Basis' | 'Udvidet' | '';
export type SendState = 'draft' | 'sent';

/** Antal-komponent: afkrydsning + valgfrit antal (bekræftes med Hinke). */
export interface Komponent {
  on: boolean;
  antal: number | '';
}

export interface Survey {
  id: string;
  createdAt: number;
  updatedAt: number;
  sendState: SendState;
  kunde: {
    navn: string;
    telefon: string;
    adresse: string;
    dato: string;
    instTid: string;
    placering: Placering;
  };
  forhold: {
    fundament: Fundament;
    fliser: boolean;
    afdaekning: boolean;
  };
  planskitse: {
    h: number | '';
    b: number | '';
    d: number | '';
    tegning: string; // dataURL — udfyldes i trin 4
  };
  billeder: {
    taget: {
      instOmraade: boolean;
      eltavle: boolean;
      planskitse: boolean;
      indedel: boolean;
      udedel: boolean;
    };
    fotos: Record<string, string>; // slot -> dataURL — udfyldes i trin 4
  };
  tillaeg: {
    indeUdeM: number | '';
    nedgravetRorM: number | '';
    type: string;
    radiator: Radiator;
    rorforbindelseM: number | '';
    xlBuffer: Komponent;
    cirkupumpe: Komponent;
    diamantboring: Komponent;
    olietank: Olietank;
    demontering: Demontering;
    service: Service;
    egneOpgaver: string;
  };
  bund: {
    bemaerkninger: string;
    elInstallation: string;
    indeEltavleM: number | '';
    ekstraTilkoeb: string;
  };
}

/** Foto-slots svarende til side 2 i skabelon-PDF'en (SPEC §4). */
export const PHOTO_SLOTS: { k: string; label: string }[] = [
  { k: 'instOmraade', label: 'Installations område' },
  { k: 'indedel', label: 'Indedel' },
  { k: 'udedel', label: 'Udedel' },
  { k: 'eltavle', label: 'Eltavle' },
  { k: 'andet1', label: 'Andet' },
  { k: 'andet2', label: 'Andet' },
];

/** Et nyt, tomt skema med unikt id. */
export function blankSurvey(): Survey {
  const now = Date.now();
  return {
    id: 'S' + now.toString(36) + Math.random().toString(36).slice(2, 5),
    createdAt: now,
    updatedAt: now,
    sendState: 'draft',
    kunde: { navn: '', telefon: '', adresse: '', dato: '', instTid: '', placering: '' },
    forhold: { fundament: '', fliser: false, afdaekning: false },
    planskitse: { h: '', b: '', d: '', tegning: '' },
    billeder: {
      taget: { instOmraade: false, eltavle: false, planskitse: false, indedel: false, udedel: false },
      fotos: {},
    },
    tillaeg: {
      indeUdeM: '',
      nedgravetRorM: '',
      type: '',
      radiator: '',
      rorforbindelseM: '',
      xlBuffer: { on: false, antal: '' },
      cirkupumpe: { on: false, antal: '' },
      diamantboring: { on: false, antal: '' },
      olietank: '',
      demontering: '',
      service: '',
      egneOpgaver: '',
    },
    bund: { bemaerkninger: '', elInstallation: '', indeEltavleM: '', ekstraTilkoeb: '' },
  };
}

/** Sikrer at et indlæst skema har alle felter (fremtidssikring ved modeludvidelser). */
export function ensureShape(s: Partial<Survey>): Survey {
  const b = blankSurvey();
  const merged = { ...b, ...s } as Survey;
  const sections = ['kunde', 'forhold', 'planskitse', 'billeder', 'tillaeg', 'bund'] as const;
  for (const k of sections) {
    // sektionsvis merge: indlæste værdier oven på defaults
    (merged as unknown as Record<string, unknown>)[k] = { ...b[k], ...(s[k] ?? {}) };
  }
  merged.billeder.taget = { ...b.billeder.taget, ...(s.billeder?.taget || {}) };
  merged.billeder.fotos = s.billeder?.fotos || {};
  return merged;
}
