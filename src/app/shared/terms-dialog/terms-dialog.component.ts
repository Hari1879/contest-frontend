import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { TERMS_VERSION } from '../../core/config/terms';

export { TERMS_VERSION };

@Component({
  selector: 'app-terms-dialog',
  templateUrl: './terms-dialog.component.html',
  styleUrl: './terms-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsDialogComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Output() accepted = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('body') private body?: ElementRef<HTMLElement>;

  protected reachedEnd = false;
  protected agreed = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private previousOverflow = '';
  private locked = false;
  private checkTimer: ReturnType<typeof setTimeout> | undefined;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open']) return;
    if (this.open) {
      this.reachedEnd = false;
      this.agreed = false;
      this.lockScroll();
      // Wait for the dialog to render, then reset scroll and check whether the text already fits.
      clearTimeout(this.checkTimer);
      this.checkTimer = setTimeout(() => {
        const el = this.body?.nativeElement;
        if (el) el.scrollTop = 0;
        this.checkScroll();
      });
    } else {
      this.unlockScroll();
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.checkTimer);
    this.unlockScroll();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open) this.close();
  }

  protected checkScroll(): void {
    const el = this.body?.nativeElement;
    if (!el || this.reachedEnd) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      this.reachedEnd = true;
      this.cdr.markForCheck();
    }
  }

  protected onAgreeChange(e: Event): void {
    this.agreed = this.reachedEnd && (e.target as HTMLInputElement).checked;
  }

  protected accept(): void {
    if (!this.reachedEnd || !this.agreed) return;
    this.unlockScroll();
    this.accepted.emit(TERMS_VERSION);
  }

  protected close(): void {
    this.unlockScroll();
    this.closed.emit();
  }

  private lockScroll(): void {
    if (this.locked) return;
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this.locked = true;
  }

  private unlockScroll(): void {
    if (!this.locked) return;
    document.body.style.overflow = this.previousOverflow;
    this.locked = false;
  }
}
