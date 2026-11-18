'use client';

import React, { useState, useEffect } from 'react';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, isFirebaseConfigured, checkIsInAppBrowser } from '@/lib/firebase';
import { Customer } from '@/lib/types';
import {
  fetchCustomerProfile,
  registerCustomerWithAccessRequest,
  saveCustomerProfile,
} from '@/lib/firestore';
import { clearAdminSession, isAuthorizedSuperAdminEmail } from '@/lib/auth';
import { useModalHistory } from '@/lib/useModalHistory';
import {
  User,
  Mail,
  Lock,
  Phone,
  Building,
  MapPin,
  ArrowRight,
  X,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Store,
} from 'lucide-react';

interface CustomerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (customer: Customer) => void;
  currentBranchSlug?: string;
  countryName?: string;
}

export const CustomerAuthModal: React.FC<CustomerAuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  currentBranchSlug = 'costarica',
  countryName = 'Costa Rica',
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<'auth' | 'complete_profile'>('auth');
  const [pendingGoogleUser, setPendingGoogleUser] = useState<FirebaseUser | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [negocio, setNegocio] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [perfilSolicitado, setPerfilSolicitado] = useState<'cliente' | 'emprendedor'>('cliente');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isInApp, setIsInApp] = useState(false);

  useModalHistory(isOpen, onClose, 'tenantCustomerAuth');

  useEffect(() => {
    if (isOpen) {
      setIsInApp(checkIsInAppBrowser());
      setErrorMessage('');
      setSuccessMessage('');
    } else {
      setStep('auth');
      setPendingGoogleUser(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validatePhoneDigits = (val: string) => val.replace(/[^\d]/g, '').length >= 7;

  const handleGoogleAuth = async () => {
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    if (!isFirebaseConfigured() || !auth) {
      setLoading(false);
      setErrorMessage('Firebase no está configurado en este entorno.');
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      let result;
      try {
        result = await signInWithPopup(auth, provider);
      } catch (initialErr: any) {
        if (initialErr?.message?.includes('Database is closing') || initialErr?.message?.includes('hidden')) {
          result = await signInWithPopup(auth, provider);
        } else {
          throw initialErr;
        }
      }

      const fbUser = result.user;
      clearAdminSession();

      const existingProfile = await fetchCustomerProfile(fbUser.uid);

      // Si es SuperAdmin autorizado sin perfil aún, inicializarlo aprobado
      if (!existingProfile && isAuthorizedSuperAdminEmail(fbUser.email)) {
        const saProfile = await saveCustomerProfile({
          id: fbUser.uid,
          uid: fbUser.uid,
          nombre: fbUser.displayName || 'SuperAdmin',
          email: fbUser.email || '',
          pais: countryName,
          sucursal: currentBranchSlug,
          rol: 'superadmin',
          estado_acceso: 'aprobado',
          lista_precio: 'mayoreo',
          allowedPriceLists: ['unit', 'dozen', 'wholesale'],
        });
        setLoading(false);
        onLoginSuccess(saProfile);
        onClose();
        return;
      }

      // Si ya tiene perfil completo, ingresar directo
      if (existingProfile && (existingProfile.telefonos || existingProfile.estado_acceso === 'aprobado')) {
        setSuccessMessage(`Bienvenido, ${existingProfile.nombre}`);
        setTimeout(() => {
          setLoading(false);
          onLoginSuccess(existingProfile);
          onClose();
        }, 450);
        return;
      }

      // Primer ingreso con Google: exigir completar WhatsApp + perfil solicitado antes de enviar solicitud
      setPendingGoogleUser(fbUser);
      setNombre(existingProfile?.nombre || fbUser.displayName || '');
      setEmail(fbUser.email || '');
      setTelefono(existingProfile?.telefonos || fbUser.phoneNumber || '');
      setStep('complete_profile');
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      if (err.code === 'auth/popup-blocked') {
        setErrorMessage('El navegador bloqueó la ventana de Google. Usa correo y contraseña o permite popups.');
        return;
      }
      if (err.code === 'auth/unauthorized-domain') {
        setErrorMessage('Dominio no autorizado en Firebase Authentication.');
        return;
      }
      setErrorMessage(err.message || 'No se pudo iniciar sesión con Google.');
    }
  };

  const handleCompleteGoogleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogleUser) return;
    setErrorMessage('');

    if (!nombre.trim()) {
      setErrorMessage('Ingresa tu nombre completo.');
      return;
    }
    if (!validatePhoneDigits(telefono)) {
      setErrorMessage('Ingresa un WhatsApp / teléfono válido para contactarte.');
      return;
    }
    if (perfilSolicitado === 'emprendedor' && !negocio.trim()) {
      setErrorMessage('Ingresa el nombre de tu negocio o emprendimiento.');
      return;
    }

    setLoading(true);
    try {
      const { customer } = await registerCustomerWithAccessRequest({
        uid: pendingGoogleUser.uid,
        nombre: nombre.trim(),
        negocio: negocio.trim() || undefined,
        telefonos: telefono.trim(),
        email: pendingGoogleUser.email || email.trim(),
        ciudad: ciudad.trim() || undefined,
        pais: countryName,
        sucursal: currentBranchSlug,
        perfil_solicitado: perfilSolicitado,
      });

      setSuccessMessage('Solicitud enviada. Ventas te contactará pronto.');
      setTimeout(() => {
        setLoading(false);
        onLoginSuccess(customer);
        onClose();
      }, 650);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al guardar tu solicitud.');
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setErrorMessage('Escribe tu correo arriba para enviar el enlace.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      if (isFirebaseConfigured() && auth) {
        await sendPasswordResetEmail(auth, email.trim());
        setSuccessMessage(`Enlace enviado a ${email.trim()}.`);
      }
    } catch (err: any) {
      setErrorMessage(err.code === 'auth/user-not-found' ? 'Correo no registrado.' : (err.message || 'Error al enviar enlace.'));
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!email.trim() || !password) {
      setErrorMessage('Completa tu correo y contraseña.');
      return;
    }

    if (!isFirebaseConfigured() || !auth) {
      setErrorMessage('Firebase no está configurado en este entorno.');
      return;
    }

    if (tab === 'register') {
      if (!nombre.trim()) {
        setErrorMessage('Ingresa tu nombre completo.');
        return;
      }
      if (!validatePhoneDigits(telefono)) {
        setErrorMessage('Ingresa un número de WhatsApp / teléfono válido.');
        return;
      }
      if (perfilSolicitado === 'emprendedor' && !negocio.trim()) {
        setErrorMessage('Ingresa el nombre de tu negocio o emprendimiento.');
        return;
      }
    }

    setLoading(true);
    try {
      if (tab === 'register') {
        const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (userCred.user) {
          await updateProfile(userCred.user, { displayName: nombre.trim() });
        }

        clearAdminSession();
        const { customer } = await registerCustomerWithAccessRequest({
          uid: userCred.user.uid,
          nombre: nombre.trim(),
          negocio: negocio.trim() || undefined,
          telefonos: telefono.trim(),
          email: email.trim(),
          ciudad: ciudad.trim() || undefined,
          pais: countryName,
          sucursal: currentBranchSlug,
          perfil_solicitado: perfilSolicitado,
        });

        setSuccessMessage('Solicitud enviada. Ventas te contactará pronto.');
        setTimeout(() => {
          setLoading(false);
          onLoginSuccess(customer);
          onClose();
        }, 650);
      } else {
        const userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
        clearAdminSession();

        const existingProfile = await fetchCustomerProfile(userCred.user.uid);
        if (!existingProfile && isAuthorizedSuperAdminEmail(userCred.user.email)) {
          const saProfile = await saveCustomerProfile({
            id: userCred.user.uid,
            uid: userCred.user.uid,
            nombre: userCred.user.displayName || 'SuperAdmin',
            email: userCred.user.email || email.trim(),
            pais: countryName,
            sucursal: currentBranchSlug,
            rol: 'superadmin',
            estado_acceso: 'aprobado',
            lista_precio: 'mayoreo',
            allowedPriceLists: ['unit', 'dozen', 'wholesale'],
          });
          setLoading(false);
          onLoginSuccess(saProfile);
          onClose();
          return;
        }

        if (!existingProfile) {
          setPendingGoogleUser(userCred.user);
          setNombre(userCred.user.displayName || '');
          setStep('complete_profile');
          setLoading(false);
          return;
        }

        setSuccessMessage(`Bienvenido, ${existingProfile.nombre}`);
        setTimeout(() => {
          setLoading(false);
          onLoginSuccess(existingProfile);
          onClose();
        }, 450);
      }
    } catch (err: any) {
      let msg = 'Error de autenticación.';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'Este correo ya existe. Inicia sesión.';
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        msg = 'Correo o contraseña incorrectos.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'La contraseña debe tener mínimo 6 caracteres.';
      } else if (err.message) {
        msg = err.message;
      }
      setErrorMessage(msg);
      setLoading(false);
    }
  };

  const renderProfileFields = () => (
    <>
      <div>
        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
          Tipo de Perfil *
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPerfilSolicitado('cliente')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
              perfilSolicitado === 'cliente'
                ? 'bg-[#3C5866] text-white border-[#3C5866]'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <User className={`w-4 h-4 shrink-0 ${perfilSolicitado === 'cliente' ? 'text-[#FFF3CD]' : 'text-[#C37D41]'}`} />
            <span className="text-xs font-extrabold">Cliente</span>
          </button>

          <button
            type="button"
            onClick={() => setPerfilSolicitado('emprendedor')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
              perfilSolicitado === 'emprendedor'
                ? 'bg-[#3C5866] text-white border-[#3C5866]'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Store className={`w-4 h-4 shrink-0 ${perfilSolicitado === 'emprendedor' ? 'text-[#FFF3CD]' : 'text-[#C37D41]'}`} />
            <span className="text-xs font-extrabold">Emprendedor</span>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
          Nombre Completo *
        </label>
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="María Rodríguez"
            className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
            WhatsApp *
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="tel"
              required
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+506 8888-8888"
              className="w-full pl-8 pr-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
            Ciudad
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              placeholder="San José"
              className="w-full pl-8 pr-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
          {perfilSolicitado === 'emprendedor' ? 'Nombre del Negocio *' : 'Nombre del Negocio'}
        </label>
        <div className="relative">
          <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            required={perfilSolicitado === 'emprendedor'}
            value={negocio}
            onChange={(e) => setNegocio(e.target.value)}
            placeholder="Novedades Mary"
            className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
          />
        </div>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200 my-auto">
        <div className="bg-[#3C5866] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <User className="w-4 h-4 text-[#FFF3CD]" />
            </div>
            <h3 className="font-extrabold text-sm text-white">
              {step === 'complete_profile'
                ? 'Completa tu Solicitud'
                : tab === 'login'
                ? 'Iniciar Sesión'
                : 'Solicitar Acceso'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-full hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[82dvh] overflow-y-auto">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3 text-xs font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {step === 'complete_profile' ? (
            <form onSubmit={handleCompleteGoogleRequest} className="space-y-3">
              {renderProfileFields()}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#3C5866] hover:bg-[#263842] text-white font-extrabold text-xs rounded-2xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{loading ? 'Enviando...' : 'Enviar Solicitud'}</span>
                <ArrowRight className="w-4 h-4 text-[#FFF3CD]" />
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={loading}
                className="w-full py-3 px-4 bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 font-bold text-xs rounded-2xl flex items-center justify-center gap-3 cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continuar con Google</span>
              </button>

              {isInApp && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">
                  En navegadores de redes sociales es más estable registrarse con correo.
                </p>
              )}

              <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setErrorMessage('');
                  }}
                  className={`py-2 text-xs font-bold rounded-xl cursor-pointer ${
                    tab === 'login' ? 'bg-white text-[#3C5866] shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Iniciar Sesión
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('register');
                    setErrorMessage('');
                  }}
                  className={`py-2 text-xs font-bold rounded-xl cursor-pointer ${
                    tab === 'register' ? 'bg-white text-[#3C5866] shadow-2xs' : 'text-slate-500'
                  }`}
                >
                  Registrarme
                </button>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-3">
                {tab === 'register' && renderProfileFields()}

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Correo Electrónico *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Contraseña *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 p-1 cursor-pointer"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {tab === 'login' && (
                    <div className="flex justify-end mt-1.5">
                      <button
                        type="button"
                        onClick={handlePasswordReset}
                        className="text-[11px] font-bold text-[#C37D41] hover:underline cursor-pointer"
                      >
                        Recuperar contraseña
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#3C5866] hover:bg-[#263842] text-white font-extrabold text-xs rounded-2xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{loading ? 'Procesando...' : tab === 'login' ? 'Ingresar' : 'Enviar Solicitud'}</span>
                  <ArrowRight className="w-4 h-4 text-[#FFF3CD]" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
