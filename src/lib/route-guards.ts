import { getRoles, type RoleSnapshot } from './roles';

function redirectToLogin(returnPath?: string): never {
  const target = returnPath ?? window.location.pathname + window.location.search;
  window.location.href = `/login/?return=${encodeURIComponent(target)}`;
  // never returns
  throw new Error('redirecting to /login/');
}

function redirectTo(path: string): never {
  window.location.href = path;
  throw new Error(`redirecting to ${path}`);
}

/**
 * Require any logged-in user. Redirects to /login/ otherwise.
 */
export async function requireLogin(): Promise<RoleSnapshot> {
  const snapshot = await getRoles();
  if (!snapshot.user) redirectToLogin();
  return snapshot;
}

/**
 * Require club_admin or super_admin role.
 * - No user → /login/
 * - Logged-in but not admin → /dashboard/register/ (suggest applying)
 */
export async function requireClubAdmin(): Promise<RoleSnapshot> {
  const snapshot = await getRoles();
  if (!snapshot.user) redirectToLogin();
  if (snapshot.clubSlugs.length === 0 && !snapshot.isSuperAdmin) {
    redirectTo('/dashboard/register/');
  }
  return snapshot;
}

/**
 * Require super_admin role.
 * - No user → /login/
 * - Not super-admin → / (home)
 */
export async function requireSuperAdmin(): Promise<RoleSnapshot> {
  const snapshot = await getRoles();
  if (!snapshot.user) redirectToLogin();
  if (!snapshot.isSuperAdmin) redirectTo('/');
  return snapshot;
}
