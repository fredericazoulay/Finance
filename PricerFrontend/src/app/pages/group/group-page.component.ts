import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { WorkGroup, WorkGroupService } from '../../services/work-group.service';

@Component({
  selector: 'app-group-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule],
  templateUrl: './group-page.component.html',
  styleUrls: ['./group-page.component.scss']
})
export class GroupPageComponent implements OnInit {
  searchQuery = '';
  favoritesOnly = false;
  favoriteGroups = new Set<string>();

  constructor(readonly workGroupService: WorkGroupService) {}

  get groups(): WorkGroup[] {
    return this.workGroupService.groups;
  }

  get selectedGroup(): string {
    return this.workGroupService.selectedGroup;
  }

  ngOnInit(): void {
    try {
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
    this.workGroupService.setSelectedGroup(code);
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