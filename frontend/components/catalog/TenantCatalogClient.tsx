'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Product,
  PriceList,
  PriceTier,
  CompanyInfo,
  CartItem,
  Customer,
  CatalogSortOption,
  ResellerConfig,
} from '@/lib/types';
import {
  getInstantPublicCatalogData,
  loadPublicCatalogDataParallel,
  loadCatalogDataParallel,
  fetchPriceLists,
  getLocalCart,
  getLocalCartAsync,
  saveLocalCart,
  clearLocalCart,
  getCachedCustomerProfile,
  setCachedCustomerProfile,
  clearProtectedCatalogCaches,
  syncCustomerCart,
  fetchCustomerProfile,
  saveCustomerProfile,
  saveResellerConfig,
  syncPendingOrdersToFirestore,
} from '@/lib/firestore';
import {
  resolveAccessStatus,
  canViewPrices,
  canUseCart,
  canUseWhiteLabel,
  isAuthorizedSuperAdminEmail,
  getUserRole,
} from '@/lib/auth';
import {
  getDefaultPriceListsForBranch,
  getVisiblePriceListsForUser,
  resolveProductPriceForList,
  resolveResellerPrice,
} from '@/lib/pricing';
import { auth, isFirebaseConfigured } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { getAllUniqueCategories, isProductInCategory, parseProductNumericSize } from '@/lib/theme';
import { Header } from '@/components/catalog/Header';
import { PriceTierSwitcher } from '@/components/catalog/PriceTierSwitcher';
import { SearchBar } from '@/components/catalog/SearchBar';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { ProductCarousel } from '@/components/catalog/ProductCarousel';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { PDFCatalogModal } from '@/components/pdf/PDFCatalogModal';
import { WelcomeModal } from '@/components/catalog/WelcomeModal';
import { SocialMediaModal } from '@/components/catalog/SocialMediaModal';
import { CustomerAuthModal } from '@/components/catalog/CustomerAuthModal';
import { CustomerOrdersModal } from '@/components/catalog/CustomerOrdersModal';
import { ResellerSettingsModal } from '@/components/catalog/ResellerSettingsModal';
import { CatalogLoadingScreen } from '@/components/catalog/CatalogLoadingScreen';
import { useModalHistory } from '@/lib/useModalHistory';
import { Lock, Clock, MessageCircle, ArrowRight } from 'lucide-react';

export const TenantCatalogClient: React.FC = () => {
  const params = useParams();
  const rawSlug = (params?.tenant as string) || 'default';
  const tenantSlug = rawSlug === 'costa-rica' ? 'costarica' : rawSlug;

  const [isClientMounted, setIsClientMounted] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [branchPriceLists, setBranchPriceLists] = useState<PriceList[]>(() =>
    getDefaultPriceListsForBranch(tenantSlug)
  );
  const [isSyncing, setIsSyncing] = useState(false);

  const [countryName, setCountryName] = useState<string>(() => {
    const s = tenantSlug.toLowerCase();
    if (s === 'costarica' || s === 'costa-rica') return 'COSTA RICA';
    if (s === 'mexico') return 'MÉXICO';
    if (s === 'colombia') return 'COLOMBIA';
    if (s === 'honduras') return 'HONDURAS';
    if (s === 'panama') return 'PANAMÁ';
    if (s === 'guatemala') return 'GUATEMALA';
    return s.replace(/[-_]/g, ' ').toUpperCase();
  });

  const [currentTier, setCurrentTier] = useState<PriceTier>('unit');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState<CatalogSortOption>('default');
  const [viewMode, setViewMode] = useState<'grid' | 'carousel'>('grid');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [whiteLabelMode, setWhiteLabelMode] = useState(false);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPDFOpen, setIsPDFOpen] = useState(false);
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(true);
  const [isCustomerAuthOpen, setIsCustomerAuthOpen] = useState(false);
  const [isCustomerOrdersOpen, setIsCustomerOrdersOpen] = useState(false);
  const [isResellerSettingsOpen, setIsResellerSettingsOpen] = useState(false);

  useModalHistory(isCartOpen, () => setIsCartOpen(false), 'tenantCart');
  useModalHistory(isPDFOpen, () => setIsPDFOpen(false), 'tenantPdf');
  useModalHistory(isSocialOpen, () => setIsSocialOpen(false), 'tenantSocial');
  useModalHistory(isWelcomeOpen, () => setIsWelcomeOpen(false), 'tenantWelcome');
  useModalHistory(isCustomerAuthOpen, () => setIsCustomerAuthOpen(false), 'tenantCustomerAuth');
  useModalHistory(isCustomerOrdersOpen, () => setIsCustomerOrdersOpen(false), 'tenantCustomerOrders');

  const userRole = customer?.rol || 'cliente';
  const accessStatus = useMemo(
    () => resolveAccessStatus(customer, userRole, customer?.email),
    [customer, userRole]
  );
  const hasPriceAccess = useMemo(
    () => isAuthenticated && canViewPrices(customer, userRole, customer?.email),
    [isAuthenticated, customer, userRole]
  );
  const hasCartAccess = useMemo(
    () => isAuthenticated && canUseCart(customer, userRole, customer?.email),
    [isAuthenticated, customer, userRole]
  );
  const canToggleWhiteLabel = useMemo(
    () => isAuthenticated && canUseWhiteLabel(customer),
    [isAuthenticated, customer]
  );

  const visiblePriceLists = useMemo(
    () => getVisiblePriceListsForUser(branchPriceLists, userRole, customer, isAuthenticated),
    [branchPriceLists, userRole, customer, isAuthenticated]
  );

  // Asegurar que currentTier pertenezca siempre a una lista autorizada
  useEffect(() => {
    if (visiblePriceLists.length === 0) return;
    const stillValid = visiblePriceLists.some((l) => l.id === currentTier);
    if (!stillValid) {
      const preferred =
        (customer?.defaultPriceList && visiblePriceLists.find((l) => l.id === customer.defaultPriceList)) ||
        (userRole === 'vendedor' && visiblePriceLists.find((l) => l.isDefaultForSeller)) ||
        visiblePriceLists[0];
      if (preferred) setCurrentTier(preferred.id);
    }
  }, [visiblePriceLists, currentTier, customer?.defaultPriceList, userRole]);

  // Desactivar Modo Marca Blanca si pierde permiso
  useEffect(() => {
    if (!canToggleWhiteLabel && whiteLabelMode) {
      setWhiteLabelMode(false);
    }
  }, [canToggleWhiteLabel, whiteLabelMode]);

  const loadAuthorizedCatalog = useCallback(async () => {
    setIsSyncing(true);
    try {
      const [{ company: syncedComp, products: syncedProds, currentBranch }, lists] = await Promise.all([
        loadCatalogDataParallel(tenantSlug),
        fetchPriceLists(tenantSlug),
      ]);
      if (syncedComp) {
        setCompany(syncedComp);
        const targetCountry = currentBranch?.country || syncedComp.country;
        if (targetCountry) setCountryName(targetCountry.toUpperCase());
      }
      if (syncedProds) setProducts(syncedProds);
      if (lists && lists.length > 0) setBranchPriceLists(lists);
    } catch (e) {
      console.warn('Error syncing authorized catalog:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [tenantSlug]);

  const loadPublicOnlyCatalog = useCallback(async () => {
    setIsSyncing(true);
    try {
      clearProtectedCatalogCaches();
      const { company: syncedComp, products: publicProds, currentBranch } =
        await loadPublicCatalogDataParallel(tenantSlug);
      if (syncedComp) {
        setCompany(syncedComp);
        const targetCountry = currentBranch?.country || syncedComp.country;
        if (targetCountry) setCountryName(targetCountry.toUpperCase());
      }
      setProducts(publicProds || []);
    } catch (e) {
      console.warn('Error syncing public catalog:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    setIsClientMounted(true);
    let isMounted = true;

    // Arranque instantáneo SIEMPRE sin precios desde catalog_public para evitar fugas previas al auth
    const instantPublic = getInstantPublicCatalogData(tenantSlug);
    setProducts(instantPublic.products);
    setCompany(instantPublic.company);

    const enrichItems = (rawCart: CartItem[], catalogProds: Product[]) => {
      if (!Array.isArray(rawCart) || !Array.isArray(catalogProds) || catalogProds.length === 0) return rawCart;
      return rawCart.map((it) => {
        const prod = catalogProds.find((p) => p.sku === it.product.sku || p.id === it.product.id);
        return prod ? { ...it, product: prod } : it;
      });
    };

    const savedCart = getLocalCart(tenantSlug);
    if (savedCart && savedCart.length > 0) {
      setCart(enrichItems(savedCart, instantPublic.products));
    } else {
      getLocalCartAsync(tenantSlug).then((idbCart) => {
        if (isMounted && idbCart && idbCart.length > 0) {
          setCart((prev) => (prev.length === 0 ? enrichItems(idbCart, instantPublic.products) : prev));
        }
      });
    }

    if (typeof window !== 'undefined' && tenantSlug && tenantSlug !== 'default') {
      localStorage.setItem('katalog_current_branch', tenantSlug);
    }

    syncPendingOrdersToFirestore().catch(() => {});
    const handleOnlineSync = () => syncPendingOrdersToFirestore().catch(() => {});
    window.addEventListener('online', handleOnlineSync);

    let unsubscribeAuth: (() => void) | undefined;
    if (isFirebaseConfigured() && auth) {
      unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
        if (!isMounted) return;
        if (!fbUser) {
          setIsAuthenticated(false);
          setCustomer(null);
          setCachedCustomerProfile(null);
          clearProtectedCatalogCaches();
          await loadPublicOnlyCatalog();
          return;
        }

        setIsAuthenticated(true);
        try {
          let profile = await fetchCustomerProfile(fbUser.uid);

          // Auto-bootstrap de SuperAdmin si ingresa por primera vez en el catálogo
          if (!profile && isAuthorizedSuperAdminEmail(fbUser.email)) {
            const saRole = await getUserRole(fbUser, null);
            if (saRole === 'superadmin') {
              profile = await saveCustomerProfile({
                id: fbUser.uid,
                uid: fbUser.uid,
                nombre: fbUser.displayName || 'SuperAdmin',
                email: fbUser.email || '',
                sucursal: tenantSlug,
                pais: countryName,
                rol: 'superadmin',
                estado_acceso: 'aprobado',
                lista_precio: 'mayoreo',
                allowedPriceLists: ['unit', 'dozen', 'wholesale'],
              });
            }
          }

          if (!isMounted) return;
          setCustomer(profile);

          if (profile && canViewPrices(profile, profile.rol, profile.email)) {
            await loadAuthorizedCatalog();
            if (profile.activeCart && profile.activeCart.length > 0) {
              const currentLocal = getLocalCart(tenantSlug);
              if (!currentLocal || currentLocal.length === 0) {
                setCart(profile.activeCart);
                saveLocalCart(tenantSlug, profile.activeCart);
              }
            }
          } else {
            await loadPublicOnlyCatalog();
          }
        } catch (err) {
          console.warn('Auth profile load error:', err);
          await loadPublicOnlyCatalog();
        }
      });
    } else {
      loadPublicOnlyCatalog();
    }

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnlineSync);
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, [tenantSlug, countryName, loadAuthorizedCatalog, loadPublicOnlyCatalog]);

  const resolvePrice = useCallback(
    (product: Product, listId?: string): number => {
      if (!hasPriceAccess) return 0;
      if (whiteLabelMode && customer?.resellerConfig) {
        const costListId = customer.resellerConfig.sourceCostListId || visiblePriceLists[0]?.id || 'wholesale';
        const costList = visiblePriceLists.find((l) => l.id === costListId) || visiblePriceLists[0];
        const cost = resolveProductPriceForList(product, costList || costListId, tenantSlug, branchPriceLists);
        return resolveResellerPrice(cost, product, customer.resellerConfig);
      }
      const targetId = listId || currentTier || visiblePriceLists[0]?.id || 'unit';
      const targetList = visiblePriceLists.find((l) => l.id === targetId);
      return resolveProductPriceForList(product, targetList || targetId, tenantSlug, branchPriceLists);
    },
    [hasPriceAccess, whiteLabelMode, customer?.resellerConfig, visiblePriceLists, tenantSlug, branchPriceLists, currentTier]
  );

  const categories = getAllUniqueCategories(products);

  const checkMatchesSearch = (p: Product, term: string) => {
    if (!term) return true;
    const st = term.trim().toLowerCase();
    if (!st) return true;
    return (
      (p.name && p.name.toLowerCase().includes(st)) ||
      (p.sku && p.sku.toLowerCase().includes(st)) ||
      (p.category && p.category.toLowerCase().includes(st)) ||
      (p.tags && p.tags.some((t) => t.toLowerCase().includes(st)))
    );
  };

  const categoryCounts: Record<string, number> = {
    all: products.filter((p) => checkMatchesSearch(p, searchTerm)).length,
  };

  categories.forEach((cat) => {
    categoryCounts[cat] = products.filter(
      (p) => checkMatchesSearch(p, searchTerm) && isProductInCategory(p, cat)
    ).length;
  });

  const filteredProducts = products.filter(
    (p) => checkMatchesSearch(p, searchTerm) && isProductInCategory(p, selectedCategory)
  );

  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    if (sortBy === 'default') return list;

    if (sortBy === 'price-asc' && hasPriceAccess) {
      return list.sort((a, b) => {
        const priceA = resolvePrice(a, currentTier);
        const priceB = resolvePrice(b, currentTier);
        if (priceA !== priceB) return priceA - priceB;
        return a.sku.localeCompare(b.sku);
      });
    }

    if (sortBy === 'price-desc' && hasPriceAccess) {
      return list.sort((a, b) => {
        const priceA = resolvePrice(a, currentTier);
        const priceB = resolvePrice(b, currentTier);
        if (priceA !== priceB) return priceB - priceA;
        return a.sku.localeCompare(b.sku);
      });
    }

    if (sortBy === 'size-asc') {
      return list.sort((a, b) => {
        const sizeA = parseProductNumericSize(a.size);
        const sizeB = parseProductNumericSize(b.size);
        if (sizeA === 0 && sizeB > 0) return 1;
        if (sizeB === 0 && sizeA > 0) return -1;
        if (sizeA !== sizeB) return sizeA - sizeB;
        return a.sku.localeCompare(b.sku);
      });
    }

    if (sortBy === 'size-desc') {
      return list.sort((a, b) => {
        const sizeA = parseProductNumericSize(a.size);
        const sizeB = parseProductNumericSize(b.size);
        if (sizeA === 0 && sizeB > 0) return 1;
        if (sizeB === 0 && sizeA > 0) return -1;
        if (sizeA !== sizeB) return sizeB - sizeA;
        return a.sku.localeCompare(b.sku);
      });
    }

    return list;
  }, [filteredProducts, sortBy, hasPriceAccess, resolvePrice, currentTier]);

  const updateCartState = (updater: (prev: CartItem[]) => CartItem[]) => {
    setCart((prev) => {
      const nextCart = updater(prev);
      saveLocalCart(tenantSlug, nextCart);
      if (customer?.id && hasCartAccess) {
        syncCustomerCart(customer.id, nextCart);
      }
      return nextCart;
    });
  };

  const handleAddToCart = (product: Product, customQty?: number, comment?: string) => {
    if (!hasCartAccess) return;
    const qtyToAdd = customQty !== undefined && customQty > 0 ? customQty : 1;
    const cleanComment = comment?.trim() || undefined;

    updateCartState((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.product.id === product.id && (item.comment || '') === (cleanComment || '')
      );
      if (existingIndex > -1) {
        return prev.map((item, idx) =>
          idx === existingIndex ? { ...item, quantity: item.quantity + qtyToAdd } : item
        );
      }
      const sameProdIndex = prev.findIndex((item) => item.product.id === product.id);
      if (sameProdIndex > -1) {
        return prev.map((item, idx) =>
          idx === sameProdIndex
            ? { ...item, quantity: item.quantity + qtyToAdd, comment: cleanComment || item.comment }
            : item
        );
      }
      return [...prev, { product, quantity: qtyToAdd, comment: cleanComment }];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    updateCartState((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleSetQuantity = (productId: string, newQuantity: number) => {
    updateCartState((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: Math.max(0, newQuantity) } : item
      )
    );
  };

  const handleUpdateComment = (productId: string, newComment: string) => {
    updateCartState((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, comment: newComment.trim() || undefined } : item
      )
    );
  };

  const handleRemoveItem = (productId: string) => {
    updateCartState((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    clearLocalCart(tenantSlug);
    if (customer?.id) syncCustomerCart(customer.id, []);
    setCart([]);
  };

  const handleLoginSuccess = async (loggedInCustomer: Customer) => {
    setIsAuthenticated(true);
    setCustomer(loggedInCustomer);
    if (canViewPrices(loggedInCustomer, loggedInCustomer.rol, loggedInCustomer.email)) {
      await loadAuthorizedCatalog();
    } else {
      await loadPublicOnlyCatalog();
    }
  };

  const handleLogoutCustomer = async () => {
    if (auth) {
      try {
        await signOut(auth);
      } catch {}
    }
    setWhiteLabelMode(false);
    setIsAuthenticated(false);
    setCachedCustomerProfile(null);
    clearProtectedCatalogCaches();
    setCustomer(null);
    await loadPublicOnlyCatalog();
  };

  const handleRepeatOrder = (items: CartItem[]) => {
    updateCartState(() => items);
    setIsCartOpen(true);
  };

  const handleSaveResellerConfig = async (config: ResellerConfig) => {
    if (!customer) return;
    await saveResellerConfig(customer.uid || customer.id, config);
    setCustomer((prev) => (prev ? { ...prev, resellerConfig: config } : prev));
  };

  const isDifferentBranchCustomer = useMemo(() => {
    if (!customer?.sucursal || whiteLabelMode) return false;
    const custBranch = customer.sucursal.toLowerCase().trim();
    const currentSlug = tenantSlug.toLowerCase().trim();
    return custBranch !== currentSlug && currentSlug !== 'default' && currentSlug !== 'all';
  }, [customer, tenantSlug, whiteLabelMode]);

  if (!isClientMounted || !company) {
    return (
      <CatalogLoadingScreen
        country={countryName}
        logoUrl="/assets/Logo.png"
        nameLogoUrl="/assets/Nombre.png"
      />
    );
  }

  const totalCartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const activePriceList = visiblePriceLists.find((l) => l.id === currentTier) || visiblePriceLists[0];
  const effectiveShowStock = whiteLabelMode
    ? !(customer?.resellerConfig?.hideStockInClientMode ?? true)
    : company.showStock !== false;

  const cleanWaPhone = (company.phone || '').replace(/[^0-9]/g, '');
  const salesWhatsappUrl = cleanWaPhone
    ? `https://api.whatsapp.com/send/?phone=${cleanWaPhone}&text=${encodeURIComponent(
        `¡Hola! Solicito activación de precios en el catálogo de ${company.name}.`
      )}`
    : '';

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between">
      <div>
        <Header
          company={company}
          cartCount={totalCartItemsCount}
          onOpenCart={() => setIsCartOpen(true)}
          onOpenSocialModal={() => setIsSocialOpen(true)}
          customer={customer}
          accessStatus={accessStatus}
          hasCartAccess={hasCartAccess}
          whiteLabelMode={whiteLabelMode}
          canToggleWhiteLabel={canToggleWhiteLabel}
          onToggleWhiteLabel={() => setWhiteLabelMode((prev) => !prev)}
          onOpenResellerSettings={() => setIsResellerSettingsOpen(true)}
          resellerBrandTitle={customer?.resellerConfig?.brandTitle || 'Catálogo'}
          onOpenCustomerAuth={() => setIsCustomerAuthOpen(true)}
          onOpenCustomerOrders={() => setIsCustomerOrdersOpen(true)}
        />

        {/* Banner de sucursal diferente */}
        {isDifferentBranchCustomer && customer?.sucursal && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-amber-900 text-xs font-semibold">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
              <span>
                Sucursal registrada: <strong>{customer.sucursal.toUpperCase()}</strong>
              </span>
              <a
                href={`/v/${customer.sucursal}`}
                className="bg-[#3C5866] text-white px-3 py-1 rounded-xl text-xs font-black shrink-0"
              >
                Ir a mi sucursal
              </a>
            </div>
          </div>
        )}

        {/* Banner de acceso restringido (Visitante o Pendiente) */}
        {!hasPriceAccess && (
          <div className="bg-[#FFF3CD]/60 border-b border-[#EBD89F] px-4 py-2.5">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 font-bold text-[#263842]">
                {accessStatus === 'pendiente' ? (
                  <Clock className="w-4 h-4 text-[#C37D41] shrink-0" />
                ) : (
                  <Lock className="w-4 h-4 text-[#C37D41] shrink-0" />
                )}
                <span>
                  {accessStatus === 'pendiente'
                    ? 'Solicitud en revisión. Espera el contacto de ventas para ver precios.'
                    : 'Regístrate y espera el contacto de ventas para ver precios y realizar pedidos.'}
                </span>
              </div>

              {accessStatus === 'pendiente' && salesWhatsappUrl ? (
                <a
                  href={salesWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl font-extrabold shrink-0"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Contactar Ventas</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCustomerAuthOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 bg-[#3C5866] hover:bg-[#263842] text-white px-3.5 py-1.5 rounded-xl font-extrabold shrink-0 cursor-pointer"
                >
                  <span>Registrarme</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#FFF3CD]" />
                </button>
              )}
            </div>
          </div>
        )}

        <main className="max-w-7xl mx-auto px-4 py-6">
          {hasPriceAccess && (
            <PriceTierSwitcher
              visibleLists={visiblePriceLists}
              currentTier={currentTier}
              onSelectTier={setCurrentTier}
              whiteLabelMode={whiteLabelMode}
              onOpenResellerSettings={() => setIsResellerSettingsOpen(true)}
            />
          )}

          <SearchBar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            onOpenPDFModal={() => setIsPDFOpen(true)}
            categoryCounts={categoryCounts}
            totalResults={sortedProducts.length}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortBy={sortBy}
            onSortChange={setSortBy}
            hasPriceAccess={hasPriceAccess}
          />

          {viewMode === 'carousel' ? (
            <ProductCarousel
              products={sortedProducts}
              currentTier={currentTier}
              visiblePriceLists={visiblePriceLists}
              resolvePrice={resolvePrice}
              hasPriceAccess={hasPriceAccess}
              hasCartAccess={hasCartAccess}
              whiteLabelMode={whiteLabelMode}
              currencySymbol={company.currencySymbol}
              showStock={effectiveShowStock}
              onAddToCart={handleAddToCart}
              onRequestPriceAccess={() =>
                customer ? setIsCustomerOrdersOpen(true) : setIsCustomerAuthOpen(true)
              }
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              categoryCounts={categoryCounts}
              cartCount={totalCartItemsCount}
              onOpenCart={() => setIsCartOpen(true)}
              isLoading={isSyncing && products.length === 0}
            />
          ) : (
            <ProductGrid
              products={sortedProducts}
              currentTier={currentTier}
              visiblePriceLists={visiblePriceLists}
              resolvePrice={resolvePrice}
              hasPriceAccess={hasPriceAccess}
              hasCartAccess={hasCartAccess}
              whiteLabelMode={whiteLabelMode}
              currencySymbol={company.currencySymbol}
              showStock={effectiveShowStock}
              onAddToCart={handleAddToCart}
              onRequestPriceAccess={() =>
                customer ? setIsCustomerOrdersOpen(true) : setIsCustomerAuthOpen(true)
              }
              isLoading={isSyncing && products.length === 0}
            />
          )}
        </main>
      </div>

      {hasCartAccess && (
        <CartDrawer
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          items={cart}
          currentTier={currentTier}
          activePriceList={activePriceList}
          resolvePrice={resolvePrice}
          userRole={userRole}
          whiteLabelMode={whiteLabelMode}
          onExitWhiteLabel={() => setWhiteLabelMode(false)}
          branchSlug={tenantSlug}
          onUpdateQuantity={handleUpdateQuantity}
          onSetQuantity={handleSetQuantity}
          onUpdateComment={handleUpdateComment}
          onRemoveItem={handleRemoveItem}
          onClearCart={handleClearCart}
          company={company}
          customer={customer}
        />
      )}

      <CustomerAuthModal
        isOpen={isCustomerAuthOpen}
        onClose={() => setIsCustomerAuthOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        currentBranchSlug={tenantSlug}
        countryName={countryName}
      />

      {customer && (
        <CustomerOrdersModal
          isOpen={isCustomerOrdersOpen}
          onClose={() => setIsCustomerOrdersOpen(false)}
          customer={customer}
          accessStatus={accessStatus}
          company={company}
          allBranchPriceLists={branchPriceLists}
          onRepeatOrder={handleRepeatOrder}
          onLogoutCustomer={handleLogoutCustomer}
          catalogProducts={products}
        />
      )}

      {customer && canToggleWhiteLabel && (
        <ResellerSettingsModal
          isOpen={isResellerSettingsOpen}
          onClose={() => setIsResellerSettingsOpen(false)}
          customer={customer}
          products={products}
          visiblePriceLists={visiblePriceLists}
          branchSlug={tenantSlug}
          currencySymbol={company.currencySymbol}
          onSaveConfig={handleSaveResellerConfig}
        />
      )}

      {hasPriceAccess && (
        <PDFCatalogModal
          isOpen={isPDFOpen}
          onClose={() => setIsPDFOpen(false)}
          products={products}
          categories={categories}
          company={company}
          visiblePriceLists={visiblePriceLists}
          branchSlug={tenantSlug}
          whiteLabelMode={whiteLabelMode}
          resellerConfig={customer?.resellerConfig}
        />
      )}

      {!whiteLabelMode && (
        <SocialMediaModal
          isOpen={isSocialOpen}
          onClose={() => setIsSocialOpen(false)}
          company={company}
        />
      )}

      <WelcomeModal
        isOpen={isWelcomeOpen}
        onClose={() => setIsWelcomeOpen(false)}
        company={company}
        visiblePriceLists={visiblePriceLists}
        currentTier={currentTier}
        onSelectTier={setCurrentTier}
        viewMode={viewMode}
        onSelectViewMode={setViewMode}
        customer={customer}
        accessStatus={accessStatus}
        hasPriceAccess={hasPriceAccess}
        whiteLabelMode={whiteLabelMode}
        resellerBrandTitle={customer?.resellerConfig?.brandTitle || 'Catálogo'}
        onOpenAccount={() => {
          setIsWelcomeOpen(false);
          setTimeout(() => {
            if (customer) setIsCustomerOrdersOpen(true);
            else setIsCustomerAuthOpen(true);
          }, 80);
        }}
      />

      {!whiteLabelMode && (
        <footer className="bg-[#3C5866] text-white py-5 border-t border-slate-700 mt-12">
          <div className="max-w-7xl mx-auto px-4 text-center space-y-1 text-xs text-slate-300">
            <p className="font-extrabold text-white text-sm">{company.name}</p>
            <p>{company.phone}</p>
          </div>
        </footer>
      )}
    </div>
  );
};
