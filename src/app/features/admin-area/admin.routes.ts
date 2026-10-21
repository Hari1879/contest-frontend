import { Routes } from '@angular/router';
import { adminAuthGuard } from './data/admin-auth.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: 'login',
    title: 'Admin sign in',
    loadComponent: () => import('./pages/login.component').then((m) => m.AdminLoginComponent),
  },
  {
    path: '',
    canActivate: [adminAuthGuard],
    loadComponent: () => import('./shell/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Admin dashboard',
        loadComponent: () => import('./pages/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'reward-plan',
        title: 'Reward plan',
        loadComponent: () =>
          import('./pages/reward-plan.component').then((m) => m.RewardPlanComponent),
      },
      {
        path: 'models',
        title: 'Phone models',
        loadComponent: () => import('./pages/models.component').then((m) => m.ModelsComponent),
      },
      {
        path: 'audit',
        title: 'Audit log',
        loadComponent: () => import('./pages/audit.component').then((m) => m.AuditComponent),
      },
    ],
  },
];
