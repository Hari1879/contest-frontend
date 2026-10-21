import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMPAIGN_CONFIG } from '../config/campaign.config';
import { SignupService } from './signup.service';

describe('SignupService', () => {
  let api: SignupService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CAMPAIGN_CONFIG, useValue: { rewardsApiBaseUrl: '/api/' } },
      ],
    });
    api = TestBed.inject(SignupService);
    http = TestBed.inject(HttpTestingController);
  });

  it('posts signup details to the initiation endpoint', () => {
    let result: unknown;
    api.initiateSignup('person@example.com', 'a-long-password').subscribe((response) => (result = response));

    const request = http.expectOne('/api/signup/initiateSignup');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'person@example.com', password: 'a-long-password' });
    request.flush({ status: 'pending', message: 'Signup received' });
    expect(result).toEqual({ status: 'pending', message: 'Signup received' });
  });
});