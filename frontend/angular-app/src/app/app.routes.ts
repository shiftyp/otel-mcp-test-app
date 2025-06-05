import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/products',
    pathMatch: 'full'
  },
  {
    path: 'products',
    loadComponent: () => import('./components/product-list/product-list.component').then(m => m.ProductListComponent)
  },
  {
    path: 'products-beta',
    loadComponent: () => import('./components/product-list/product-list-with-flags.component').then(m => m.ProductListWithFlagsComponent)
  },
  {
    path: 'products/:id',
    loadComponent: () => import('./components/product-detail/product-detail.component').then(m => m.ProductDetailComponent)
  },
  {
    path: 'search',
    loadComponent: () => import('./components/product-search/product-search.component').then(m => m.ProductSearchComponent)
  },
  {
    path: 'cart',
    loadComponent: () => import('./components/cart/cart.component').then(m => m.CartComponent)
  },
  {
    path: 'cart-telemetry',
    loadComponent: () => import('./components/cart/cart-with-telemetry.component').then(m => m.CartWithTelemetryComponent)
  },
  {
    path: 'account',
    loadComponent: () => import('./components/account/account.component').then(m => m.AccountComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./components/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: '**',
    redirectTo: '/products'
  }
];