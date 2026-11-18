'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, BellRing, BellOff, Volume2, VolumeX, CheckCircle, AlertTriangle, Play, Sparkles } from 'lucide-react';
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  isSoundEnabled,
  setSoundEnabled,
  showOrderNotification,
  updateAppBadge,
} from '@/lib/notificationManager';
import { CustomerOrder } from '@/lib/types';

interface NotificationControlsProps {
  orders: CustomerOrder[];
  pendingRequestsCount?: number;
  onOpenOrdersTab?: () => void;
  onOpenCustomersTab?: () => void;
}

export const NotificationControls: React.FC<NotificationControlsProps> = ({
  orders,
  pendingRequestsCount = 0,
  onOpenOrdersTab,
  onOpenCustomersTab,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [soundOn, setSoundOn] = useState(true);
  const [testSent, setTestSent] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const pendingOrdersCount = orders.filter((o) => o.estado === 'pendiente').length;
  const pendingCount = pendingOrdersCount + pendingRequestsCount;

  useEffect(() => {
    setPermission(getNotificationPermissionState());
    setSoundOn(isSoundEnabled());

    // Sincronizar el badge del icono al montar o cuando cambian las órdenes
    updateAppBadge(pendingCount);
  }, [pendingCount]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setPermission(granted ? 'granted' : 'denied');
    if (granted) {
      // Disparar una prueba rápida
      triggerTestNotification();
    }
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const triggerTestNotification = () => {
    const dummyOrder: CustomerOrder = {
      id: 'TEST-001',
      cliente_id: 'CLI-TEST',
      cliente_nombre: 'Cliente de Prueba',
      condicion: 'Contado',
      creado_en: new Date().toISOString(),
      pais: 'COSTA RICA',
      sucursal: 'costarica',
      total_factura: 125,
      moneda: 'USD',
      items: [],
      tipo_solicitud: 'PEDIDO',
      estado: 'pendiente',
    };

    showOrderNotification(dummyOrder, { isTest: true });
    updateAppBadge(Math.max(1, pendingCount));

    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  const isGranted = permission === 'granted';
  const isDenied = permission === 'denied';

  return (
    <div className="relative inline-block" ref={popoverRef}>
      {/* Botón de Campana en el Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-xl transition-all shadow-xs flex items-center justify-center cursor-pointer ${
          isGranted
            ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
            : isDenied
            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-400/30'
            : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 animate-pulse'
        }`}
        title={
          isGranted
            ? 'Notificaciones de pedidos activas'
            : isDenied
            ? 'Notificaciones bloqueadas'
            : 'Activar notificaciones de pedidos'
        }
      >
        {isGranted ? (
          <BellRing className="w-4 h-4 text-emerald-300" />
        ) : isDenied ? (
          <BellOff className="w-4 h-4 text-red-300" />
        ) : (
          <Bell className="w-4 h-4 text-amber-300" />
        )}

        {/* Globo con contador de pedidos pendientes */}
        {pendingCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[19px] h-[19px] px-1 bg-amber-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md border border-[#3C5866] animate-bounce">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Popover Desplegable */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-88 bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-4 text-slate-800 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#3C5866]/10 flex items-center justify-center text-[#3C5866]">
                <BellRing className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800">Alertas de Nuevos Pedidos</h4>
                <p className="text-[10px] font-medium text-slate-500">Notificaciones y globo en el icono</p>
              </div>
            </div>
            {pendingCount > 0 && (
              <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="py-3 space-y-3">
            {/* Estado del permiso del navegador / teléfono */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2.5">
              {isGranted ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : isDenied ? (
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-700">
                  {isGranted
                    ? 'Alertas al teléfono y PC: Activadas'
                    : isDenied
                    ? 'Permiso Bloqueado en el Navegador'
                    : 'Permiso de Alertas Pendiente'}
                </p>
                <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                  {isGranted
                    ? 'Recibirás avisos tipo banner y globo cuando ingrese un pedido.'
                    : isDenied
                    ? 'Ve a la configuración del navegador o de la app en tu teléfono y permite las notificaciones.'
                    : 'Actívalo para recibir alertas directas aunque tengas el admin minimizado.'}
                </p>

                {!isGranted && !isDenied && (
                  <button
                    onClick={handleRequestPermission}
                    className="mt-2 w-full py-1.5 px-3 bg-[#3C5866] hover:bg-[#2e4450] text-white text-[11px] font-black rounded-lg transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Permitir Notificaciones
                  </button>
                )}
              </div>
            </div>

            {/* Toggle de Sonido */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-2">
                {soundOn ? (
                  <Volume2 className="w-4 h-4 text-[#3C5866]" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                )}
                <div>
                  <p className="text-[11px] font-bold text-slate-700">Tono de Mensaje</p>
                  <p className="text-[9.5px] text-slate-500">Tono ágil tipo WhatsApp al entrar pedido</p>
                </div>
              </div>
              <button
                onClick={handleToggleSound}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                  soundOn ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    soundOn ? 'translate-x-4.5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Botón de Prueba */}
            <button
              onClick={triggerTestNotification}
              className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer ${
                testSent
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
            >
              {testSent ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>¡Alerta y Globo de Prueba Enviados!</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 text-[#3C5866]" />
                  <span>Probar Sonido, Alerta y Globo</span>
                </>
              )}
            </button>
          </div>

          {/* Enlaces rápidos */}
          {((onOpenOrdersTab && pendingOrdersCount > 0) ||
            (onOpenCustomersTab && pendingRequestsCount > 0)) && (
            <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
              {onOpenOrdersTab && pendingOrdersCount > 0 && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onOpenOrdersTab();
                  }}
                  className="w-full text-center text-xs font-extrabold text-[#3C5866] hover:text-[#2c424e] py-1 cursor-pointer"
                >
                  Ver Pedidos ({pendingOrdersCount}) →
                </button>
              )}
              {onOpenCustomersTab && pendingRequestsCount > 0 && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onOpenCustomersTab();
                  }}
                  className="w-full text-center text-xs font-extrabold text-[#C37D41] hover:text-[#9A5B13] py-1 cursor-pointer"
                >
                  Ver Solicitudes ({pendingRequestsCount}) →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
