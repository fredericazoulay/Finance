import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  readonly instruments = [
    { code: 'EQTY_OPT', labelKey: 'EQTY_OPT' },
    { code: 'IRS', labelKey: 'IRS' },
    { code: 'CDS', labelKey: 'CDS' },
    { code: 'FXC', labelKey: 'FXC' },
    { code: 'BOND', labelKey: 'BOND' },
    { code: 'EQUITY', labelKey: 'EQUITY' }
  ];
}
