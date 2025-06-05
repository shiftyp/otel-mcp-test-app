export interface User {
  id: string; // Or number, depending on your DB schema (e.g., UUID or auto-incrementing int)
  username: string;
  email: string;
  passwordHash: string; // Store hashed passwords, never plain text
  firstName?: string;
  lastName?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Example of a Data Transfer Object (DTO) for user creation, excluding sensitive/generated fields
export interface CreateUserDTO {
  username: string;
  email: string;
  password_plaintext: string; // This would be hashed before saving
  firstName?: string;
  lastName?: string;
}

// Example DTO for user response, omitting sensitive data like passwordHash
export interface UserResponseDTO {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt: string; // Often converted to ISO string for API responses
  updatedAt: string;
}
