import { User } from 'firebase/auth';
import { doc, getDoc, query, collection, where, getDocs, limit } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { AccessStatus, UserRole, Customer, Branch } from './types';

/**
 * SuperAdmin exclusivo inicial (control total, gestión de sedes, permisos y módulo financiero).
 */
export const AUTHORIZED_SUPERADMIN_EMAILS: string[] = [
  'crestrepol.kyg@gmail.com',
];

/**
 * Administradores de sucursal iniciales.
 */
export const DEFAULT_BRANCH_ADMIN_EMAILS: string[] = [
  'maurito0615@gmail.com',
];

export const AUTHORIZED_ADMIN_EMAILS: string[] = [
  ...AUTHORIZED_SUPERADMIN_EMAILS,
  ...DEFAULT_BRANCH_ADMIN_EMAILS,
];

const ADMIN_SESSION_KEY = 'katalog_admin_session';

export function isAuthorizedSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();

  const envSuperAdmins = process.env.NEXT_PUBLIC_SUPERADMIN_EMAILS;
  if (envSuperAdmins) {
    const envList = envSuperAdmins.toLowerCase().split(',').map((e) => e.trim()).filter(Boolean);
    if (envList.includes(cleanEmail)) return true;
  }

  return AUTHORIZED_SUPERADMIN_EMAILS.some(
    (sa) => sa.toLowerCase().trim() === cleanEmail
  );
}

export function isAuthorizedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();

  if (isAuthorizedSuperAdminEmail(cleanEmail)) return true;

  const envAdmins = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  if (envAdmins) {
    const envList = envAdmins.toLowerCase().split(',').map((e) => e.trim()).filter(Boolean);
    if (envList.includes(cleanEmail)) return true;
  }

  return AUTHORIZED_ADMIN_EMAILS.some(
    (adminEmail) => adminEmail.toLowerCase().trim() === cleanEmail
  );
}

/**
 * Determina el rol exacto de un usuario autenticado.
 */
export async function getUserRole(
  user: User | null,
  cachedProfile?: Customer | null
): Promise<UserRole> {
  if (!user) return 'cliente';

  const userEmail = user.email ? user.email.toLowerCase().trim() : '';

  if (userEmail && isAuthorizedSuperAdminEmail(userEmail)) {
    return 'superadmin';
  }

  if (cachedProfile?.rol) {
    if (cachedProfile.rol === 'superadmin') return 'superadmin';
    if (cachedProfile.rol === 'admin') return 'admin';
    if (cachedProfile.rol === 'vendedor') return 'vendedor';
    if (cachedProfile.rol === 'emprendedor') return 'emprendedor';
    if (cachedProfile.rol === 'cliente') return 'cliente';
  }

  if (userEmail && isAuthorizedAdminEmail(userEmail)) {
    return 'admin';
  }

  if (isFirebaseConfigured() && db) {
    try {
      if (user.uid) {
        const clientDoc = await getDoc(doc(db, 'clientes', user.uid));
        if (clientDoc.exists()) {
          const data = clientDoc.data();
          if (data?.rol) return data.rol as UserRole;
        }

        const qUid = query(collection(db, 'clientes'), where('uid', '==', user.uid), limit(1));
        const snapUid = await getDocs(qUid);
        if (!snapUid.empty) {
          const data = snapUid.docs[0].data();
          if (data?.rol) return data.rol as UserRole;
        }
      }

      if (userEmail) {
        const qEmail = query(collection(db, 'clientes'), where('email', '==', userEmail), limit(1));
        const snapEmail = await getDocs(qEmail);
        if (!snapEmail.empty) {
          const data = snapEmail.docs[0].data();
          if (data?.rol) return data.rol as UserRole;
        }
      }
    } catch (e) {
      console.warn('Error resolviendo rol en Firestore:', e);
    }
  }

  return 'cliente';
}

export function isSuperAdmin(role?: UserRole | string, email?: string | null): boolean {
  if (role === 'superadmin') return true;
  return isAuthorizedSuperAdminEmail(email);
}

/**
 * Resuelve el estado de acceso efectivo de un usuario.
 * Un SuperAdmin por lista blanca siempre está aprobado; el resto requiere `estado_acceso === 'aprobado'`.
 */
export function resolveAccessStatus(
  customer: Customer | null,
  role?: UserRole,
  email?: string | null
): AccessStatus | 'visitante' {
  if (!customer && !isAuthorizedSuperAdminEmail(email)) {
    return 'visitante';
  }
  if (isSuperAdmin(role || customer?.rol, email || customer?.email)) {
    return 'aprobado';
  }
  if (customer?.estado_acceso) {
    return customer.estado_acceso;
  }
  if (isAuthorizedAdminEmail(email || customer?.email)) {
    return 'aprobado';
  }
  return 'pendiente';
}

export function canViewPrices(
  customer: Customer | null,
  role?: UserRole,
  email?: string | null
): boolean {
  return resolveAccessStatus(customer, role, email) === 'aprobado';
}

export function canUseCart(
  customer: Customer | null,
  role?: UserRole,
  email?: string | null
): boolean {
  return canViewPrices(customer, role, email);
}

export function canUseWhiteLabel(customer: Customer | null): boolean {
  if (!customer) return false;
  if (customer.rol !== 'emprendedor') return false;
  if (customer.estado_acceso !== 'aprobado') return false;
  if (!customer.whiteLabelEnabled) return false;
  if (customer.subscriptionStatus === 'expired') return false;
  return true;
}

export async function checkIsAdmin(user: User | null): Promise<boolean> {
  if (!user) return false;
  if (isAuthorizedSuperAdminEmail(user.email)) return true;

  const role = await getUserRole(user);
  if (role === 'superadmin') return true;
  if (role !== 'admin') return false;

  if (isAuthorizedAdminEmail(user.email)) return true;

  // Si es admin por Firestore, validar además que su acceso siga aprobado
  if (isFirebaseConfigured() && db) {
    try {
      const snap = await getDoc(doc(db, 'clientes', user.uid));
      if (snap.exists()) {
        const data = snap.data() as Customer;
        return data.estado_acceso === 'aprobado';
      }
    } catch {
      return false;
    }
  }
  return false;
}

export function getUserAllowedBranches(
  role: UserRole,
  profile?: Customer | null,
  allBranches?: Branch[]
): string[] {
  if (role === 'superadmin') {
    if (allBranches && allBranches.length > 0) {
      return allBranches.map((b) => b.slug);
    }
    return ['*'];
  }

  if (role === 'admin') {
    if (profile?.assigned_branches && profile.assigned_branches.length > 0) {
      return profile.assigned_branches;
    }
    if (profile?.sucursal) {
      return [profile.sucursal];
    }
    return ['costarica'];
  }

  if (profile?.sucursal) {
    return [profile.sucursal];
  }
  return ['costarica'];
}

export function canAccessFinancialModule(role?: UserRole, email?: string | null): boolean {
  return isSuperAdmin(role, email);
}

export function canManageUserRoles(role?: UserRole, email?: string | null): boolean {
  return isSuperAdmin(role, email);
}

export function canManagePriceLists(role?: UserRole, email?: string | null): boolean {
  return role === 'superadmin' || role === 'admin' || isAuthorizedAdminEmail(email);
}

export function clearAdminSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem('katalog_active_branch');
  }
}

export function setAdminSession(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(ADMIN_SESSION_KEY, 'active');
  }
}

export function hasAdminSessionFlag(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ADMIN_SESSION_KEY) === 'active';
}
