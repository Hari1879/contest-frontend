import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Renders the legal text from terms-content.html unchanged. */
@Component({
  selector: 'app-terms-body',
  templateUrl: './terms-content.html',
  styleUrl: './terms-body.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsBodyComponent {}
