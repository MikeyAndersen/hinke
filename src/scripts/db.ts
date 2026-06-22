// IndexedDB-lag: gemmer hvert skema som ét objekt og kan liste dem.
// Afløser trin 2's midlertidige localStorage-stub. Send-køen (trin 6) lægges
// senere i sin egen object store i samme database.
import type { Survey } from './survey';
import { ensureShape } from './survey';

const DB_NAME = 'hinke';
const DB_VERSION = 2;
const STORE = 'surveys';
const QUEUE = 'queue';
const ACTIVE_KEY = 'hinke:active';

/** Én ventende afsendelse pr. skema (idempotent — nøgle = surveyId). */
export interface QueueItem {
  surveyId: string;
  sendId: string; // stabil pr. afsendelse — bruges som idempotensnøgle ved genforsøg
  filename: string;
  kunde: string;
  adresse: string;
  pdfBase64: string;
  createdAt: number;
  attempts: number;
}

let dbPromise: Promise<IDBDatabase> | undefined;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(QUEUE)) {
        db.createObjectStore(QUEUE, { keyPath: 'surveyId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putSurvey(s: Survey): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(s);
  await txDone(tx);
}

export async function getSurvey(id: string): Promise<Survey | null> {
  const db = await openDB();
  const raw = await reqToPromise(db.transaction(STORE).objectStore(STORE).get(id));
  return raw ? ensureShape(raw as Survey) : null;
}

export async function deleteSurvey(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

/** Alle skemaer, nyeste først. */
export async function listSurveys(): Promise<Survey[]> {
  const db = await openDB();
  const raw = await reqToPromise(db.transaction(STORE).objectStore(STORE).getAll());
  return (raw as Survey[]).map(ensureShape).sort((a, b) => b.updatedAt - a.updatedAt);
}

// ---------- send-kø ----------
export async function queuePut(item: QueueItem): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(QUEUE, 'readwrite');
  tx.objectStore(QUEUE).put(item);
  await txDone(tx);
}

export async function queueDelete(surveyId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(QUEUE, 'readwrite');
  tx.objectStore(QUEUE).delete(surveyId);
  await txDone(tx);
}

export async function queueGetAll(): Promise<QueueItem[]> {
  const db = await openDB();
  const raw = await reqToPromise(db.transaction(QUEUE).objectStore(QUEUE).getAll());
  return (raw as QueueItem[]).sort((a, b) => a.createdAt - b.createdAt);
}

// ---------- aktivt skema (lille markør, holdes i localStorage) ----------
export function getActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
export function setActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignorér */
  }
}

/** Flyt trin 2's localStorage-kladde ind i IndexedDB (engangs). */
export async function migrateLegacyDraft(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem('hinke:draft');
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const s = ensureShape(JSON.parse(raw));
    await putSurvey(s);
    setActiveId(s.id);
    localStorage.removeItem('hinke:draft');
  } catch {
    /* korrupt kladde — ignorér */
  }
}
