export type User = {
  id: string;
  email: string;
  nombre: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type AuthResult =
  | { success: true; user: User }
  | { success: false; error: string };
