import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ConflictBucket {
  poolCode?: string;
  tierNo?: number;
  dayNo?: number;
  claimed?: number;
  target?: number;
}

export type AdminHttpEvent =
  | { kind: 'unauthorized' }
  | { kind: 'conflict'; message: string; buckets: ConflictBucket[] }
  | { kind: 'error'; message: string };

/** Bridges the admin HTTP interceptor to the lazy admin shell (dialogs, toasts, redirects). */
@Injectable({ providedIn: 'root' })
export class AdminEventsService {
  readonly events = new Subject<AdminHttpEvent>();
}
