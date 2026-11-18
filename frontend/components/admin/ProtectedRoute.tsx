'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { checkIsAdmin, clearAdminSession, setAdminSession, hasAdminSessionFlag } from '@/lib/auth';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { AdminAuthProvider } from '@/lib/AdminAuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // 1. Si Firebase está configurado, la fuente de verdad es la validación estricta de Firebase Auth
    if (isFirebaseConfigured() && auth) {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!isMounted) return;

        if (user) {
          try {
            // Verificar en tiempo real si el usuario sigue existiendo en Firebase Auth
            await user.reload();
          } catch (e: any) {
            console.warn('Usuario eliminado o sesión expirada en Firebase Auth:', e);
            if (auth) await signOut(auth);
            clearAdminSession();
            if (!isMounted) return;
            setIsAuthenticated(false);
            setCheckingAuth(false);
            router.replace('/admin/login');
            return;
          }

          const isAdmin = await checkIsAdmin(user);
          if (!isMounted) return;

          if (isAdmin) {
            setAdminSession();
            setIsAuthenticated(true);
            setCheckingAuth(false);
          } else {
            // Es un cliente o cuenta no autorizada para administración
            clearAdminSession();
            setIsAuthenticated(false);
            setAccessDeniedMessage(
              'Esta cuenta no tiene permisos de administrador. Redirigiendo al catálogo...'
            );
            setTimeout(() => {
              if (isMounted) {
                router.replace('/v/costarica');
              }
            }, 1200);
          }
        } else {
          // No hay usuario autenticado en Firebase
          clearAdminSession();
          setIsAuthenticated(false);
          setCheckingAuth(false);
          router.replace('/admin/login');
        }
      });

      return () => {
        isMounted = false;
        unsubscribe();
      };
    }

    // 2. Modo Offline / Desarrollo sin Firebase
    if (hasAdminSessionFlag()) {
      setIsAuthenticated(true);
      setCheckingAuth(false);
      return;
    }

    setIsAuthenticated(false);
    setCheckingAuth(false);
    router.replace('/admin/login');

    return () => {
      isMounted = false;
    };
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-900/90 flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-[#3C5866] border border-slate-700 flex items-center justify-center shadow-2xl">
          <Loader2 className="w-8 h-8 text-[#C37D41] animate-spin" />
        </div>
        <div className="text-center space-y-1">
          <p className="font-extrabold text-sm text-slate-200">Verificando Credenciales de Seguridad...</p>
          <p className="text-xs text-slate-400">Protección de Panel de Administración KataloG</p>
        </div>
      </div>
    );
  }

  if (accessDeniedMessage) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4 space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shadow-2xl">
          <ShieldAlert className="w-8 h-8 text-rose-400" />
        </div>
        <div className="text-center space-y-2 max-w-sm">
          <p className="font-black text-base text-rose-300">Acceso Administrativo Restringido</p>
          <p className="text-xs text-slate-300 font-medium">{accessDeniedMessage}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <AdminAuthProvider>{children}</AdminAuthProvider>;
};
