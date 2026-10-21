import { Routes } from '@angular/router';
import {
  confirmationGuard,
  adminGuard,
  entryGuard,
  scratchGuard,
  statusGuard,
} from './core/guards/flow.guards';
import { LandingComponent } from './features/landing/landing.component';

export const routes: Routes = [
  { path: '', component: LandingComponent, title: 'V FEST' },
  {
    path: 'enter',
    canActivate: [entryGuard],
    title: 'Enter the contest',
    loadComponent: () =>
      import('./features/entry-form/entry-form.component').then((m) => m.EntryFormComponent),
  },
  {
    path: 'scratch',
    canActivate: [scratchGuard],
    title: 'Reveal your result',
    // Lazy — keeps the canvas code out of the initial bundle (§9 Performance).
    loadComponent: () =>
      import('./features/scratch/scratch-page.component').then((m) => m.ScratchPageComponent),
  },
  {
    path: 'claim/:token',
    canActivate: [scratchGuard],
    title: 'Claim your reward',
    loadComponent: () =>
      import('./features/scratch/scratch-page.component').then((m) => m.ScratchPageComponent),
  },
  {
    path: 'confirmation',
    canActivate: [confirmationGuard],
    title: 'Your entry receipt',
    loadComponent: () =>
      import('./features/confirmation/confirmation.component').then((m) => m.ConfirmationComponent),
  },
  {
    path: 'status',
    canActivate: [statusGuard],
    title: 'Entry status',
    loadComponent: () =>
      import('./features/status/status.component').then((m) => m.StatusComponent),
  },
  {
    path: 'admin/signup',
    title: 'Create account',
    data: { authMode: 'signup' },
    loadComponent: () =>
      import('./features/admin/admin-auth.component').then((m) => m.AdminAuthComponent),
  },
  {
    path: 'admin/forgot-password',
    title: 'Reset admin password',
    data: { authMode: 'forgot' },
    loadComponent: () =>
      import('./features/admin/admin-auth.component').then((m) => m.AdminAuthComponent),
  },
  {
    path: 'admin/reset-password',
    title: 'Choose a new admin password',
    data: { authMode: 'reset' },
    loadComponent: () =>
      import('./features/admin/admin-auth.component').then((m) => m.AdminAuthComponent),
  },
  {
    path: 'admin/daily-activity',
    canActivate: [adminGuard],
    title: 'Daily contest activity',
    loadComponent: () =>
      import('./features/admin/daily-activity.component').then((m) => m.DailyActivityComponent),
  },
  // Lazy admin console (/admin, /admin/login, reward-plan, models, audit).
  {
    path: 'admin',
    loadChildren: () => import('./features/admin-area/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
