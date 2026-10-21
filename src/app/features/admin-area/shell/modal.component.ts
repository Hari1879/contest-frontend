import { AfterViewInit, Component, ElementRef, input, output, viewChild } from '@angular/core';

let nextId = 0;

/** Thin wrapper over a native modal <dialog>; render it with @if to open it. */
@Component({
  selector: 'app-modal',
  template: `
    <dialog
      #dlg
      class="a-modal"
      [attr.aria-labelledby]="titleId"
      (cancel)="onCancel($event)"
      (close)="closed.emit()"
    >
      <h2 [id]="titleId">{{ heading() }}</h2>
      <ng-content />
    </dialog>
  `,
})
export class ModalComponent implements AfterViewInit {
  readonly heading = input.required<string>();
  /** Conflict dialogs must not be dismissed with Esc. */
  readonly dismissible = input(true);
  readonly closed = output<void>();

  protected readonly titleId = `a-modal-title-${nextId++}`;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  ngAfterViewInit(): void {
    this.dlg().nativeElement.showModal();
  }

  protected onCancel(event: Event): void {
    if (!this.dismissible()) event.preventDefault();
  }
}
