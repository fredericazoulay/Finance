import { Routes } from '@angular/router';
import { PricingPageComponent } from './pages/pricing/pricing-page.component';
import { CalculatorsPageComponent } from './pages/calculators/calculators-page.component';
import { PresentationPageComponent } from './pages/presentation/presentation-page.component';

export const routes: Routes = [
  {
    path: 'presentation',
    component: PresentationPageComponent
  },
  {
    path: 'pricing/:product',
    component: PricingPageComponent
  },
  {
    path: 'pricing',
    redirectTo: 'pricing/EQTY_OPT',
    pathMatch: 'full'
  },
  {
    path: 'calculators/:id',
    component: CalculatorsPageComponent
  },
  {
    path: 'calculators',
    redirectTo: 'calculators/loan',
    pathMatch: 'full'
  },
  {
    path: '',
    redirectTo: 'pricing/EQTY_OPT',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'pricing/EQTY_OPT'
  }
];
