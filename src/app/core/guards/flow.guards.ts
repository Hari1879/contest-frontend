import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';
import { EntryStateService } from '../services/entry-state.service';

/** Scratch card only after a successful, not-yet-revealed submission (§8 Routing). */
export const scratchGuard: CanActivateFn = () => {
  const state = inject(EntryStateService).snapshot;
  const router = inject(Router);
  if (!state.completed) return router.parseUrl('/');
  // Revealed claim sessions must be resumable after returning from the payout provider.
  if (state.completed.revealed && !state.completed.claimUrl) return router.parseUrl('/confirmation');
  return true;
};

/** Receipt only after the card has been revealed. */
export const confirmationGuard: CanActivateFn = () => {
  const state = inject(EntryStateService).snapshot;
  const router = inject(Router);
  if (!state.completed) return router.parseUrl('/');
  if (!state.completed.revealed) return router.parseUrl('/scratch');
  return true;
};

/** Business outcome screens are only available after a completed response. */
export const statusGuard: CanActivateFn = () => {
  const { lastOutcome } = inject(EntryStateService).snapshot;
  const ok = ['not_won', 'duplicate', 'campaign_closed', 'model_not_eligible'].includes(lastOutcome?.kind ?? '');
  return ok || inject(Router).parseUrl('/');
};

/** If a result is pending, send the user back to it instead of a fresh form. */
export const entryGuard: CanActivateFn = () => {
  const state = inject(EntryStateService).snapshot;
  const router = inject(Router);
  if (state.completed && !state.completed.revealed) return router.parseUrl('/scratch');
  return true;
};

/** Admin activity requires a signed-in, verified admin session. */
export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = inject(AdminAuthService);
  return auth.token
    ? true
    : router.createUrlTree(['/admin/login'], {
        queryParams: { returnUrl: '/admin/daily-activity', reason: 'session-required' },
      });
};
