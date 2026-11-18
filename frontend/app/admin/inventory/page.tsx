'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  AccessRequest,
  Branch,
  CompanyInfo,
  Customer,
  CustomerOrder,
  PriceList,
  Product,
  ProductStatus,
} from '@/lib/types';
import { getAllUniqueCategories } from '@/lib/theme';
import {
  getInstantAdminData,
  loadAdminDataParallel,
  saveBranch,
  deleteBranch,
  saveProduct,
  bulkSaveProducts,
  updateProductStatus,
  deleteProduct,
  bulkDeleteProducts,
  bulkUpdateStatus,
  fetchAllCustomersAdmin,
  updateCustomerAdmin,
  deleteCustomerAdmin,
  fetchAllOrdersAdmin,
  updateCustomerOrderAdmin,
  deleteCustomerOrderAdmin,
  deductOrderStock,
  restoreOrderStock,
  syncPendingOrdersToFirestore,
  fetchAccessRequestsAdmin,
  approveAccessRequest,
  rejectAccessRequest,
  fetchPriceLists,
} from '@/lib/firestore';

import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ProtectedRoute } from '@/components/admin/ProtectedRoute';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { OrdersTable } from '@/components/admin/OrdersTable';
import { CustomerTable } from '@/components/admin/CustomerTable';
import { ProductTable } from '@/components/admin/ProductTable';
import PriceListManager from '@/components/admin/PriceListManager';
import { ProductFormModal } from '@/components/admin/ProductFormModal';
import { BulkImportModal } from '@/components/admin/BulkImportModal';
import { NewBranchModal } from '@/components/admin/NewBranchModal';
import { BranchManagerModal } from '@/components/admin/BranchManagerModal';
import { SelectBranchModal } from '@/components/admin/SelectBranchModal';
import { PDFCatalogModal } from '@/components/pdf/PDFCatalogModal';
import { AdminLoadingScreen } from '@/components/admin/AdminLoadingScreen';
import { useModalHistory } from '@/lib/useModalHistory';
import {
  subscribeToRealtimeOrdersAdmin,
  subscribeToRealtimeAccessRequestsAdmin,
  getNotificationPermissionState,
  requestNotificationPermission,
  showOrderNotification,
  updateAppBadge,
} from '@/lib/notificationManager';
import { FinancesPlaceholder } from '@/components/admin/FinancesPlaceholder';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { Package, Users, ClipboardList, BellRing, ArrowRight, X, Sparkles, CircleDollarSign, Tag } from 'lucide-react';

function AdminInventoryContent() {
  const {
    adminProfile,
    isSuperAdmin,
    allowedBranchSlugs,
    canAccessBranch,
    canManagePrices,
    canAccessFinancials,
    loading: authLoading,
  } = useAdminAuth();
  const router = useRouter();

  const [isClientMounted, setIsClientMounted] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState<
    'orders' | 'customers' | 'inventory' | 'price_lists' | 'finances'
  >('orders');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranchSlug, setCurrentBranchSlug] = useState<string>('costarica');
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [newOrderAlert, setNewOrderAlert] = useState<CustomerOrder | null>(null);
  const [newRequestAlert, setNewRequestAlert] = useState<AccessRequest | null>(null);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('granted');
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);


  const [isSelectBranchModalOpen, setIsSelectBranchModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isPDFOpen, setIsPDFOpen] = useState(false);
  const [isNewBranchOpen, setIsNewBranchOpen] = useState(false);
  const [isBranchManagerOpen, setIsBranchManagerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Sincronizar modales del administrador con el botón Atrás del móvil
  useModalHistory(isSelectBranchModalOpen, () => setIsSelectBranchModalOpen(false), 'adminSelectBranchModal');
  useModalHistory(isModalOpen, () => setIsModalOpen(false), 'adminProductModal');
  useModalHistory(isBulkOpen, () => setIsBulkOpen(false), 'adminBulkModal');
  useModalHistory(isPDFOpen, () => setIsPDFOpen(false), 'adminPdfModal');
  useModalHistory(isNewBranchOpen, () => setIsNewBranchOpen(false), 'adminNewBranchModal');
  useModalHistory(isBranchManagerOpen, () => setIsBranchManagerOpen(false), 'adminBranchManagerModal');

  const queryScope = React.useMemo(
    () => ({
      isSuperAdmin,
      allowedBranches: allowedBranchSlugs,
    }),
    [isSuperAdmin, allowedBranchSlugs]
  );

  // Sincronización en segundo plano con Firestore en paralelo (Promise.all)
  const loadData = async (
    slug?: string,
    overrideScope?: { isSuperAdmin: boolean; allowedBranches: string[] }
  ) => {
    const targetSlug = slug || currentBranchSlug || 'costarica';
    const scope = overrideScope || queryScope;
    setIsSyncing(true);
    try {
      const [
        { branches: bList, company: comp, products: prods },
        custList,
        orderList,
        reqList,
        lists,
      ] = await Promise.all([
        loadAdminDataParallel(targetSlug),
        fetchAllCustomersAdmin(scope),
        fetchAllOrdersAdmin(undefined, scope),
        fetchAccessRequestsAdmin(scope),
        fetchPriceLists(targetSlug),
      ]);

      setBranches(bList);
      setCompany(comp);
      setCustomers(custList);
      setOrders(orderList);
      setAccessRequests(reqList);
      setPriceLists(lists);

      if (prods && prods.length > 0) {
        setProducts(prods);
      } else {
        const instant = getInstantAdminData(targetSlug);
        if (instant.products.length > 0) {
          setProducts(instant.products);
        } else {
          setProducts(prods);
        }
      }
      setCurrentBranchSlug(targetSlug);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('katalog_active_branch', targetSlug);
      }
    } catch (e) {
      console.warn('Admin background sync error (using local cache):', e);
    } finally {
      setIsSyncing(false);
    }
  };


  useEffect(() => {
    setIsClientMounted(true);
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem('katalog_active_branch') : null;
    const instant = getInstantAdminData(stored || undefined);
    setBranches(instant.branches);
    setCurrentBranchSlug(instant.targetSlug);
    setCompany(instant.company);
    setProducts(instant.products);

    if (!stored) {
      setIsSelectBranchModalOpen(true);
    }

    const currentPerm = getNotificationPermissionState();
    setPermissionState(currentPerm);
    if (currentPerm === 'default') {
      setShowPermissionBanner(true);
    }

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.log('KataloG SW registration note:', err);
      });

      const handleSwMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'KATALOG_NAVIGATE_TAB') {
          setActiveAdminTab('orders');
        }
      };
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlTab = params.get('tab');
      if (urlTab === 'orders' || urlTab === 'customers' || urlTab === 'inventory') {
        setActiveAdminTab(urlTab);
      }
    }
  }, []);

  useEffect(() => {
    if (!isClientMounted || authLoading) return;

    const stored = typeof window !== 'undefined' ? sessionStorage.getItem('katalog_active_branch') : null;
    const initialTarget =
      !isSuperAdmin && allowedBranchSlugs.length > 0 && !allowedBranchSlugs.includes('*')
        ? stored && allowedBranchSlugs.includes(stored)
          ? stored
          : allowedBranchSlugs[0]
        : stored || 'costarica';

    loadData(initialTarget, { isSuperAdmin, allowedBranches: allowedBranchSlugs });

    const handleSwitchTab = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (custom.detail) {
        if (custom.detail === 'finances' && !canAccessFinancials) {
          setActiveAdminTab('orders');
        } else {
          setActiveAdminTab(
            custom.detail as 'orders' | 'customers' | 'inventory' | 'price_lists' | 'finances'
          );
        }
      }
    };
    window.addEventListener('katalog:switch-tab', handleSwitchTab);

    const unsubscribeOrders = subscribeToRealtimeOrdersAdmin(
      (liveOrders) => {
        setOrders(liveOrders);
      },
      (newOrder) => {
        setNewOrderAlert(newOrder);
      },
      { isSuperAdmin, allowedBranchSlugs }
    );

    const unsubscribeRequests = subscribeToRealtimeAccessRequestsAdmin(
      (liveReqs) => {
        setAccessRequests(liveReqs);
      },
      (newReq) => {
        setNewRequestAlert(newReq);
      },
      { isSuperAdmin, allowedBranchSlugs }
    );

    const handleSyncPending = () => {
      syncPendingOrdersToFirestore()
        .then(({ syncedCount }) => {
          if (syncedCount > 0) {
            fetchAllOrdersAdmin(undefined, {
              isSuperAdmin,
              allowedBranches: allowedBranchSlugs,
            }).then(setOrders);
          }
        })
        .catch(() => {});
    };

    const handleOrdersSynced = () => {
      fetchAllOrdersAdmin(undefined, {
        isSuperAdmin,
        allowedBranches: allowedBranchSlugs,
      }).then(setOrders);
    };

    window.addEventListener('online', handleSyncPending);
    window.addEventListener('katalog:orders-synced', handleOrdersSynced);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleSyncPending();
        const storedOrders =
          typeof window !== 'undefined' ? localStorage.getItem('katalog_local_orders') : null;
        if (storedOrders) {
          try {
            const list = JSON.parse(storedOrders);
            if (Array.isArray(list)) {
              const pendingCount = list.filter((o: CustomerOrder) => o.estado === 'pendiente').length;
              updateAppBadge(pendingCount);
            }
          } catch {}
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('katalog:switch-tab', handleSwitchTab);
      window.removeEventListener('online', handleSyncPending);
      window.removeEventListener('katalog:orders-synced', handleOrdersSynced);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribeOrders();
      unsubscribeRequests();
    };
  }, [isClientMounted, authLoading, isSuperAdmin, canAccessFinancials, allowedBranchSlugs.join(',')]);

  const handleRequestNotificationsFromBanner = async () => {
    const granted = await requestNotificationPermission();
    setPermissionState(granted ? 'granted' : 'denied');
    setShowPermissionBanner(false);
    if (granted) {
      showOrderNotification(
        {
          id: 'TEST-ACTIVADO',
          cliente_id: 'CLI-TEST',
          cliente_nombre: 'Notificaciones Activadas con Éxito',
          condicion: 'Contado',
          creado_en: new Date().toISOString(),
          pais: activeBranch?.country || 'COSTA RICA',
          sucursal: currentBranchSlug,
          total_factura: 0,
          moneda: 'USD',
          items: [],
          tipo_solicitud: 'PEDIDO',
          estado: 'pendiente',
        },
        { isTest: true }
      );
    }
  };

  const categories = getAllUniqueCategories(products);
  const activeBranch = branches.find((b) => b.slug === currentBranchSlug);
  const resolvedCompany: CompanyInfo = React.useMemo(() => {
    const base: CompanyInfo = company || {
      name: 'KYG DISTRIBUCIONES',
      slogan: 'Distribución y Venta Mayorista de Juguetería y Peluches',
      phone: '+57 300 123 4567',
      address: 'Medellín, Colombia',
      socialMedia: '@kygdistribuciones',
      logoUrl: '/assets/Logo.png',
      nameLogoUrl: '/assets/Nombre.png',
      currencySymbol: '$',
      currencyCode: 'COP',
      brandColors: {
        primary: '#3C5866',
        accent: '#C37D41',
        pastels: ['#ECE4F0', '#D8E2DC', '#FFE5EC', '#FFF3CD', '#EBF4F6'],
      },
    };

    if (!activeBranch) return base;

    return {
      ...base,
      name: activeBranch.name || base.name,
      country: activeBranch.country || base.country,
      phone: activeBranch.phone || base.phone,
      address: activeBranch.address || base.address,
      slogan: activeBranch.slogan || base.slogan,
      socialMedia: activeBranch.socialMedia || base.socialMedia,
      currencySymbol: activeBranch.currencySymbol || base.currencySymbol,
      currencyCode: activeBranch.currencyCode || base.currencyCode,
      logoUrl: activeBranch.logoUrl || base.logoUrl,
      showStock: activeBranch.showStock !== undefined ? activeBranch.showStock : (base.showStock ?? true),
    };
  }, [company, activeBranch]);

  const handleSelectBranch = async (slug: string) => {
    if (!isSuperAdmin && !canAccessBranch(slug)) return;
    setCurrentBranchSlug(slug);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('katalog_active_branch', slug);
    }
    const instant = getInstantAdminData(slug);
    setProducts(instant.products);
    setCompany(instant.company);
    await loadData(slug);
  };

  const handleCreateOrUpdateBranch = async (newBranchData: Partial<Branch> & { slug: string }) => {
    if (!isSuperAdmin) return;
    const created = await saveBranch(newBranchData);
    setCurrentBranchSlug(created.slug);
    await loadData(created.slug);
  };

  const handleDeleteBranch = async (slugToDelete: string) => {
    if (!isSuperAdmin) return;
    await deleteBranch(slugToDelete);
    const newSlug = currentBranchSlug === slugToDelete ? 'default' : currentBranchSlug;
    setCurrentBranchSlug(newSlug);
    await loadData(newSlug);
  };

  const handleSaveProduct = async (productData: Partial<Product>) => {
    // Actualización optimista inmediata
    const saved = await saveProduct(productData as any, currentBranchSlug);
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const handleBulkImportComplete = async (imported: Product[], branchSlug?: string) => {
    const targetSlug = branchSlug || currentBranchSlug;
    await bulkSaveProducts(imported, targetSlug);
    const instant = getInstantAdminData(targetSlug);
    setProducts(instant.products);
  };

  const handleToggleStatus = async (id: string, newStatus: ProductStatus) => {
    // Actualización visual optimista instantánea
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p))
    );
    await updateProductStatus(id, newStatus, currentBranchSlug);
  };

  const handleDeleteProduct = async (id: string) => {
    // Eliminación visual optimista instantánea
    setProducts((prev) => prev.filter((p) => p.id !== id));
    await deleteProduct(id);
  };

  const handleUpdateStock = async (id: string, newStock: number) => {
    // Actualización visual optimista instantánea
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stock: newStock } : p))
    );
    const target = products.find((p) => p.id === id);
    if (target) {
      await saveProduct({ ...target, stock: newStock }, currentBranchSlug);
    }
  };

  const handleUpdateFilledWeight = async (id: string, newWeight: number) => {
    // Actualización visual optimista instantánea
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, filledWeight: newWeight } : p))
    );
    const target = products.find((p) => p.id === id);
    if (target) {
      await saveProduct({ ...target, filledWeight: newWeight }, currentBranchSlug);
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    if (confirm(`¿Estás seguro de eliminar las ${ids.length} referencias seleccionadas?`)) {
      const idsSet = new Set(ids);
      setProducts((prev) => prev.filter((p) => !idsSet.has(p.id)));
      await bulkDeleteProducts(ids);
    }
  };

  const handleBulkToggleStatus = async (ids: string[], newStatus: ProductStatus) => {
    const idsSet = new Set(ids);
    setProducts((prev) =>
      prev.map((p) => (idsSet.has(p.id) ? { ...p, status: newStatus } : p))
    );
    await bulkUpdateStatus(ids, newStatus, currentBranchSlug);
  };

  const handleBulkUpdateProducts = async (updatedProducts: Product[]) => {
    const updateMap = new Map(updatedProducts.map((p) => [p.id, p]));
    setProducts((prev) =>
      prev.map((p) => (updateMap.has(p.id) ? updateMap.get(p.id)! : p))
    );
    for (const prod of updatedProducts) {
      await saveProduct(prod, currentBranchSlug);
    }
  };

  // Customer & Order CRM Handlers
  const handleSaveCustomer = async (custData: Partial<Customer>) => {
    if (!custData.id) return;
    const saved = await updateCustomerAdmin(custData.id, custData);
    setCustomers((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id || (c.uid && c.uid === saved.uid));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...saved };
        return copy;
      }
      return [saved, ...prev];
    });
  };

  const handleDeleteCustomer = async (customerId: string, uid?: string) => {
    await deleteCustomerAdmin(customerId, uid);
    setCustomers((prev) => prev.filter((c) => c.id !== customerId && c.uid !== customerId && (!uid || (c.id !== uid && c.uid !== uid))));
  };

  const handleUpdateOrder = async (orderId: string, orderData: Partial<CustomerOrder>) => {
    const updated = await updateCustomerOrderAdmin(orderId, orderData);
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === orderId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...updated };
        return copy;
      }
      return [updated, ...prev];
    });
  };

  const handleDeleteOrder = async (orderId: string) => {
    await deleteCustomerOrderAdmin(orderId);
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  };

  const handleApproveRequest = async (
    request: AccessRequest,
    payload: {
      rol: Customer['rol'];
      allowedPriceLists: string[];
      defaultPriceList?: string;
      whiteLabelEnabled?: boolean;
      note?: string;
    }
  ) => {
    const adminName = adminProfile?.nombre || 'Admin';
    await approveAccessRequest(request.id, {
      customerId: request.customerId || request.uid,
      rol: payload.rol || 'cliente',
      allowedPriceLists: payload.allowedPriceLists,
      defaultPriceList: payload.defaultPriceList,
      whiteLabelEnabled: payload.whiteLabelEnabled,
      subscriptionStatus: payload.whiteLabelEnabled ? 'active' : 'none',
      adminName,
      note: payload.note,
    });

    const now = new Date().toISOString();
    setAccessRequests((prev) =>
      prev.map((r) =>
        r.id === request.id
          ? { ...r, estado: 'aprobado', revisado_por: adminName, revisado_en: now }
          : r
      )
    );
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === request.customerId || c.uid === request.uid
          ? {
              ...c,
              rol: payload.rol || 'cliente',
              estado_acceso: 'aprobado',
              allowedPriceLists: payload.allowedPriceLists,
              defaultPriceList: payload.defaultPriceList || payload.allowedPriceLists[0],
              whiteLabelEnabled:
                payload.rol === 'emprendedor' ? Boolean(payload.whiteLabelEnabled) : false,
              subscriptionStatus:
                payload.rol === 'emprendedor' && payload.whiteLabelEnabled ? 'active' : 'none',
            }
          : c
      )
    );
  };

  const handleRejectRequest = async (request: AccessRequest, note?: string) => {
    const adminName = adminProfile?.nombre || 'Admin';
    const isNewReg = request.tipo_solicitud === 'nuevo_registro';
    await rejectAccessRequest(
      request.id,
      request.customerId || request.uid,
      isNewReg,
      adminName,
      note
    );

    const now = new Date().toISOString();
    setAccessRequests((prev) =>
      prev.map((r) =>
        r.id === request.id
          ? { ...r, estado: 'rechazado', revisado_por: adminName, revisado_en: now }
          : r
      )
    );
    if (isNewReg) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === request.customerId || c.uid === request.uid
            ? { ...c, estado_acceso: 'rechazado' }
            : c
        )
      );
    }
  };

  const handleRefreshOrders = async () => {
    setIsSyncing(true);
    try {
      await syncPendingOrdersToFirestore();
      const freshOrders = await fetchAllOrdersAdmin(undefined, queryScope);
      setOrders(freshOrders);
    } catch (e) {
      console.warn('Error refrescando pedidos:', e);
    } finally {
      setIsSyncing(false);
    }
  };


  const handleDeductStock = async (order: CustomerOrder) => {
    const { updatedProducts, updatedOrder } = await deductOrderStock(order, currentBranchSlug, products);
    setProducts(updatedProducts);
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === order.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedOrder;
        return copy;
      }
      return [updatedOrder, ...prev];
    });
  };

  const handleRestoreStock = async (order: CustomerOrder) => {
    const { updatedProducts, updatedOrder } = await restoreOrderStock(order, currentBranchSlug, products);
    setProducts(updatedProducts);
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === order.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedOrder;
        return copy;
      }
      return [updatedOrder, ...prev];
    });
  };

  const handleLogout = async () => {
    if (auth) {
      await signOut(auth);
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('katalog_admin_session');
      sessionStorage.removeItem('katalog_active_branch');
    }
    router.replace('/admin/login');
  };

  // Filtrado de clientes y pedidos según roles y sucursales permitidas
  const visibleCustomers = useMemo(() => {
    if (isSuperAdmin) return customers;
    return customers.filter((c) => allowedBranchSlugs.includes(c.sucursal || 'costarica'));
  }, [isSuperAdmin, customers, allowedBranchSlugs]);

  const visibleOrders = useMemo(() => {
    if (isSuperAdmin) return orders;
    return orders.filter((o) => allowedBranchSlugs.includes(o.sucursal || 'costarica'));
  }, [isSuperAdmin, orders, allowedBranchSlugs]);

  const visibleAccessRequests = useMemo(() => {
    if (isSuperAdmin) return accessRequests;
    return accessRequests.filter((r) => allowedBranchSlugs.includes(r.sucursal || 'costarica'));
  }, [isSuperAdmin, accessRequests, allowedBranchSlugs]);

  // Si no es SuperAdmin, asegurar que esté fijado en una de sus sucursales asignadas y no acceda a finanzas
  useEffect(() => {
    if (!isSuperAdmin && !authLoading) {
      if (activeAdminTab === 'finances' && !canAccessFinancials) {
        setActiveAdminTab('orders');
      }
      if (allowedBranchSlugs.length > 0 && !allowedBranchSlugs.includes('*')) {
        if (!allowedBranchSlugs.includes(currentBranchSlug)) {
          const target = allowedBranchSlugs[0] || 'costarica';
          setCurrentBranchSlug(target);
          loadData(target);
        }
      }
    }
  }, [isSuperAdmin, authLoading, canAccessFinancials, allowedBranchSlugs, currentBranchSlug, activeAdminTab]);

  const pendingOrdersCount = visibleOrders.filter((o) => o.estado === 'pendiente').length;
  const pendingRequestsCount = visibleAccessRequests.filter((r) => r.estado === 'pendiente').length;

  if (!isClientMounted || !company) {
    return (
      <AdminLoadingScreen
        logoUrl={resolvedCompany?.logoUrl || '/assets/Logo.png'}
        nameLogoUrl={resolvedCompany?.nameLogoUrl || '/assets/Nombre.png'}
        companyName={resolvedCompany?.name || 'KYG DISTRIBUCIONES'}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between">
        <div>
          <AdminHeader
            company={resolvedCompany}
            branches={branches}
            currentBranchSlug={currentBranchSlug}
            orders={visibleOrders}
            pendingRequestsCount={pendingRequestsCount}
            onOpenOrdersTab={() => setActiveAdminTab('orders')}
            onOpenCustomersTab={() => setActiveAdminTab('customers')}
            onSelectBranch={handleSelectBranch}
            onAddNewBranch={() => setIsNewBranchOpen(true)}
            onOpenBranchManager={() => setIsBranchManagerOpen(true)}
            onLogout={handleLogout}
          />

          {/* Banner de solicitud de permiso de notificaciones para móvil y PC */}
          {showPermissionBanner && (
            <div className="bg-gradient-to-r from-[#3C5866] to-[#203038] text-white px-4 py-3 shadow-md border-b border-amber-400/30 animate-in fade-in slide-in-from-top duration-300">
              <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
                    <BellRing className="w-5 h-5 text-amber-300 animate-bounce" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-white">
                      ¿Deseas recibir alertas con sonido y globo en este teléfono?
                    </p>
                    <p className="text-[11px] text-slate-300">
                      Toca el botón para que el sistema te avise con alertas y globos al ingresar un pedido.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={handleRequestNotificationsFromBanner}
                    className="flex-1 sm:flex-none bg-amber-500 hover:bg-amber-400 text-slate-900 text-xs font-black px-4 py-2 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Activar Alertas Ahora</span>
                  </button>
                  <button
                    onClick={() => setShowPermissionBanner(false)}
                    className="text-slate-400 hover:text-white p-1 text-xs cursor-pointer"
                    title="Ocultar por ahora"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Banner flotante de nuevo pedido */}
          {newOrderAlert && (
            <div className="bg-amber-500 text-slate-900 px-4 py-2.5 shadow-lg border-b border-amber-600 animate-in slide-in-from-top duration-300">
              <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center shrink-0 animate-bounce">
                    <BellRing className="w-4 h-4 text-slate-900" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black tracking-tight truncate">
                      ¡Nuevo Pedido #{newOrderAlert.id}!
                    </p>
                    <p className="text-[11px] font-medium text-slate-900/90 truncate">
                      {newOrderAlert.cliente_nombre} ({newOrderAlert.pais || 'KataloG'})
                      {newOrderAlert.total_factura ? ` • Total: $${newOrderAlert.total_factura.toLocaleString()}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setActiveAdminTab('orders');
                      setNewOrderAlert(null);
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-black px-3 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                  >
                    <span>Ver en Pedidos</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setNewOrderAlert(null)}
                    className="p-1 hover:bg-black/10 rounded-lg text-slate-900 transition-colors cursor-pointer"
                    title="Cerrar aviso"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Banner flotante de nueva solicitud de acceso */}
          {newRequestAlert && (
            <div className="bg-[#263842] text-white px-4 py-2.5 shadow-lg border-b border-[#C37D41] animate-in slide-in-from-top duration-300">
              <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#C37D41]/25 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-[#FFF3CD]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black tracking-tight truncate">
                      Nueva Solicitud de Acceso · {newRequestAlert.perfil_solicitado.toUpperCase()}
                    </p>
                    <p className="text-[11px] text-slate-200 truncate">
                      {newRequestAlert.nombre}
                      {newRequestAlert.negocio ? ` (${newRequestAlert.negocio})` : ''} · {newRequestAlert.telefonos}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setActiveAdminTab('customers');
                      setNewRequestAlert(null);
                    }}
                    className="bg-[#C37D41] hover:bg-[#a86832] text-white text-xs font-black px-3 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                  >
                    <span>Revisar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setNewRequestAlert(null)}
                    className="p-1 hover:bg-white/10 rounded-lg text-slate-300 transition-colors cursor-pointer"
                    title="Cerrar aviso"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
            {/* Main Tabs Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200/80 pb-3">
              <div className="w-full sm:w-auto flex items-center p-1 bg-slate-200/70 rounded-2xl gap-1 overflow-x-auto scrollbar-none no-scrollbar">
                {/* TAB 1: PEDIDOS */}
                <button
                  onClick={() => setActiveAdminTab('orders')}
                  className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    activeAdminTab === 'orders'
                      ? 'bg-white text-[#3C5866] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ClipboardList className="w-4 h-4 text-[#C37D41] shrink-0" />
                  <span>Pedidos</span>
                  {pendingOrdersCount > 0 && (
                    <span className="bg-amber-500 text-white text-[9.5px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                      {pendingOrdersCount}
                    </span>
                  )}
                  <span className="min-w-[18px] h-4.5 px-1.5 rounded-full text-[9.5px] font-black flex items-center justify-center bg-slate-800 text-white shadow-xs">
                    {visibleOrders.length}
                  </span>
                </button>

                {/* TAB 2: USUARIOS */}
                <button
                  onClick={() => setActiveAdminTab('customers')}
                  className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    activeAdminTab === 'customers'
                      ? 'bg-white text-[#3C5866] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-4 h-4 text-[#C37D41] shrink-0" />
                  <span>Usuarios</span>
                  {pendingRequestsCount > 0 && (
                    <span className="bg-[#C37D41] text-white text-[9.5px] font-black px-1.5 py-0.2 rounded-full animate-pulse">
                      {pendingRequestsCount}
                    </span>
                  )}
                  <span className="min-w-[18px] h-4.5 px-1.5 rounded-full text-[9.5px] font-black flex items-center justify-center bg-slate-800 text-white shadow-xs">
                    {visibleCustomers.length}
                  </span>
                </button>

                {/* TAB 3: INVENTARIO */}
                <button
                  onClick={() => setActiveAdminTab('inventory')}
                  className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    activeAdminTab === 'inventory'
                      ? 'bg-white text-[#3C5866] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Package className="w-4 h-4 text-[#C37D41] shrink-0" />
                  <span>Inventario</span>
                  <span className="min-w-[18px] h-4.5 px-1.5 rounded-full text-[9.5px] font-black flex items-center justify-center bg-slate-800 text-white shadow-xs">
                    {products.length}
                  </span>
                </button>

                {/* TAB 4: LISTAS DE PRECIOS */}
                {canManagePrices && (
                  <button
                    onClick={() => setActiveAdminTab('price_lists')}
                    className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      activeAdminTab === 'price_lists'
                        ? 'bg-white text-[#3C5866] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Tag className="w-4 h-4 text-[#C37D41] shrink-0" />
                    <span>Listas</span>
                    <span className="min-w-[18px] h-4.5 px-1.5 rounded-full text-[9.5px] font-black flex items-center justify-center bg-slate-800 text-white shadow-xs">
                      {priceLists.length}
                    </span>
                  </button>
                )}

                {/* TAB 5: FINANZAS (Visible únicamente para SuperAdmin) */}
                {canAccessFinancials && (
                  <button
                    onClick={() => setActiveAdminTab('finances')}
                    className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      activeAdminTab === 'finances'
                        ? 'bg-white text-[#3C5866] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CircleDollarSign className="w-4 h-4 text-[#C37D41] shrink-0" />
                    <span>Finanzas</span>
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 border border-amber-300 shadow-2xs">
                      Próximamente
                    </span>
                  </button>
                )}
              </div>

              <div className="text-[11px] sm:text-xs font-bold text-slate-500 truncate">
                Mostrando: <span className="text-[#3C5866] font-extrabold">{resolvedCompany.name}</span> ({activeBranch?.country || 'Internacional'})
              </div>
            </div>

            {/* VIEW 1: PEDIDOS */}
            {activeAdminTab === 'orders' && (
              <OrdersTable
                orders={visibleOrders}
                products={products}
                customers={visibleCustomers}
                company={resolvedCompany}
                currentBranchSlug={currentBranchSlug}
                onUpdateOrder={handleUpdateOrder}
                onDeleteOrder={handleDeleteOrder}
                onDeductStock={handleDeductStock}
                onRestoreStock={handleRestoreStock}
                onRefreshOrders={handleRefreshOrders}
                isSyncing={isSyncing}
              />
            )}

            {/* VIEW 2: USUARIOS */}
            {activeAdminTab === 'customers' && (
              <CustomerTable
                customers={visibleCustomers}
                orders={visibleOrders}
                products={products}
                branches={branches}
                priceLists={priceLists}
                accessRequests={visibleAccessRequests}
                company={resolvedCompany}
                currentBranchSlug={currentBranchSlug}
                onSaveCustomer={handleSaveCustomer}
                onDeleteCustomer={handleDeleteCustomer}
                onUpdateOrder={handleUpdateOrder}
                onDeleteOrder={handleDeleteOrder}
                onApproveRequest={handleApproveRequest}
                onRejectRequest={handleRejectRequest}
              />
            )}

            {/* VIEW 3: INVENTARIO */}
            {activeAdminTab === 'inventory' && (
              <ProductTable
                products={products}
                branches={branches}
                currencySymbol={resolvedCompany.currencySymbol}
                onAddProduct={() => {
                  setEditingProduct(null);
                  setIsModalOpen(true);
                }}
                onOpenBulkImport={() => setIsBulkOpen(true)}
                onOpenPDFModal={() => setIsPDFOpen(true)}
                onEditProduct={(p) => {
                  setEditingProduct(p);
                  setIsModalOpen(true);
                }}
                onToggleStatus={handleToggleStatus}
                onDeleteProduct={handleDeleteProduct}
                onUpdateStock={handleUpdateStock}
                onUpdateFilledWeight={handleUpdateFilledWeight}
                onBulkDelete={handleBulkDelete}
                onBulkToggleStatus={handleBulkToggleStatus}
                onBulkUpdateProducts={handleBulkUpdateProducts}
              />
            )}

            {/* VIEW 4: LISTAS DE PRECIOS */}
            {canManagePrices && activeAdminTab === 'price_lists' && (
              <PriceListManager
                branchSlug={currentBranchSlug}
                currencySymbol={resolvedCompany.currencySymbol || '$'}
                priceLists={priceLists}
                products={products}
                canManagePrices={canManagePrices}
                onPriceListsChanged={(updatedLists) => setPriceLists(updatedLists)}
                onProductUpdated={(updatedProd) =>
                  setProducts((prev) =>
                    prev.map((p) => (p.id === updatedProd.id ? updatedProd : p))
                  )
                }
              />
            )}

            {/* VIEW 5: FINANZAS (Exclusivo SuperAdmin) */}
            {canAccessFinancials && activeAdminTab === 'finances' && (
              <FinancesPlaceholder
                onNavigateToOrders={() => setActiveAdminTab('orders')}
                onNavigateToUsers={() => setActiveAdminTab('customers')}
              />
            )}
          </main>


        </div>

        <SelectBranchModal
          isOpen={isSelectBranchModalOpen}
          onClose={() => setIsSelectBranchModalOpen(false)}
          branches={branches}
          currentBranchSlug={currentBranchSlug}
          onSelectBranch={handleSelectBranch}
          onAddNewBranch={() => setIsNewBranchOpen(true)}
        />

        <ProductFormModal
          key={editingProduct ? editingProduct.id : 'new-product-modal'}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveProduct}
          initialProduct={editingProduct}
          currencySymbol={resolvedCompany.currencySymbol}
          priceLists={priceLists}
          branchSlug={currentBranchSlug}
        />

        <BulkImportModal
          isOpen={isBulkOpen}
          onClose={() => setIsBulkOpen(false)}
          onImportComplete={handleBulkImportComplete}
          branch={branches.find((b) => b.slug === currentBranchSlug || b.id === currentBranchSlug) || branches[0]}
          branches={branches}
          currentBranchSlug={currentBranchSlug}
          onSelectBranch={handleSelectBranch}
          company={resolvedCompany}
          priceLists={priceLists}
        />

        <NewBranchModal
          isOpen={isNewBranchOpen}
          onClose={() => setIsNewBranchOpen(false)}
          onSave={handleCreateOrUpdateBranch}
        />

        <BranchManagerModal
          isOpen={isBranchManagerOpen}
          onClose={() => setIsBranchManagerOpen(false)}
          branches={branches}
          currentBranchSlug={currentBranchSlug}
          onSelectBranch={handleSelectBranch}
          onSaveBranch={handleCreateOrUpdateBranch}
          onDeleteBranch={handleDeleteBranch}
        />

        <PDFCatalogModal
          isOpen={isPDFOpen}
          onClose={() => setIsPDFOpen(false)}
          products={products.filter((p) => p.status !== 'disabled')}
          categories={categories}
          company={resolvedCompany}
          visiblePriceLists={priceLists.filter((l) => l.isActive)}
          branchSlug={currentBranchSlug}
        />
      </div>
  );
}

export default function AdminInventoryPage() {
  return (
    <ProtectedRoute>
      <AdminInventoryContent />
    </ProtectedRoute>
  );
}

