// Form-state: binder DOM'ens felter til ét `survey`-objekt, auto-gemmer i
// IndexedDB (trin 3), håndterer planskitse (trin 4) og foto-upload (trin 4),
// samt skema-listen i skuffen.
import { blankSurvey, newPhotoId, type ExtraPhoto, type Survey } from './survey';
import {
  deleteSurvey,
  getActiveId,
  getSurvey,
  listSurveys,
  migrateLegacyDraft,
  putSurvey,
  setActiveId,
} from './db';
import { SketchPad } from './sketch';
import { downscaleToDataURL } from './photos';
import { downloadPdf, sendToOffice as sendFlow } from './send';

let survey: Survey = blankSurvey();
let saveTimer: number | undefined;
let inlinePad: SketchPad | undefined;
let bigPad: SketchPad | undefined;

// ---------- path-hjælpere ----------
type AnyObj = Record<string, any>;
function getP(obj: AnyObj, path: string): any {
  return path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), obj);
}
function setP(obj: AnyObj, path: string, val: unknown): void {
  const ks = path.split('.');
  const last = ks.pop()!;
  const t = ks.reduce<AnyObj>((o, k) => (o[k] == null ? (o[k] = {}) : o[k]), obj);
  t[last] = val;
}

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) =>
  r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) =>
  Array.from(r.querySelectorAll<T>(s));

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

// ---------- toast ----------
let toastTimer: number | undefined;
function toast(msg: string): void {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 1900);
}

// ---------- status ----------
function fmtTime(ts: number): string {
  const d = new Date(ts);
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}
function renderStatus(): void {
  const pill = $('#save-pill');
  if (pill) {
    pill.dataset.state = survey.sendState;
    pill.querySelector('.label')!.textContent =
      survey.sendState === 'sent'
        ? 'Sendt ' + fmtTime(survey.updatedAt)
        : 'Gemt kladde ' + fmtTime(survey.updatedAt);
  }
  const name = $('#meta-name');
  const saved = $('#meta-saved');
  const id = $('#meta-id');
  if (name) name.textContent = survey.kunde.navn || '—';
  if (saved) saved.textContent = fmtTime(survey.updatedAt);
  if (id) id.textContent = survey.id;
}

// ---------- gem ----------
async function persist(): Promise<void> {
  survey.updatedAt = Date.now();
  setActiveId(survey.id);
  renderStatus();
  try {
    await putSurvey(survey);
  } catch {
    toast('Kunne ikke gemme lokalt');
  }
}
function scheduleSave(): void {
  // Redigerer montøren et allerede sendt skema, bliver det igen en kladde.
  if (survey.sendState !== 'draft') {
    survey.sendState = 'draft';
    renderStatus();
  }
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void persist(), 500);
}

// ---------- bind ----------
function bindAll(): void {
  $$<HTMLInputElement>('[data-path]').forEach((el) => {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    const ev = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      const raw = el.value;
      const val = el.type === 'number' ? (raw === '' ? '' : Number(raw)) : raw;
      setP(survey, el.dataset.path!, val);
      scheduleSave();
    });
  });

  $$('[data-seg]').forEach((seg) => {
    if (seg.dataset.bound) return;
    seg.dataset.bound = '1';
    seg.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      const path = seg.dataset.seg!;
      const cur = getP(survey, path);
      const nv = cur === b.dataset.val ? '' : b.dataset.val;
      setP(survey, path, nv);
      $$('button', seg).forEach((x) => x.classList.toggle('active', x.dataset.val === nv));
      scheduleSave();
    });
  });

  $$('[data-chip]').forEach((chip) => {
    if (chip.dataset.bound) return;
    chip.dataset.bound = '1';
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const p = chip.dataset.chip!;
      const nv = !getP(survey, p);
      setP(survey, p, nv);
      chip.classList.toggle('checked', nv);
      $$<HTMLInputElement>(`[data-needs='${p}']`).forEach((inp) => {
        inp.disabled = !nv;
        if (!nv) {
          inp.value = '';
          setP(survey, inp.dataset.path!, '');
        }
      });
      scheduleSave();
    });
  });
}

// ---------- populér fra state ----------
function populate(): void {
  $$<HTMLInputElement>('[data-path]').forEach((el) => {
    const v = getP(survey, el.dataset.path!);
    el.value = v == null ? '' : String(v);
  });
  $$('[data-seg]').forEach((seg) => {
    const v = getP(survey, seg.dataset.seg!);
    $$('button', seg).forEach((b) => b.classList.toggle('active', b.dataset.val === v));
  });
  $$('[data-chip]').forEach((chip) => {
    chip.classList.toggle('checked', !!getP(survey, chip.dataset.chip!));
  });
  $$<HTMLInputElement>('[data-needs]').forEach((inp) => {
    inp.disabled = !getP(survey, inp.dataset.needs!);
  });
  if (inlinePad) {
    inlinePad.load(survey.planskitse.tegning);
    setHintVisible('sketch-hint', inlinePad.isEmpty());
  }
  renderPhotos();
  renderStatus();
}

// ---------- skitse ----------
function setHintVisible(id: string, visible: boolean): void {
  const el = $(`#${id}`);
  if (el) el.style.display = visible ? 'grid' : 'none';
}

function setupSketch(): void {
  const inline = $<HTMLCanvasElement>('#sketch-inline');
  if (inline) {
    inlinePad = new SketchPad(inline, (data) => {
      survey.planskitse.tegning = data;
      setHintVisible('sketch-hint', !data);
      scheduleSave();
    });
    inlinePad.load(survey.planskitse.tegning);
    setHintVisible('sketch-hint', inlinePad.isEmpty());
  }

  $('#sketch-undo')?.addEventListener('click', () => inlinePad?.undo());
  $('#sketch-clear')?.addEventListener('click', () => inlinePad?.clear());
  $('#sketch-max')?.addEventListener('click', openSketchOverlay);
  $('#sketch-o-undo')?.addEventListener('click', () => bigPad?.undo());
  $('#sketch-o-clear')?.addEventListener('click', () => bigPad?.clear());
  $('#sketch-o-done')?.addEventListener('click', closeSketchOverlay);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSketchOverlay();
  });

  let resizeTimer: number | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      inlinePad?.fit();
      if ($('#sketch-overlay')?.classList.contains('open')) bigPad?.fit();
    }, 150);
  });
}

function openSketchOverlay(): void {
  const overlay = $('#sketch-overlay');
  const big = $<HTMLCanvasElement>('#sketch-big');
  if (!overlay || !big) return;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    if (!bigPad) {
      bigPad = new SketchPad(big, (data) => {
        survey.planskitse.tegning = data;
        setHintVisible('sketch-big-hint', !data);
        scheduleSave();
      });
    }
    bigPad.load(survey.planskitse.tegning);
    setHintVisible('sketch-big-hint', bigPad.isEmpty());
  });
}

function closeSketchOverlay(): void {
  const overlay = $('#sketch-overlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  inlinePad?.load(survey.planskitse.tegning);
  setHintVisible('sketch-hint', !survey.planskitse.tegning);
  void persist();
}

// ---------- fotos ----------
function setupPhotos(): void {
  $$<HTMLLabelElement>('.photo[data-slot]').forEach((label) => {
    const slot = label.dataset.slot!;
    const input = label.querySelector<HTMLInputElement>('input[type=file]');
    const rm = label.querySelector<HTMLButtonElement>('.rm');
    input?.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        survey.billeder.fotos[slot] = await downscaleToDataURL(file);
        renderPhoto(slot);
        await persist();
      } catch {
        toast('Kunne ikke indlæse billedet');
      }
      input.value = '';
    });
    rm?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      delete survey.billeder.fotos[slot];
      renderPhoto(slot);
      void persist();
    });
  });

  // "Tilføj billede" → nyt ekstra-foto med egen titel (standard "Andet").
  $('#add-photo')?.addEventListener('click', () => {
    survey.billeder.ekstra.push({ id: newPhotoId(), titel: 'Andet', data: '' });
    renderExtraPhotos();
    void persist();
  });
}

function renderPhoto(slot: string): void {
  const label = $<HTMLLabelElement>(`.photo[data-slot="${slot}"]`);
  if (!label) return;
  const data = survey.billeder.fotos[slot];
  label.querySelector('img')?.remove();
  if (data) {
    const img = new Image();
    img.src = data;
    label.insertBefore(img, label.querySelector('.ph'));
    label.classList.add('has');
  } else {
    label.classList.remove('has');
  }
}

// ---------- ekstra fotos (dynamiske, med egen titel) ----------
function buildExtraTile(p: ExtraPhoto): HTMLElement {
  const tile = document.createElement('div');
  tile.className = 'photo extra' + (p.data ? ' has' : '');
  tile.dataset.extraId = p.id;

  if (p.data) {
    const img = new Image();
    img.src = p.data;
    tile.appendChild(img);
  }

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'tag-input';
  title.value = p.titel;
  title.placeholder = 'Titel';
  title.maxLength = 40;
  title.addEventListener('input', () => {
    p.titel = title.value;
    scheduleSave();
  });

  const drop = document.createElement('label');
  drop.className = 'drop';
  const ph = document.createElement('div');
  ph.className = 'ph';
  ph.innerHTML = '<span class="ph-icon">📷</span>Tilføj billede';
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.setAttribute('capture', 'environment');
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      p.data = await downscaleToDataURL(f);
      renderExtraPhotos();
      await persist();
    } catch {
      toast('Kunne ikke indlæse billedet');
    }
    file.value = '';
  });
  drop.append(ph, file);

  const rm = document.createElement('button');
  rm.type = 'button';
  rm.className = 'rm';
  rm.textContent = 'Fjern';
  rm.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    survey.billeder.ekstra = survey.billeder.ekstra.filter((x) => x.id !== p.id);
    renderExtraPhotos();
    void persist();
  });

  tile.append(title, drop, rm);
  return tile;
}

function renderExtraPhotos(): void {
  const grid = $('#photos-grid');
  const addBtn = $('#add-photo');
  if (!grid || !addBtn) return;
  $$('.photo.extra', grid).forEach((el) => el.remove());
  survey.billeder.ekstra.forEach((p) => grid.insertBefore(buildExtraTile(p), addBtn));
}

function renderPhotos(): void {
  $$<HTMLLabelElement>('.photo[data-slot]').forEach((l) => renderPhoto(l.dataset.slot!));
  renderExtraPhotos();
}

// ---------- skema-liste (skuffe) ----------
function openDrawer(): void {
  $('#drawer')?.classList.add('open');
  $('#drawer')?.setAttribute('aria-hidden', 'false');
  void refreshJobs();
}
function closeDrawer(): void {
  $('#drawer')?.classList.remove('open');
  $('#drawer')?.setAttribute('aria-hidden', 'true');
}

async function refreshJobs(): Promise<void> {
  const list = $('#joblist');
  if (!list) return;
  const all = await listSurveys();
  if (!all.length) {
    list.innerHTML = '<div class="joblist-empty">Ingen skemaer endnu.</div>';
    return;
  }
  list.innerHTML = '';
  all.forEach((s) => {
    const color = s.sendState === 'sent' ? 'var(--green)' : 'var(--grey)';
    const stateTxt = s.sendState === 'sent' ? 'Sendt' : 'Kladde';
    const item = document.createElement('div');
    item.className = 'jobitem' + (s.id === survey.id ? ' active' : '');
    item.innerHTML =
      `<div class="ji-main"><div class="t">${esc(s.kunde.navn || '(uden navn)')}</div>` +
      `<div class="s"><span class="mini-dot" style="background:${color}"></span>${stateTxt} · ${esc(
        s.kunde.adresse || 'ingen adresse',
      )}</div></div>` +
      `<button class="ji-del" type="button" title="Slet" aria-label="Slet skema">✕</button>`;
    item.querySelector('.ji-main')!.addEventListener('click', () => void loadSurvey(s.id));
    item.querySelector('.ji-del')!.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Slet dette skema?')) void removeSurvey(s.id);
    });
    list.appendChild(item);
  });
}

async function loadSurvey(id: string): Promise<void> {
  const s = await getSurvey(id);
  if (!s) return;
  survey = s;
  setActiveId(id);
  populate();
  closeDrawer();
  toast('Skema indlæst');
}

async function removeSurvey(id: string): Promise<void> {
  await deleteSurvey(id);
  if (id === survey.id) {
    const all = await listSurveys();
    survey = all[0] ?? blankSurvey();
    setActiveId(survey.id);
    if (!all.length) await persist();
    populate();
  }
  await refreshJobs();
  toast('Skema slettet');
}

async function newSurvey(): Promise<void> {
  survey = blankSurvey();
  setActiveId(survey.id);
  populate();
  await persist();
  closeDrawer();
  toast('Nyt skema oprettet');
}

// ---------- PDF ----------
async function exportPdf(): Promise<void> {
  await persist();
  toast('Genererer PDF …');
  try {
    await downloadPdf(survey);
    toast('PDF gemt');
  } catch (e) {
    console.error(e);
    toast('Kunne ikke generere PDF');
  }
}

// ---------- send til kontor ----------
// Henter PDF'en lokalt og åbner mailklienten med et udfyldt udkast; montøren
// vedhæfter selv PDF'en. Markér som sendt og gem FØR mailto åbnes, da
// navigationen til mailklienten kan afbryde resten af funktionen.
async function sendToOffice(): Promise<void> {
  if (!survey.kunde.navn.trim() && !survey.kunde.adresse.trim()) {
    toast('Udfyld mindst kundenavn eller adresse');
    return;
  }
  if (survey.sendState === 'sent' && !confirm('Skemaet er allerede sendt. Send igen?')) return;

  try {
    survey.sendState = 'sent';
    await persist();
    if ($('#drawer')?.classList.contains('open')) await refreshJobs();
    toast('PDF hentet — vedhæft den i mailen');
    await sendFlow(survey);
  } catch (e) {
    console.error(e);
    toast('Kunne ikke danne PDF');
  }
}

// ---------- net-status ----------
function renderNet(): void {
  const pill = $('#net-pill');
  if (!pill) return;
  const online = navigator.onLine;
  pill.dataset.state = online ? 'online' : 'offline';
  pill.querySelector('.label')!.textContent = online ? 'Online' : 'Offline';
}

// ---------- opstart ----------
async function bootstrap(): Promise<void> {
  await migrateLegacyDraft();
  const all = await listSurveys();
  const activeId = getActiveId();
  const found = (activeId && all.find((s) => s.id === activeId)) || all[0] || null;
  if (found) {
    survey = found;
    setActiveId(survey.id);
  } else {
    survey = blankSurvey();
    await persist();
  }
}

async function init(): Promise<void> {
  bindAll();
  setupSketch();
  setupPhotos();

  $('#btn-new')?.addEventListener('click', () => void newSurvey());
  $('#btn-new2')?.addEventListener('click', () => void newSurvey());
  $('#btn-jobs')?.addEventListener('click', openDrawer);
  $('#btn-pdf')?.addEventListener('click', () => void exportPdf());
  $('#btn-send')?.addEventListener('click', () => void sendToOffice());
  $('#scrim')?.addEventListener('click', closeDrawer);
  window.addEventListener('online', renderNet);
  window.addEventListener('offline', renderNet);
  document.addEventListener('pwa:offline-ready', () => toast('Klar til offline-brug'));

  renderNet();
  await bootstrap();
  populate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init());
} else {
  void init();
}
