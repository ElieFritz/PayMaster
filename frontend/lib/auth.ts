export const ACCESS_TOKEN_COOKIE = 'paymaster_access_token';
export const USER_ROLE_COOKIE = 'paymaster_user_role';
export const USER_EMAIL_COOKIE = 'paymaster_user_email';

export type UserRole = 'ADMIN' | 'ACCOUNTANT';

export function isUserRole(value: string | undefined | null): value is UserRole {
  return value === 'ADMIN' || value === 'ACCOUNTANT';
}
