import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AdminSessionService } from './admin-session.service';

/** Allows the admin area only if GET /api/admin/me confirms a live session. */
export const adminAuthGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AdminSessionService)
    .loadMe()
    .pipe(
      map(() => true),
      catchError(() =>
        of(router.createUrlTree(['/admin/login'], { queryParams: { returnUrl: state.url } })),
      ),
    );
};
