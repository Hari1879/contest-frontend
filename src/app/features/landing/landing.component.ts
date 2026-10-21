import { Component, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CAMPAIGN_CONFIG } from '../../core/config/campaign.config';
import { AnalyticsService } from '../../core/services/analytics.service';
import { EntryStateService } from '../../core/services/entry-state.service';

@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements OnInit {
  protected readonly config = inject(CAMPAIGN_CONFIG);
  private readonly analytics = inject(AnalyticsService);
  protected readonly state = toSignal(inject(EntryStateService).state, { requireSync: true });

  ngOnInit(): void {
    this.analytics.track('landing_viewed');
  }
}
