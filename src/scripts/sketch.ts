// Genbrugelig tegneflade til planskitsen. Bruges både til det lille inline-felt
// og det store maksimerede felt. Pointer events dækker mus, pen og touch.
// Tegningen gemmes/eksporteres som PNG-dataURL (survey.planskitse.tegning).

const INK = '#16201c';
const LINE_WIDTH = 2.5;

export class SketchPad {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onChange: (data: string) => void;
  private drawing = false;
  private data = '';
  private cssW = 0;
  private cssH = 0;

  constructor(canvas: HTMLCanvasElement, onChange: (data: string) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.onChange = onChange;

    canvas.addEventListener('pointerdown', this.start);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.end);
    canvas.addEventListener('pointercancel', this.end);

    this.fit();
  }

  /** Tilpas backing-store til vist størrelse (skarpe streger på alle skærme). */
  fit(): void {
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    this.cssW = r.width;
    this.cssH = r.height;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    if (this.data) this.drawData(this.data);
  }

  /** Indlæs en eksisterende tegning (skaleres til feltet). */
  load(data: string): void {
    this.data = data || '';
    this.fit();
  }

  /** Den aktuelle tegning som dataURL ('' hvis tom). */
  getData(): string {
    return this.data;
  }

  isEmpty(): boolean {
    return !this.data;
  }

  clear(): void {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    this.data = '';
    this.onChange('');
  }

  private drawData(data: string): void {
    const img = new Image();
    img.onload = () => this.ctx.drawImage(img, 0, 0, this.cssW, this.cssH);
    img.src = data;
  }

  private start = (e: PointerEvent): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    this.drawing = true;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignorér ugyldigt pointerId */
    }
    this.ctx.beginPath();
    this.ctx.moveTo(e.offsetX, e.offsetY);
  };

  private move = (e: PointerEvent): void => {
    if (!this.drawing) return;
    e.preventDefault();
    this.ctx.lineTo(e.offsetX, e.offsetY);
    this.ctx.stroke();
  };

  private end = (): void => {
    if (!this.drawing) return;
    this.drawing = false;
    this.data = this.canvas.toDataURL('image/png');
    this.onChange(this.data);
  };
}
