import { Injectable, signal } from '@angular/core';

/** Tracks online/offline so submission is only possible while online (§8). */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
  }
}
