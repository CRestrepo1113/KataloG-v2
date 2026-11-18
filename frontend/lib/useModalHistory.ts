'use client';

import { useEffect, useRef } from 'react';

/**
 * Hook reutilizable para sincronizar modales, drawers y modo pantalla completa con el botón "Atrás" del celular
 * @param isOpen Estado booleano que indica si el modal o vista secundaria está activa
 * @param onClose Callback para cerrar el modal cuando el usuario presiona "Atrás" en su dispositivo
 * @param modalKey Clave identificadora en el state del historial
 */
export function useModalHistory(isOpen: boolean, onClose: () => void, modalKey: string = 'modal') {
  const instanceIdRef = useRef<string | null>(null);
  const isPushedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const mountTimeRef = useRef(0);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isOpen) {
      mountTimeRef.current = Date.now();
      if (!isPushedRef.current) {
        const id = Math.random().toString(36).substring(2, 9);
        instanceIdRef.current = id;
        const currentState = window.history.state || {};
        window.history.pushState({ ...currentState, [modalKey]: id, timestamp: Date.now() }, '');
        isPushedRef.current = true;
      }

      const handlePopState = (e: PopStateEvent) => {
        if (!isPushedRef.current) return;
        // Evitar que un popstate rezagado de la transición del modal anterior cierre este modal
        if (Date.now() - mountTimeRef.current < 200) return;

        const targetId = instanceIdRef.current;
        if (!e.state || e.state[modalKey] !== targetId) {
          isPushedRef.current = false;
          instanceIdRef.current = null;
          onCloseRef.current();
        }
      };

      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('popstate', handlePopState);
        if (isPushedRef.current) {
          const targetId = instanceIdRef.current;
          isPushedRef.current = false;
          instanceIdRef.current = null;
          if (window.history.state && window.history.state[modalKey] === targetId) {
            window.history.back();
          }
        }
      };
    } else {
      isPushedRef.current = false;
      instanceIdRef.current = null;
    }
  }, [isOpen, modalKey]);
}

