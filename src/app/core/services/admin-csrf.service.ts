import { Injectable } from '@angular/core';

const KEY = 'admin-csrf';

/** Holds the CSRF token from the login response; the `admin_csrf` cookie is scoped to /api/admin so page scripts cannot read it. */
@Injectable({ providedIn: 'root' })
export class AdminCsrfService {
  get token(): string {
    try {
      return sessionStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  }

  set(token: string): void {
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      // Without storage the token is lost on reload and the next change returns 401.
    }
  }

  clear(): void {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  }
}
