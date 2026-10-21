import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { adminAuthGuard } from './admin-auth.guard';
import { AdminSessionService } from './admin-session.service';

describe('adminAuthGuard', () => {
  afterEach(() => TestBed.resetTestingModule());

  function run(me: Observable<unknown>): Promise<boolean | UrlTree> {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminSessionService, useValue: { loadMe: () => me } }],
    });
    const state = { url: '/admin/reward-plan' } as RouterStateSnapshot;
    const result = TestBed.runInInjectionContext(() => adminAuthGuard({} as never, state));
    return firstValueFrom(result as Observable<boolean | UrlTree>);
  }

  it('allows navigation when /admin/me succeeds', async () => {
    expect(await run(of({ id: '1', email: 'a@b.c', role: 'admin' }))).toBe(true);
  });

  it('redirects to login with the return URL when /admin/me fails', async () => {
    const result = await run(throwError(() => new Error('401')));
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/admin/login?returnUrl=%2Fadmin%2Freward-plan',
    );
  });
});
