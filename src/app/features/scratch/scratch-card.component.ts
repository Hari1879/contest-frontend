import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

/**
 * Canvas "scratch to reveal" card (§6). Purely presentational — the prize is
 * already known; the overlay just hides it.
 *
 * - Pointer Events cover mouse, touch and pen in one code path.
 * - Auto-reveals once ~45% of the foil is cleared.
 * - Keyboard / non-gesture fallback via the "Reveal" button (§9 Accessibility).
 */
@Component({
  selector: 'app-scratch-card',
  templateUrl: './scratch-card.component.html',
  styleUrl: './scratch-card.component.scss',
})
export class ScratchCardComponent {
  /** Accessible label for the hidden content once revealed. */
  readonly revealedLabel = input.required<string>();
  readonly initiallyRevealed = input(false);
  readonly threshold = input(0.45);
  readonly revealed = output<void>();

  protected readonly isRevealed = signal(false);
  protected readonly started = signal(false);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly destroyRef = inject(DestroyRef);

  private ctx!: CanvasRenderingContext2D;
  private drawing = false;
  private last: { x: number; y: number } | null = null;
  private moves = 0;
  private dpr = 1;

  constructor() {
    afterNextRender(() => this.setup());
  }

  /** Programmatic / button reveal. */
  reveal(): void {
    if (this.isRevealed()) return;
    this.isRevealed.set(true);
    this.revealed.emit();
  }

  private setup(): void {
    if (this.initiallyRevealed()) {
      this.isRevealed.set(true);
      return;
    }
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      this.reveal(); // canvas unsupported → just show the result
      return;
    }
    this.ctx = ctx;
    this.paintFoil();

    const ro = new ResizeObserver(() => {
      if (!this.started()) this.paintFoil(); // repaint only before scratching starts
    });
    ro.observe(canvas);

    const down = (e: PointerEvent) => {
      if (this.isRevealed()) return;
      this.drawing = true;
      this.started.set(true);
      canvas.setPointerCapture(e.pointerId);
      this.last = this.point(e);
      this.scratch(this.last, this.last);
    };
    const move = (e: PointerEvent) => {
      if (!this.drawing || this.isRevealed()) return;
      e.preventDefault();
      const p = this.point(e);
      this.scratch(this.last ?? p, p);
      this.last = p;
      if (++this.moves % 8 === 0) this.checkProgress();
    };
    const up = () => {
      if (!this.drawing) return;
      this.drawing = false;
      this.last = null;
      this.checkProgress();
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move, { passive: false });
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    this.destroyRef.onDestroy(() => {
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    });
  }

  private paintFoil(): void {
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * this.dpr);
    canvas.height = Math.round(rect.height * this.dpr);

    const { ctx } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    // Metallic foil
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#b9b3c9');
    g.addColorStop(0.25, '#e9e6f0');
    g.addColorStop(0.5, '#a9a2bb');
    g.addColorStop(0.75, '#dcd8e6');
    g.addColorStop(1, '#9d96b0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Subtle diagonal pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2 * this.dpr;
    for (let x = -h; x < w; x += 14 * this.dpr) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = 'rgba(36,17,74,0.75)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${22 * this.dpr}px system-ui, sans-serif`;
    ctx.fillText('SCRATCH HERE', w / 2, h / 2 - 12 * this.dpr);
    ctx.font = `600 ${13 * this.dpr}px system-ui, sans-serif`;
    ctx.fillText('Use your finger to reveal your reward', w / 2, h / 2 + 16 * this.dpr);
  }

  private point(e: PointerEvent): { x: number; y: number } {
    const r = this.canvasRef().nativeElement.getBoundingClientRect();
    return { x: (e.clientX - r.left) * this.dpr, y: (e.clientY - r.top) * this.dpr };
  }

  private scratch(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 44 * this.dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  /** Sample every Nth pixel's alpha to estimate how much foil is cleared. */
  private checkProgress(): void {
    if (this.isRevealed()) return;
    const canvas = this.canvasRef().nativeElement;
    const { data } = this.ctx.getImageData(0, 0, canvas.width, canvas.height);
    const stride = 4 * 24;
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += stride) {
      total++;
      if (data[i] < 64) clear++;
    }
    if (total && clear / total >= this.threshold()) this.reveal();
  }
}
