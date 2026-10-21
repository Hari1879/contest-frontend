import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CAMPAIGN_CONFIG } from '../config/campaign.config';

export interface SignupResponse {
  status: 'pending' | 'approved';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class SignupService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(CAMPAIGN_CONFIG);

  initiateSignup(email: string, password: string): Observable<SignupResponse> {
    const apiBaseUrl = this.config.rewardsApiBaseUrl.replace(/\/+$/, '');
    return this.http.post<SignupResponse>(`${apiBaseUrl}/signup/initiateSignup`, { email, password });
  }
}