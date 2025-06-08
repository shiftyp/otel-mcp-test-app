import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { injectEnvironment } from '../providers/environment.provider';

export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private environment = injectEnvironment();
  private apiUrl = this.environment.userApiUrl || `${this.environment.apiUrl}/users`;
  
  // Signals for reactive auth state
  private currentUserSignal = signal<User | null>(null);
  private isAuthenticatedSignal = signal<boolean>(false);
  
  // Read-only signals
  public currentUser = this.currentUserSignal.asReadonly();
  public isAuthenticated = this.isAuthenticatedSignal.asReadonly();

  constructor(private http: HttpClient) {
    // Check for existing session on initialization
    this.checkExistingSession();
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials)
      .pipe(
        tap(response => {
          this.handleAuthResponse(response);
        })
      );
  }

  register(userData: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, userData)
      .pipe(
        tap(response => {
          this.handleAuthResponse(response);
        })
      );
  }

  logout(): void {
    this.currentUserSignal.set(null);
    this.isAuthenticatedSignal.set(false);
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
    }
  }

  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('authToken');
    }
    return null;
  }

  updateProfile(userId: string, updates: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/${userId}`, updates)
      .pipe(
        tap(updatedUser => {
          this.currentUserSignal.set(updatedUser);
          if (typeof window !== 'undefined') {
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
          }
        })
      );
  }

  deleteAccount(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${userId}`)
      .pipe(
        tap(() => {
          this.logout();
        })
      );
  }

  private handleAuthResponse(response: AuthResponse): void {
    this.currentUserSignal.set(response.user);
    this.isAuthenticatedSignal.set(true);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('authToken', response.token);
      localStorage.setItem('currentUser', JSON.stringify(response.user));
    }
  }

  private checkExistingSession(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('authToken');
      const userStr = localStorage.getItem('currentUser');
      
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr) as User;
          this.currentUserSignal.set(user);
          this.isAuthenticatedSignal.set(true);
        } catch (error) {
          console.error('Error parsing stored user:', error);
          this.logout();
        }
      }
    }
  }
}