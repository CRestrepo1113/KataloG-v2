import { AccessRequest, CustomerOrder } from './types';
import { db, isFirebaseConfigured } from './firebase';
import { collection, onSnapshot, query, limit, where } from 'firebase/firestore';

const SOUND_KEY = 'katalog_admin_sound_enabled';

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(SOUND_KEY);
  return val === null ? true : val === 'true';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SOUND_KEY, String(enabled));
}

export function playOrderNotificationSound(): void {
  if (typeof window === 'undefined' || !isSoundEnabled()) return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const notes = [
      { freq: 830.6, start: 0, dur: 0.085, vol: 0.35 },
      { freq: 1244.5, start: 0.075, dur: 0.16, vol: 0.45 },
    ];

    notes.forEach(({ freq, start, dur, vol }) => {
      const startTime = ctx.currentTime + start;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, startTime);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, startTime);

      gain1.gain.setValueAtTime(0.0001, startTime);
      gain1.gain.exponentialRampToValueAtTime(vol, startTime + 0.003);
      gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

      gain2.gain.setValueAtTime(0.0001, startTime);
      gain2.gain.exponentialRampToValueAtTime(vol * 0.2, startTime + 0.003);
      gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + dur * 0.75);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc1.start(startTime);
      osc1.stop(startTime + dur);

      osc2.start(startTime);
      osc2.stop(startTime + dur);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch (e) {
    console.warn('No se pudo reproducir el sonido de notificación:', e);
  }
}

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (e) {
    console.error('Error al solicitar permiso de notificación:', e);
    return false;
  }
}

export function updateAppBadge(count: number): void {
  if (typeof window === 'undefined') return;

  try {
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        (navigator as unknown as { setAppBadge: (count: number) => Promise<void> }).setAppBadge(count).catch(() => {});
      } else {
        (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {});
      }
    }
  } catch (e) {
    console.warn('App Badging no soportado en este dispositivo:', e);
  }
}

export function clearAppBadge(): void {
  if (typeof window === 'undefined') return;
  try {
    if ('clearAppBadge' in navigator) {
      (navigator as unknown as { clearAppBadge: () => Promise<void> }).clearAppBadge().catch(() => {});
    }
  } catch {}
}

async function dispatchSystemNotification(
  title: string,
  body: string,
  tag: string,
  targetUrl: string,
  tabEvent: 'orders' | 'customers'
) {
  playOrderNotificationSound();

  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notificationOptions = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-32.png',
    tag,
    renotify: true,
    data: { url: targetUrl },
    vibrate: [200, 100, 200, 100, 300],
  } as unknown as NotificationOptions;

  if ('serviceWorker' in navigator) {
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.ready);
      if (reg && reg.showNotification) {
        await reg.showNotification(title, notificationOptions);
        return;
      }
    } catch {}
  }

  try {
    const notif = new Notification(title, notificationOptions);
    notif.onclick = (event) => {
      event.preventDefault();
      window.focus();
      if (window.location.pathname.includes('/admin/inventory')) {
        window.dispatchEvent(new CustomEvent('katalog:switch-tab', { detail: tabEvent }));
      } else {
        window.location.href = targetUrl;
      }
      notif.close();
    };
  } catch {}
}

export async function showOrderNotification(
  order: CustomerOrder,
  options?: { isTest?: boolean }
): Promise<void> {
  if (typeof window === 'undefined') return;

  const isTest = options?.isTest || false;
  const prefix = isTest ? '🧪 [PRUEBA] ' : '';
  const title = `${prefix}📦 ¡Nuevo Pedido #${order.id}!`;

  const clientName = order.cliente_nombre || 'Cliente';
  const totalStr = order.total_factura ? `$${order.total_factura.toLocaleString()}` : '';
  const branchStr = order.pais ? ` (${order.pais})` : '';
  const body = `${clientName}${branchStr}${totalStr ? ` • Total: ${totalStr}` : ''}\nToca para abrir en el Administrador.`;

  await dispatchSystemNotification(
    title,
    body,
    `katalog-order-${order.id}`,
    '/admin/inventory/?tab=orders',
    'orders'
  );
}

export async function showAccessRequestNotification(req: AccessRequest): Promise<void> {
  if (typeof window === 'undefined') return;

  const profileLabel = req.perfil_solicitado === 'emprendedor' ? 'Emprendedor' : 'Cliente';
  const title = `👤 Nueva Solicitud (${profileLabel})`;
  const body = `${req.nombre}${req.negocio ? ` (${req.negocio})` : ''} • ${req.telefonos || req.email}`;

  await dispatchSystemNotification(
    title,
    body,
    `katalog-req-${req.id}`,
    '/admin/inventory/?tab=customers',
    'customers'
  );
}

/**
 * Escucha en tiempo real pedidos de Firestore respetando las sucursales autorizadas del Admin.
 */
export function subscribeToRealtimeOrdersAdmin(
  onOrdersUpdated: (orders: CustomerOrder[]) => void,
  onNewOrderDetected?: (order: CustomerOrder) => void,
  options?: { isSuperAdmin?: boolean; allowedBranchSlugs?: string[] }
): () => void {
  if (!isFirebaseConfigured() || !db) {
    return () => {};
  }

  const sessionStartTime = Date.now() - 60000;
  let isInitialLoad = true;

  try {
    const isSuper = Boolean(options?.isSuperAdmin);
    const branches = (options?.allowedBranchSlugs || []).filter((b) => b && b !== '*');

    const ordersQuery =
      !isSuper && branches.length > 0
        ? query(collection(db, 'pedidos'), where('sucursal', 'in', branches.slice(0, 10)), limit(200))
        : query(collection(db, 'pedidos'), limit(200));

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const orderList: CustomerOrder[] = [];

        snapshot.forEach((docSnap) => {
          orderList.push({ id: docSnap.id, ...docSnap.data() } as CustomerOrder);
        });

        orderList.sort(
          (a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime()
        );

        if (typeof window !== 'undefined') {
          try {
            const stored = localStorage.getItem('katalog_local_orders');
            const currentLocal: CustomerOrder[] = stored ? JSON.parse(stored) : [];
            const pendingIds = new Set(
              JSON.parse(localStorage.getItem('katalog_pending_orders_sync') || '[]')
            );
            const unsynced = currentLocal.filter(
              (o) => pendingIds.has(o.id) || o.syncedToCloud === false
            );
            const combined = new Map<string, CustomerOrder>();
            orderList.forEach((o) => combined.set(o.id, { ...o, syncedToCloud: true }));
            unsynced.forEach((o) => {
              if (!combined.has(o.id)) combined.set(o.id, o);
            });
            const finalList = Array.from(combined.values()).sort(
              (a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime()
            );
            localStorage.setItem('katalog_local_orders', JSON.stringify(finalList));
          } catch {}
        }

        const pendingCount = orderList.filter((o) => o.estado === 'pendiente').length;
        updateAppBadge(pendingCount);

        if (isInitialLoad) {
          isInitialLoad = false;
          onOrdersUpdated(orderList);

          const recentPending = orderList.find((o) => {
            if (o.estado !== 'pendiente') return false;
            const t = new Date(o.creado_en || 0).getTime();
            return Date.now() - t < 15 * 60 * 1000;
          });

          if (recentPending) {
            playOrderNotificationSound();
            onNewOrderDetected?.(recentPending);
          }
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newOrder = { id: change.doc.id, ...change.doc.data() } as CustomerOrder;
            const orderTime = new Date(newOrder.creado_en || 0).getTime();

            if (orderTime >= sessionStartTime || !newOrder.creado_en) {
              showOrderNotification(newOrder);
              onNewOrderDetected?.(newOrder);
            }
          }
        });

        onOrdersUpdated(orderList);
      },
      (error) => {
        console.warn('Error en suscripción de pedidos:', error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('No se pudo establecer suscripción en tiempo real a pedidos:', err);
    return () => {};
  }
}

/**
 * Escucha en tiempo real solicitudes de acceso pendientes para alertar a los Admins al instante.
 */
export function subscribeToRealtimeAccessRequestsAdmin(
  onRequestsUpdated: (requests: AccessRequest[]) => void,
  onNewRequestDetected?: (req: AccessRequest) => void,
  options?: { isSuperAdmin?: boolean; allowedBranchSlugs?: string[] }
): () => void {
  if (!isFirebaseConfigured() || !db) {
    return () => {};
  }

  const sessionStartTime = Date.now() - 60000;
  let isInitialLoad = true;

  try {
    const isSuper = Boolean(options?.isSuperAdmin);
    const branches = (options?.allowedBranchSlugs || []).filter((b) => b && b !== '*');

    const reqQuery =
      !isSuper && branches.length > 0
        ? query(
            collection(db, 'access_requests'),
            where('sucursal', 'in', branches.slice(0, 10)),
            limit(200)
          )
        : query(collection(db, 'access_requests'), limit(200));

    const unsubscribe = onSnapshot(
      reqQuery,
      (snapshot) => {
        const list: AccessRequest[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as AccessRequest);
        });

        list.sort(
          (a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime()
        );

        if (isInitialLoad) {
          isInitialLoad = false;
          onRequestsUpdated(list);
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newReq = { id: change.doc.id, ...change.doc.data() } as AccessRequest;
            const reqTime = new Date(newReq.creado_en || 0).getTime();
            if (newReq.estado === 'pendiente' && (reqTime >= sessionStartTime || !newReq.creado_en)) {
              showAccessRequestNotification(newReq);
              onNewRequestDetected?.(newReq);
            }
          }
        });

        onRequestsUpdated(list);
      },
      (error) => {
        console.warn('Error en suscripción de solicitudes:', error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('No se pudo suscribir a solicitudes en tiempo real:', err);
    return () => {};
  }
}
