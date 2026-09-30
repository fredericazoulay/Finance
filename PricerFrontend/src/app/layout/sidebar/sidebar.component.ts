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
    { code: 'EQTY_OPT', labelKey: 'EQTY_OPT', icon: '🧾' },
    { code: 'IRS', labelKey: 'IRS', icon: '📈' },
    { code: 'CDS', labelKey: 'CDS', icon: '🛡️' },
    { code: 'FXC', labelKey: 'FXC', icon: '💱' },
    { code: 'BOND', labelKey: 'BOND', icon: '🏛️' },
    { code: 'EQUITY', labelKey: 'EQUITY', icon: '📊' }
  ];
  collapsed = false;

  toggle(): void {
    this.collapsed = !this.collapsed;
  }
  // Collapse the Instruments group (hide labels)
  // default to false so all instruments are visible
  instrumentsCollapsed = false;

  toggleInstruments(): void {
    this.instrumentsCollapsed = !this.instrumentsCollapsed;
  }
}
