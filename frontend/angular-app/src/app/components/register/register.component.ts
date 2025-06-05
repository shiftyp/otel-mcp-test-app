import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="register-container">
      <h1>Register</h1>
      <form>
        <div class="form-group">
          <label for="name">Name</label>
          <input type="text" id="name" placeholder="Enter name" />
        </div>
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" placeholder="Enter email" />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" placeholder="Enter password" />
        </div>
        <button type="submit">Register</button>
      </form>
    </div>
  `,
  styles: [`
    .register-container {
      padding: 2rem;
      max-width: 400px;
      margin: 0 auto;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      margin-bottom: 0.5rem;
    }
    input {
      width: 100%;
      padding: 0.5rem;
    }
  `]
})
export class RegisterComponent {}