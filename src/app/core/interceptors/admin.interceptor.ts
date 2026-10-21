import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { CAMPAIGN_CONFIG } from '../config/campaign.config';
import { AdminCsrfService } from '../services/admin-csrf.service';
import { AdminEventsService } from '../services/admin-events.service';

const CSRF_HEADER = 'X-CSRF-Token';
const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface ErrorBody {
  message?: string | string[];
  buckets?: { poolCode?: string; tierNo?: number; dayNo?: number; claimed?: number; target?: number }[];
}

function messageOf(error: HttpErrorResponse, fallback: string): string {
  const m = (error.error as ErrorBody | null)?.message;
  return Array.isArray(m) ? m.join(' ') : (m ?? fallback);
}

/** Admin API only: session cookie, CSRF header on mutations, central error handling. */
export const adminInterceptor: HttpInterceptorFn = (req, next) => {
  const base = `${inject(CAMPAIGN_CONFIG).rewardsApiBaseUrl.replace(/\/+$/, '')}/admin/`;
  if (!req.url.startsWith(base)) return next(req);

  const events = inject(AdminEventsService);
  const csrf = MUTATIONS.has(req.method) ? inject(AdminCsrfService).token : '';
  const request = req.clone({
    withCredentials: true,
    ...(csrf ? { setHeaders: { [CSRF_HEADER]: csrf } } : {}),
  });
  const isLogin = req.url === `${base}auth/login`;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);
      const emit = (e: Parameters<typeof events.events.next>[0]): void => events.events.next(e);
      switch (error.status) {
        case 401:
          if (!isLogin) emit({ kind: 'unauthorized' });
          break;
        case 403:
          emit({ kind: 'error', message: messageOf(error, 'You do not have permission to do that.') });
          break;
        case 409:
          emit({
            kind: 'conflict',
            message: messageOf(error, 'Someone else changed this draft.'),
            buckets: (error.error as ErrorBody | null)?.buckets ?? [],
          });
          break;
        case 400:
          emit({ kind: 'error', message: messageOf(error, 'The server rejected the request.') });
          break;
        case 429:
          emit({ kind: 'error', message: 'Too many requests. Try again in a minute.' });
          break;
        case 503:
          emit({ kind: 'error', message: 'The service is temporarily unavailable.' });
          break;
      }
      return throwError(() => error);
    }),
  );
};
