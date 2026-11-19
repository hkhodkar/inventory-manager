import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Dashboard · Inventory Manager',
    loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'products',
    title: 'Products · Inventory Manager',
    loadComponent: () => import('./features/products/products-page').then((m) => m.ProductsPage),
  },
  {
    path: 'products/:id',
    title: 'Product · Inventory Manager',
    loadComponent: () =>
      import('./features/products/product-detail-page').then((m) => m.ProductDetailPage),
  },
  {
    path: 'movements',
    title: 'Stock movements · Inventory Manager',
    loadComponent: () => import('./features/movements/movements-page').then((m) => m.MovementsPage),
  },
  {
    path: 'alerts',
    title: 'Low stock · Inventory Manager',
    loadComponent: () => import('./features/alerts/alerts-page').then((m) => m.AlertsPage),
  },
  {
    path: 'suppliers',
    title: 'Suppliers · Inventory Manager',
    loadComponent: () => import('./features/suppliers/suppliers-page').then((m) => m.SuppliersPage),
  },
  {
    path: 'suppliers/:id',
    title: 'Supplier · Inventory Manager',
    loadComponent: () =>
      import('./features/suppliers/supplier-detail-page').then((m) => m.SupplierDetailPage),
  },
  {
    path: 'reports',
    title: 'Reports · Inventory Manager',
    loadComponent: () => import('./features/reports/reports-page').then((m) => m.ReportsPage),
  },
  { path: '**', redirectTo: '' },
];
