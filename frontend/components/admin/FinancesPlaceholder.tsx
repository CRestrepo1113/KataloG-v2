'use client';

import React from 'react';
import {
  CircleDollarSign,
  TrendingUp,
  Receipt,
  Scale,
  Building2,
  Lock,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Calendar,
  Layers,
} from 'lucide-react';
import { useAdminAuth } from '@/lib/AdminAuthContext';

interface FinancesPlaceholderProps {
  onNavigateToOrders: () => void;
  onNavigateToUsers: () => void;
}

export const FinancesPlaceholder: React.FC<FinancesPlaceholderProps> = ({
  onNavigateToOrders,
  onNavigateToUsers,
}) => {
  const { isSuperAdmin, adminUser } = useAdminAuth();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Banner Principal de Bienvenida / Estado */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#203038] via-[#2A3E48] to-[#3C5866] text-white p-6 sm:p-8 shadow-md border border-slate-700/40">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300 shadow-xs">
              <CircleDollarSign className="w-6 h-6 animate-pulse" />
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-400 text-slate-950 border border-amber-300 shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
              Próximamente
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-white/10 text-slate-200 border border-white/20">
              👑 Exclusivo SuperAdmin
            </span>
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Módulo Financiero & Contable
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
              Sistema integral de control de flujo de caja, arqueos diarios por turno, cartera de cuentas por cobrar, márgenes de utilidad reales y balances consolidados por sucursal.
            </p>
          </div>

          {/* Estado de Acceso según Rol */}
          {isSuperAdmin ? (
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/30 text-amber-100 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-extrabold text-amber-200">
                  Acceso Autorizado para SuperAdmin ({adminUser?.email})
                </p>
                <p className="text-amber-200/80 mt-0.5">
                  Tienes los permisos requeridos para este módulo. Actualmente nos encontramos en la fase de arquitectura de datos contables y reportes.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-blue-500/15 border border-blue-400/30 text-blue-100 flex items-start gap-3">
              <Lock className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-extrabold text-blue-200">
                  Acceso Restringido a Administradores de Sede
                </p>
                <p className="text-blue-200/80 mt-0.5">
                  El módulo financiero estará disponible exclusivamente para la cuenta SuperAdmin (<code className="text-white font-mono bg-blue-900/40 px-1 py-0.5 rounded">crestrepol.kyg@gmail.com</code>). Tu perfil continuará enfocado en pedidos, usuarios e inventario de tus sucursales asignadas.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid de Funcionalidades Planificadas */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 px-1">
          Alcance y Funciones en Desarrollo
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:border-[#3C5866]/30 transition-all space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 border border-emerald-200/70 flex items-center justify-center font-black">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900">Flujo de Caja & Arqueos</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Control de ingresos y egresos diarios, cortes de caja por vendedor y cierre de turnos con desglose de métodos de pago (Efectivo, SINPE, Transferencia).
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:border-[#3C5866]/30 transition-all space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 border border-amber-200/70 flex items-center justify-center font-black">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900">Cuentas por Cobrar</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Monitoreo en tiempo real de cartera pendiente, límites de crédito por vendedor, registro de abonos parciales y alertas automáticas de vencimiento.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:border-[#3C5866]/30 transition-all space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-800 border border-blue-200/70 flex items-center justify-center font-black">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900">Márgenes & Rentabilidad</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Análisis de utilidad bruta y neta por producto y categoría comparando el costo de mercadería con las listas de precios (Unidad, Docena, Mayoreo).
              </p>
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs hover:border-[#3C5866]/30 transition-all space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-800 border border-purple-200/70 flex items-center justify-center font-black">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-900">Balance Multi-Sucursal</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Comparativas de rendimiento y ventas entre Costa Rica y futuras sucursales, con conversión y consolidación en moneda local y USD.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Botones de Navegación Rápida */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-extrabold text-slate-800">
            ¿Deseas gestionar los pedidos o usuarios mientras tanto?
          </h4>
          <p className="text-[11px] text-slate-500">
            Puedes consultar los saldos pendientes y el estado de entrega en los módulos activos.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={onNavigateToOrders}
            className="flex-1 sm:flex-none px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Ver Pedidos</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onNavigateToUsers}
            className="flex-1 sm:flex-none px-4 py-2 bg-[#3C5866] hover:bg-[#2c424e] text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Ver Usuarios</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
