import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="account-container">
      <h1>My Account</h1>
      <p>Account functionality coming soon...</p>
    </div>
  `,
  styles: [`
    .account-container {
      padding: 2rem;
    }
  `]
})
export class AccountComponent {}