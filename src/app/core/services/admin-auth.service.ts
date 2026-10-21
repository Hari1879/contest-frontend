import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CAMPAIGN_CONFIG } from '../config/campaign.config';

export interface AdminLoginResponse {
  token: string;
  user: { email: string };
}

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(CAMPAIGN_CONFIG);

  private get authUrl(): string {
    return `${this.config.rewardsApiBaseUrl.replace(/\/+$/, '')}/admin/auth`;
  }

  get token(): string {
    try {
      return typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem('admin-session-token') ?? '';
    } catch {
      return '';
    }
  }

  login(email: string, password: string): Observable<AdminLoginResponse> {
    return this.http.post<AdminLoginResponse>(`${this.authUrl}/login`, { email, password });
  }

  logout(): Observable<unknown> {
    return this.http.post<unknown>(`${this.authUrl}/logout`, null, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
  }

  forgotPassword(email: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.authUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<unknown> {
    return this.http.post<unknown>(`${this.authUrl}/reset-password`, {
      token,
      new_password: newPassword,
    });
  }

  saveToken(token: string): void {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('admin-session-token', token);
    } catch {
      // The server session remains authoritative if browser storage is unavailable.
    }
  }

  clearToken(): void {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('admin-session-token');
    } catch {
      // Storage may be unavailable; the session will still fail closed on the next request.
    }
  }
}