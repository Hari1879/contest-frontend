import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CAMPAIGN_CONFIG } from './core/config/campaign.config';
import { EntryStateService } from './core/services/entry-state.service';
import { NetworkStatusService } from './core/services/network-status.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly config = inject(CAMPAIGN_CONFIG);
  protected readonly network = inject(NetworkStatusService);

  constructor() {
    // Capture an optional outlet identifier from the QR/SMS link (?store=CHN-042).
    const store = new URLSearchParams(window.location.search).get('store');
    if (store) inject(EntryStateService).setStoreId(store);
  }
}
