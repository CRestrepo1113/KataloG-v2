'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase';
import { UserRole, Customer, Branch } from './types';
import {
  getUserRole,
  isSuperAdmin as checkSuperAdmin,
  getUserAllowedBranches,
  canAccessFinancialModule,
  canManageUserRoles,
  canManagePriceLists,
  isAuthorizedSuperAdminEmail,
  isAuthorizedAdminEmail,
} from './auth';
import { fetchCustomerProfile, saveCustomerProfile } from './firestore';

interface AdminAuthContextType {
  adminUser: User | null;
  adminProfile: Customer | null;
  role: UserRole;
  isSuperAdmin: boolean;
  allowedBranchSlugs: string[];
  canAccessBranch: (branchSlug: string) => boolean;
  canManageRoles: boolean;
  canManagePrices: boolean;
  canAccessFinancials: boolean;
  loading: boolean;
  refreshAdminProfile: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
  adminUser: null,
  adminProfile: null,
  role: 'cliente',
  isSuperAdmin: false,
  allowedBranchSlugs: ['*'],
  canAccessBranch: () => true,
  canManageRoles: false,
  canManagePrices: false,
  canAccessFinancials: false,
  loading: true,
  refreshAdminProfile: async () => {},
});

export const AdminAuthProvider: React.FC<{
  children: React.ReactNode;
  branches?: Branch[];
}> = ({ children, branches = [] }) => {
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<Customer | null>(null);
  const [role, setRole] = useState<UserRole>('cliente');
  const [loading, setLoading] = useState<boolean>(() => Boolean(isFirebaseConfigured() && auth));

  const resolveAuth = useCallback(async (user: User | null) => {
    if (!user) {
      setAdminUser(null);
      setAdminProfile(null);
      setRole('cliente');
      setLoading(false);
      return;
    }

    setAdminUser(user);
    try {
      let profile = await fetchCustomerProfile(user.uid);
      const resolvedRole = await getUserRole(user, profile);

      // Auto-inicialización segura en v2 para SuperAdmin autorizado sin documento previo
      if (!profile && resolvedRole === 'superadmin') {
        profile = await saveCustomerProfile({
          id: user.uid,
          uid: user.uid,
          nombre: user.displayName || 'SuperAdmin',
          email: user.email || '',
          rol: 'superadmin',
          estado_acceso: 'aprobado',
          sucursal: 'costarica',
          pais: 'Costa Rica',
          lista_precio: 'mayoreo',
          allowedPriceLists: ['unit', 'dozen', 'wholesale'],
        });
      }

      setAdminProfile(profile);
      setRole(resolvedRole);
    } catch (e) {
      console.warn('Error resolviendo sesión administrativa:', e);
      if (isAuthorizedSuperAdminEmail(user.email)) {
        setRole('superadmin');
      } else if (isAuthorizedAdminEmail(user.email)) {
        setRole('admin');
      } else {
        setRole('cliente');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFirebaseConfigured() && auth) {
      const unsub = onAuthStateChanged(auth, (user) => {
        resolveAuth(user);
      });
      return () => unsub();
    }
  }, [resolveAuth]);

  const refreshAdminProfile = useCallback(async () => {
    if (adminUser) {
      await resolveAuth(adminUser);
    }
  }, [adminUser, resolveAuth]);

  const isSuperAdminUser = useMemo(() => {
    return checkSuperAdmin(role, adminUser?.email);
  }, [role, adminUser]);

  const allowedBranchSlugs = useMemo(() => {
    return getUserAllowedBranches(role, adminProfile, branches);
  }, [role, adminProfile, branches]);

  const canAccessBranch = useCallback(
    (branchSlug: string): boolean => {
      if (isSuperAdminUser) return true;
      if (allowedBranchSlugs.includes('*')) return true;
      return allowedBranchSlugs.includes(branchSlug);
    },
    [isSuperAdminUser, allowedBranchSlugs]
  );

  const canManageRoles = useMemo(() => {
    return canManageUserRoles(role, adminUser?.email);
  }, [role, adminUser]);

  const canManagePrices = useMemo(() => {
    return canManagePriceLists(role, adminUser?.email);
  }, [role, adminUser]);

  const canAccessFinancials = useMemo(() => {
    return canAccessFinancialModule(role, adminUser?.email);
  }, [role, adminUser]);

  const value = useMemo(
    () => ({
      adminUser,
      adminProfile,
      role,
      isSuperAdmin: isSuperAdminUser,
      allowedBranchSlugs,
      canAccessBranch,
      canManageRoles,
      canManagePrices,
      canAccessFinancials,
      loading,
      refreshAdminProfile,
    }),
    [
      adminUser,
      adminProfile,
      role,
      isSuperAdminUser,
      allowedBranchSlugs,
      canAccessBranch,
      canManageRoles,
      canManagePrices,
      canAccessFinancials,
      loading,
      refreshAdminProfile,
    ]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};

export const useAdminAuth = () => useContext(AdminAuthContext);
