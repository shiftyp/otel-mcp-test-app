import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="search-bar">
      <input 
        type="text" 
        placeholder="Search for products..." 
        [(ngModel)]="searchQuery"
        (keyup.enter)="onSearch()"
      />
      <button (click)="onSearch()">Search</button>
    </div>
  `,
  styles: [`
    .search-bar {
      flex: 1;
      display: flex;
      max-width: 500px;
    }

    .search-bar input {
      flex: 1;
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 0.25rem 0 0 0.25rem;
      font-size: 1rem;
    }

    .search-bar button {
      padding: 0.5rem 1.5rem;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 0 0.25rem 0.25rem 0;
      cursor: pointer;
      font-weight: 600;
    }

    .search-bar button:hover {
      background-color: #0056b3;
    }
  `]
})
export class SearchBarComponent {
  @Output() search = new EventEmitter<string>();
  searchQuery = '';

  onSearch() {
    if (this.searchQuery.trim()) {
      this.search.emit(this.searchQuery.trim());
    }
  }
}