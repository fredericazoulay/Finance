import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

interface WorkGroup {
  code: string;
  typeKey: string;
  detailKey?: string;
}

@Component({
  selector: 'app-group-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule],
  templateUrl: './group-page.component.html',
  styleUrls: ['./group-page.component.scss']
})
export class GroupPageComponent implements OnInit {
  readonly groups: WorkGroup[] = [
    { code: 'BO', typeKey: 'group_type_processing' },
    { code: 'BO_ANALYSE', typeKey: 'group_type_fo', detailKey: 'group_detail_fod1' },
    { code: 'BO_CASH', typeKey: 'group_type_processing' },
    { code: 'BO_COMPTA', typeKey: 'group_type_processing', detailKey: 'group_detail_configurator' },
    { code: 'BO_EOD', typeKey: 'group_type_processing' },
    { code: 'BO_EXT', typeKey: 'group_type_processing' },
    { code: 'BO_EXTOTPL', typeKey: 'group_type_pl' },
    { code: 'BO_EXTEPEL', typeKey: 'group_type_pl' },
    { code: 'BO_EXTVMPL', typeKey: 'group_type_pl' },
    { code: 'BO_EXT_OTC', typeKey: 'group_type_processing' },
    { code: 'BO_EXT_PE', typeKey: 'group_type_processing' },
    { code: 'BO_EXT_VMO', typeKey: 'group_type_processing' },
    { code: 'BO_MANAGER', typeKey: 'group_type_operations' },
    { code: 'BO_OPS', typeKey: 'group_type_operations' },
    { code: 'BO_OPS_FLX', typeKey: 'group_type_operations' }
  ];

  searchQuery = '';
  favoritesOnly = false;
  selectedGroup = '';
  favoriteGroups = new Set<string>();

  ngOnInit(): void {
    try {
      const selectedGroup = localStorage.getItem('murexSelectedGroup');
      if (selectedGroup && this.groups.some(group => group.code === selectedGroup)) {
        this.selectedGroup = selectedGroup;
      }

      const storedFavorites = JSON.parse(localStorage.getItem('murexFavoriteGroups') ?? '[]');
      if (Array.isArray(storedFavorites)) {
        this.favoriteGroups = new Set(storedFavorites.filter((value: unknown): value is string =>
          typeof value === 'string' && this.groups.some(group => group.code === value)
        ));
      }
    } catch {
      this.favoriteGroups = new Set<string>();
    }
  }

  get visibleGroups(): WorkGroup[] {
    const query = this.searchQuery.trim().toLocaleLowerCase();
    return this.groups.filter(group => {
      const matchesQuery = !query || group.code.toLocaleLowerCase().includes(query);
      const matchesFavorite = !this.favoritesOnly || this.favoriteGroups.has(group.code);
      return matchesQuery && matchesFavorite;
    });
  }

  selectGroup(code: string): void {
    this.selectedGroup = code;
    try {
      localStorage.setItem('murexSelectedGroup', code);
    } catch {
      this.selectedGroup = code;
    }
  }

  toggleFavorite(code: string): void {
    const nextFavorites = new Set(this.favoriteGroups);
    if (nextFavorites.has(code)) {
      nextFavorites.delete(code);
    } else {
      nextFavorites.add(code);
    }
    this.favoriteGroups = nextFavorites;
    try {
      localStorage.setItem('murexFavoriteGroups', JSON.stringify([...nextFavorites]));
    } catch {
      this.favoriteGroups = nextFavorites;
    }
  }

  isFavorite(code: string): boolean {
    return this.favoriteGroups.has(code);
  }
}