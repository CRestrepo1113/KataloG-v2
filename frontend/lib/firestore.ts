import {
  Product,
  PublicProduct,
  PriceList,
  AccessRequest,
  ResellerConfig,
  CompanyInfo,
  ProductStatus,
  Branch,
  BranchOverride,
  Customer,
  CustomerOrder,
  CartItem,
} from './types';
import { INITIAL_PRODUCTS, INITIAL_COMPANY_INFO, INITIAL_BRANCHES } from './seed';
import { db, isFirebaseConfigured, flushPendingFirestoreWrites } from './firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { getIdb, setIdb, deleteIdb } from './idb';
import { getBaseSku } from './theme';
import {
  toPublicProductProjection,
  getDefaultPriceListsForBranch,
  mapListIdToLegacyTier,
} from './pricing';

const PRODUCTS_STORAGE_KEY = 'katalog_products_db';
const PUBLIC_CATALOG_STORAGE_KEY = 'katalog_public_catalog_db';
const PRICE_LISTS_STORAGE_KEY = 'katalog_price_lists_db';
const COMPANY_STORAGE_KEY = 'katalog_company_db';
const BRANCHES_STORAGE_KEY = 'katalog_branches_db';
const CUSTOMER_STORAGE_KEY = 'katalog_customer_profile';


// ==========================================
// IN-MEMORY HIGH PERFORMANCE CACHE
// ==========================================
let memoryProducts: Product[] | null = null;
let memoryPublicProducts: PublicProduct[] | null = null;
let memoryPriceLists: Record<string, PriceList[]> | null = null;
let memoryBranches: Branch[] | null = null;
let memoryCompanyMap: Record<string, CompanyInfo> | null = null;
const baseSkuImageMap = new Map<string, string>();

/**
 * Purga de inmediato las cachés locales con precios cuando el usuario cierra sesión
 * o su cuenta no está aprobada.
 */
export function clearProtectedCatalogCaches(): void {
  memoryProducts = null;
  memoryPriceLists = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(PRODUCTS_STORAGE_KEY);
      localStorage.removeItem(PRICE_LISTS_STORAGE_KEY);
    } catch {}
    deleteIdb(PRODUCTS_STORAGE_KEY).catch(() => {});
    deleteIdb(PRICE_LISTS_STORAGE_KEY).catch(() => {});
  }
}

export function updateBaseSkuImageMap(products: Product[]) {
  baseSkuImageMap.clear();
  if (!products || !Array.isArray(products)) return;
  for (const p of products) {
    if (
      p.processedImageUrl &&
      p.processedImageUrl !== '/assets/REF_1.jpg' &&
      !p.processedImageUrl.includes('REF_1.jpg') &&
      p.sku
    ) {
      const bSku = getBaseSku(p.sku);
      if (bSku && !baseSkuImageMap.has(bSku)) {
        baseSkuImageMap.set(bSku, p.processedImageUrl);
      }
    }
  }
}

export function getSharedProductImage(sku: string, directUrl?: string): string {
  if (
    directUrl &&
    directUrl.trim() &&
    directUrl !== '/assets/REF_1.jpg' &&
    !directUrl.includes('REF_1.jpg')
  ) {
    return directUrl;
  }
  if (!sku) return '';
  const bSku = getBaseSku(sku);
  const shared = bSku ? baseSkuImageMap.get(bSku) : '';
  if (shared && shared !== '/assets/REF_1.jpg' && !shared.includes('REF_1.jpg')) {
    return shared;
  }
  return '';
}

function safeSetLocalStorage(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // QuotaExceededError safely caught; data is persisted in IndexedDB
  }
}

// Recursively strips undefined fields which Firestore rejects with HTTP 400 Bad Request
// and strips oversized base64 data URLs in order/cart documents to prevent exceeding 1MB document limit
function cleanForFirestore<T>(obj: T): unknown {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanForFirestore(item));
  }
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (val !== undefined) {
      if (
        (key === 'imagen_url' || key === 'imageUrl') &&
        typeof val === 'string' &&
        (val.startsWith('data:') || val.length > 2048)
      ) {
        cleaned[key] = '';
      } else {
        cleaned[key] = cleanForFirestore(val);
      }
    }
  }
  return cleaned;
}

// ==========================================
// LOCAL STORAGE + INDEXEDDB CACHE HELPERS
// ==========================================

export function getLocalBranches(): Branch[] {
  if (memoryBranches !== null) return memoryBranches;
  if (typeof window === 'undefined') return INITIAL_BRANCHES;

  try {
    const stored = localStorage.getItem(BRANCHES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryBranches = parsed;
        return parsed;
      }
    }
  } catch {
    // fallback to initial
  }

  getIdb<Branch[]>(BRANCHES_STORAGE_KEY, INITIAL_BRANCHES).then((idbBranches) => {
    if (Array.isArray(idbBranches) && idbBranches.length > 0) {
      memoryBranches = idbBranches;
    }
  });

  safeSetLocalStorage(BRANCHES_STORAGE_KEY, JSON.stringify(INITIAL_BRANCHES));
  memoryBranches = INITIAL_BRANCHES;
  return INITIAL_BRANCHES;
}

function saveLocalBranches(branches: Branch[]) {
  memoryBranches = branches;
  if (typeof window !== 'undefined') {
    setIdb(BRANCHES_STORAGE_KEY, branches);
    safeSetLocalStorage(BRANCHES_STORAGE_KEY, JSON.stringify(branches));
  }
}

export function getLocalProducts(): Product[] {
  if (memoryProducts !== null) return memoryProducts;
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((p) => p.id && p.id.startsWith('pel-00'))
      ) {
        safeSetLocalStorage(PRODUCTS_STORAGE_KEY, JSON.stringify([]));
        memoryProducts = [];
        return [];
      }
      if (Array.isArray(parsed)) {
        const cleaned = parsed.map((p) =>
          p.processedImageUrl === '/assets/REF_1.jpg' || (p.processedImageUrl && p.processedImageUrl.includes('REF_1.jpg'))
            ? { ...p, processedImageUrl: '' }
            : p
        );
        memoryProducts = cleaned;
        updateBaseSkuImageMap(cleaned);
        return cleaned;
      }
    }
  } catch {
    // fallback
  }

  getIdb<Product[]>(PRODUCTS_STORAGE_KEY, []).then((idbProds) => {
    if (Array.isArray(idbProds) && idbProds.length > 0) {
      const cleaned = idbProds.map((p) =>
        p.processedImageUrl === '/assets/REF_1.jpg' || (p.processedImageUrl && p.processedImageUrl.includes('REF_1.jpg'))
          ? { ...p, processedImageUrl: '' }
          : p
      );
      memoryProducts = cleaned;
      updateBaseSkuImageMap(cleaned);
    }
  });

  return [];
}

function saveLocalProducts(products: Product[]) {
  const cleaned = products.map((p) =>
    p.processedImageUrl === '/assets/REF_1.jpg' || (p.processedImageUrl && p.processedImageUrl.includes('REF_1.jpg'))
      ? { ...p, processedImageUrl: '' }
      : p
  );
  memoryProducts = cleaned;
  updateBaseSkuImageMap(cleaned);
  if (typeof window !== 'undefined') {
    setIdb(PRODUCTS_STORAGE_KEY, cleaned);
    safeSetLocalStorage(PRODUCTS_STORAGE_KEY, JSON.stringify(cleaned));
  }
}

function getLocalCompanyInfoMap(): Record<string, CompanyInfo> {
  if (memoryCompanyMap !== null) return memoryCompanyMap;
  if (typeof window === 'undefined') return { default: INITIAL_COMPANY_INFO };

  try {
    const stored = localStorage.getItem(COMPANY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.name && !parsed.default) {
        memoryCompanyMap = { default: parsed };
        return memoryCompanyMap;
      }
      memoryCompanyMap = parsed;
      return parsed;
    }
  } catch {
    // fallback
  }

  getIdb<Record<string, CompanyInfo>>(COMPANY_STORAGE_KEY, { default: INITIAL_COMPANY_INFO }).then(
    (idbMap) => {
      if (idbMap) memoryCompanyMap = idbMap;
    }
  );

  const initialMap = { default: INITIAL_COMPANY_INFO };
  safeSetLocalStorage(COMPANY_STORAGE_KEY, JSON.stringify(initialMap));
  memoryCompanyMap = initialMap;
  return initialMap;
}

function saveLocalCompanyInfoMap(map: Record<string, CompanyInfo>) {
  memoryCompanyMap = map;
  if (typeof window !== 'undefined') {
    setIdb(COMPANY_STORAGE_KEY, map);
    safeSetLocalStorage(COMPANY_STORAGE_KEY, JSON.stringify(map));
  }
}

// ==========================================
// IMAGE UPLOAD HELPER (Direct Optimized WebP)
// ==========================================
export async function uploadProductImage(
  fileOrDataUrl: File | string,
  _fileName: string
): Promise<string> {
  if (typeof fileOrDataUrl === 'string') {
    return fileOrDataUrl;
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve('');
    reader.readAsDataURL(fileOrDataUrl);
  });
}

// ==========================================
// FIRESTORE SAFE QUERY HELPERS (CON TIMEOUT DEFENSIVO)
// ==========================================
async function safeGetDocs(queryRef: any, timeoutMs = 9000): Promise<any> {
  const queryPromise = getDocs(queryRef);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Firestore getDocs timeout after ${timeoutMs}ms`)), timeoutMs)
  );
  return Promise.race([queryPromise, timeoutPromise]);
}

async function safeGetDoc(docRef: any, timeoutMs = 5000): Promise<any> {
  const queryPromise = getDoc(docRef);
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Firestore getDoc timeout after ${timeoutMs}ms`)), timeoutMs)
  );
  return Promise.race([queryPromise, timeoutPromise]);
}

// ==========================================
// SUCURSALES / BRANCHES API
// ==========================================

export async function fetchBranches(): Promise<Branch[]> {
  if (memoryBranches === null) {
    const idbBranches = await getIdb<Branch[]>(BRANCHES_STORAGE_KEY, []);
    if (Array.isArray(idbBranches) && idbBranches.length > 0) {
      memoryBranches = idbBranches;
    }
  }

  if (isFirebaseConfigured() && db) {
    try {
      const snap = await safeGetDocs(collection(db, 'branches'), 5000);
      if (!snap.empty) {
        const branches: Branch[] = [];
        snap.forEach((docSnap: any) => {
          branches.push({ id: docSnap.id, ...docSnap.data() } as Branch);
        });
        saveLocalBranches(branches);
        return branches;
      }
    } catch (e) {
      console.warn('Firestore fetchBranches error, using cache:', e);
    }
  }
  return getLocalBranches();
}

export async function saveBranch(branchData: Partial<Branch> & { slug: string }): Promise<Branch> {
  const branches = getLocalBranches();
  const existingIdx = branches.findIndex((b) => b.slug === branchData.slug || b.id === branchData.id);

  let oldSlug: string | null = null;
  let updated: Branch;
  if (existingIdx !== -1) {
    oldSlug = branches[existingIdx].slug;
    updated = {
      ...branches[existingIdx],
      ...branchData,
      id: branchData.slug,
      slug: branchData.slug,
      showStock: branchData.showStock !== undefined ? branchData.showStock : (branches[existingIdx].showStock ?? true),
    };
    branches[existingIdx] = updated;
  } else {
    updated = {
      id: branchData.slug,
      name: branchData.name || `Sucursal ${branchData.slug.toUpperCase()}`,
      country: branchData.country || 'Internacional',
      currencySymbol: branchData.currencySymbol || '$',
      currencyCode: branchData.currencyCode || 'USD',
      phone: branchData.phone || '+100000000',
      isActive: branchData.isActive ?? true,
      showStock: branchData.showStock ?? true,
      ...branchData,
      slug: branchData.slug,
    };
    branches.push(updated);
  }

  saveLocalBranches(branches);

  // Synchronize company info map for this branch
  const map = getLocalCompanyInfoMap();
  if (oldSlug && oldSlug !== updated.slug && map[oldSlug]) {
    delete map[oldSlug];
  }

  const currentCompany = map[updated.slug] || INITIAL_COMPANY_INFO;
  map[updated.slug] = {
    ...currentCompany,
    tenantId: updated.slug,
    name: updated.name,
    country: updated.country,
    currencySymbol: updated.currencySymbol,
    currencyCode: updated.currencyCode,
    phone: updated.phone || currentCompany.phone,
    address: updated.address || currentCompany.address,
    slogan: updated.slogan || currentCompany.slogan,
    socialMedia: updated.socialMedia || currentCompany.socialMedia || '@kygdistribuciones',
    socialLinks: updated.socialLinks || currentCompany.socialLinks,
    logoUrl: updated.logoUrl || currentCompany.logoUrl || '/assets/Logo.png',
    showStock: updated.showStock !== undefined ? updated.showStock : (currentCompany.showStock ?? true),
  };
  saveLocalCompanyInfoMap(map);

  // Sync to Firestore
  if (isFirebaseConfigured() && db) {
    try {
      if (oldSlug && oldSlug !== updated.slug) {
        await deleteDoc(doc(db, 'branches', oldSlug)).catch(() => {});
        await deleteDoc(doc(db, 'company_info', oldSlug)).catch(() => {});
      }
      await setDoc(doc(db, 'branches', updated.slug), cleanForFirestore(updated) as Record<string, unknown>, { merge: true });
      await setDoc(doc(db, 'company_info', updated.slug), cleanForFirestore(map[updated.slug]) as Record<string, unknown>, { merge: true });
    } catch (e) {
      console.warn('Firestore saveBranch error:', e);
    }
  }

  return updated;
}

export async function deleteBranch(slug: string): Promise<boolean> {
  const branches = getLocalBranches();
  if (branches.length <= 1) {
    return false; // Minimum 1 branch required
  }
  const filtered = branches.filter((b) => b.slug !== slug && b.id !== slug);
  saveLocalBranches(filtered);

  const map = getLocalCompanyInfoMap();
  if (map[slug]) {
    delete map[slug];
    saveLocalCompanyInfoMap(map);
  }

  if (isFirebaseConfigured() && db) {
    try {
      await deleteDoc(doc(db, 'branches', slug));
      await deleteDoc(doc(db, 'company_info', slug));
    } catch (e) {
      console.warn('Firestore deleteBranch error:', e);
    }
  }

  return true;
}

// ==========================================
// COMPANY INFO API
// ==========================================

export async function fetchCompanyInfo(tenantId = 'default'): Promise<CompanyInfo> {
  if (memoryCompanyMap === null) {
    const idbMap = await getIdb<Record<string, CompanyInfo>>(COMPANY_STORAGE_KEY, {});
    if (idbMap && Object.keys(idbMap).length > 0) {
      memoryCompanyMap = idbMap;
    }
  }

  const map = getLocalCompanyInfoMap();
  const baseInfo = map[tenantId] || map['default'] || map['main'] || INITIAL_COMPANY_INFO;

  if (isFirebaseConfigured() && db) {
    try {
      const snap = await safeGetDoc(doc(db, 'company_info', tenantId), 5000);
      if (snap.exists()) {
        const firestoreInfo = snap.data() as CompanyInfo;
        map[tenantId] = firestoreInfo;
        saveLocalCompanyInfoMap(map);
        return firestoreInfo;
      }
      // Fallback to default if tenant specific doc doesn't exist
      const defaultSnap = await safeGetDoc(doc(db, 'company_info', 'default'), 4000);
      if (defaultSnap.exists()) {
        const defaultInfo = defaultSnap.data() as CompanyInfo;
        map['default'] = defaultInfo;
        saveLocalCompanyInfoMap(map);
        return defaultInfo;
      }
    } catch (e) {
      console.warn('Firestore fetchCompanyInfo error, using cache:', e);
    }
  }

  return baseInfo;
}

export async function saveCompanyInfo(
  info: Partial<CompanyInfo>,
  tenantId = 'default'
): Promise<CompanyInfo> {
  const map = getLocalCompanyInfoMap();
  const current = map[tenantId] || map['default'] || INITIAL_COMPANY_INFO;
  const updated: CompanyInfo = {
    ...current,
    ...info,
    tenantId,
  };

  map[tenantId] = updated;
  saveLocalCompanyInfoMap(map);

  if (isFirebaseConfigured() && db) {
    try {
      await setDoc(doc(db, 'company_info', tenantId), cleanForFirestore(updated) as Record<string, unknown>, { merge: true });
    } catch (e) {
      console.warn('Firestore saveCompanyInfo error:', e);
    }
  }

  return updated;
}

export const updateCompanyInfo = saveCompanyInfo;

export async function fetchAllBranchCompanyInfos(): Promise<Record<string, CompanyInfo>> {
  const localMap = getLocalCompanyInfoMap();
  const merged = { ...localMap };

  if (isFirebaseConfigured() && db) {
    try {
      const snap = await safeGetDocs(collection(db, 'company_info'), 6000);
      if (!snap.empty) {
        snap.forEach((d: any) => {
          merged[d.id] = d.data() as CompanyInfo;
        });
        saveLocalCompanyInfoMap(merged);
      }
    } catch (e) {
      console.warn('Firestore fetchAllBranchCompanyInfos error:', e);
    }
  }

  return merged;
}

// ==========================================
// PRODUCT RESOLUTION HELPERS
// ==========================================

export function normalizeBranchIdentifier(val?: string): string {
  if (!val) return '';
  const clean = val
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  if (clean.includes('honduras') || clean.includes('kyghn') || clean.endsWith('hn') || clean.endsWith('hon') || clean === 'hn' || clean === 'hon' || clean === 'hnd') return 'hn';
  if (clean.includes('costarica') || clean.includes('kygcr') || clean.endsWith('cr') || clean.endsWith('crc') || clean === 'cr' || clean === 'crc') return 'cr';
  if (clean.includes('colombia') || clean.includes('kygcol') || clean.includes('col') || clean.endsWith('co') || clean === 'co' || clean === 'cop') return 'co';
  if (clean.includes('mexico') || clean.includes('kygmex') || clean.includes('mex') || clean.endsWith('mx') || clean === 'mx' || clean === 'mxn') return 'mx';
  if (clean.includes('guatemala') || clean.includes('kyggt') || clean.endsWith('gt') || clean === 'gt' || clean === 'gtq') return 'gt';
  if (clean.includes('elsalvador') || clean.includes('salvador') || clean.endsWith('sv') || clean === 'sv' || clean === 'slv') return 'sv';
  if (clean.includes('nicaragua') || clean.endsWith('ni') || clean === 'ni' || clean === 'nic') return 'ni';
  if (clean.includes('panama') || clean.endsWith('pa') || clean === 'pa' || clean === 'pan') return 'pa';
  if (clean.includes('peru') || clean.endsWith('pe') || clean === 'pe' || clean === 'per') return 'pe';
  if (clean.includes('chile') || clean.endsWith('cl') || clean === 'cl' || clean === 'chl') return 'cl';
  if (clean.includes('argentina') || clean.endsWith('ar') || clean === 'ar' || clean === 'arg') return 'ar';
  if (clean.includes('ecuador') || clean.endsWith('ec') || clean === 'ec' || clean === 'ecu') return 'ec';
  if (clean.includes('dominicana') || clean.endsWith('do') || clean === 'do' || clean === 'dom') return 'do';
  return clean;
}

export function getBranchOverride(prod: Product, tenantId?: string): BranchOverride | undefined {
  if (!prod || !prod.branchOverrides || !tenantId) return undefined;
  if (prod.branchOverrides[tenantId] !== undefined) {
    return prod.branchOverrides[tenantId];
  }
  const targetCode = normalizeBranchIdentifier(tenantId);
  if (targetCode) {
    if (prod.branchOverrides[targetCode] !== undefined) {
      return prod.branchOverrides[targetCode];
    }
    for (const [key, val] of Object.entries(prod.branchOverrides)) {
      if (normalizeBranchIdentifier(key) === targetCode) {
        return val;
      }
    }
  }
  return undefined;
}

export function isProductInBranch(prod: Product, tenantId: string): boolean {
  if (!tenantId || tenantId === 'all' || tenantId === 'global') return true;

  const targetCode = normalizeBranchIdentifier(tenantId);

  // 1. Explicit branch override configured for this branch
  const override = getBranchOverride(prod, tenantId);
  if (override !== undefined) {
    return true;
  }

  // 2. Suffix in SKU check (e.g. "0674-52 HON", "PEL-51 CR")
  const match = prod.sku?.match(/[\s\-_]+(HON|HN|CR|COL|CO|MX|MEX|GT|SV|NI|PA|PE|CL|AR|EC|DO)$/i);
  if (match) {
    const skuCode = normalizeBranchIdentifier(match[1]);
    if (skuCode) {
      return skuCode === targetCode;
    }
  }

  // 3. Direct tenantId check
  if (prod.tenantId && prod.tenantId !== 'default' && prod.tenantId !== 'main') {
    if (prod.tenantId === tenantId) return true;
    const prodCode = normalizeBranchIdentifier(prod.tenantId);
    if (prodCode) {
      if (targetCode && prodCode === targetCode) return true;
      if (targetCode && prodCode !== targetCode) return false;
    }
  }

  // 4. Default global items (no tenant specified or default/main)
  return true;
}

// ==========================================
// PRODUCTS CRUD API (INDEXEDDB + FIRESTORE + CACHE)
// ==========================================

// Fetch products resolved for a specific branch (Master Catalog + Branch Overrides)
export async function fetchProducts(includeDisabled = false, tenantId = 'default'): Promise<Product[]> {
  let masterProducts: Product[] = memoryProducts || [];

  if (masterProducts.length === 0) {
    const idbProds = await getIdb<Product[]>(PRODUCTS_STORAGE_KEY, []);
    if (Array.isArray(idbProds) && idbProds.length > 0) {
      masterProducts = idbProds;
      memoryProducts = idbProds;
    } else {
      masterProducts = getLocalProducts();
    }
  }

  if (isFirebaseConfigured() && db) {
    const firestoreDb = db;
    try {
      const snap = await safeGetDocs(collection(firestoreDb, 'products'), 14000);
      if (!snap.empty) {
        const firestoreProducts: Product[] = [];
        const toCleanIds: string[] = [];
        snap.forEach((d: any) => {
          const raw = d.data();
          const prod: Product = { id: d.id, ...raw } as Product;

          // Optimización de rendimiento: eliminar originalImageUrl para el catálogo de clientes
          if (!includeDisabled && prod.processedImageUrl) {
            delete (prod as any).originalImageUrl;
          }

          if (
            prod.processedImageUrl === '/assets/REF_1.jpg' ||
            (prod.processedImageUrl && prod.processedImageUrl.includes('REF_1.jpg'))
          ) {
            prod.processedImageUrl = '';
            toCleanIds.push(d.id);
          }
          firestoreProducts.push(prod);
        });
        if (firestoreProducts.length > 0) {
          masterProducts = firestoreProducts;
          saveLocalProducts(firestoreProducts);
        }
        if (toCleanIds.length > 0) {
          (async () => {
            try {
              const CHUNK = 20;
              for (let i = 0; i < toCleanIds.length; i += CHUNK) {
                const batch = writeBatch(firestoreDb);
                toCleanIds.slice(i, i + CHUNK).forEach((docId) => {
                  batch.update(doc(firestoreDb, 'products', docId), { processedImageUrl: '' });
                });
                await batch.commit();
              }
            } catch (err) {
              console.warn('Auto-cleanup of placeholder images in Firestore:', err);
            }
          })();
        }
      } else {
        masterProducts = [];
        saveLocalProducts([]);
      }
    } catch (e) {
      console.warn('Firestore fetchProducts error, using local cache:', e);
    }
  }

  // Filter products strictly for the selected branch
  const branchProducts = masterProducts.filter((p) => isProductInBranch(p, tenantId));

  const resolved = branchProducts.map((prod) => {
    const override = getBranchOverride(prod, tenantId);
    if (!override) {
      return prod;
    }

    return {
      ...prod,
      prices: override.prices || prod.prices,
      stock: override.stock ?? prod.stock,
      status: override.status || prod.status,
      filledWeight: override.filledWeight !== undefined ? override.filledWeight : prod.filledWeight,
    };
  });

  if (includeDisabled) {
    return resolved;
  }
  return resolved.filter((p) => p.status !== 'disabled');
}

// ==========================================
// PUBLIC CATALOG API (Cero Precios - Para visitantes / pendientes)
// ==========================================

export function getLocalPublicCatalog(): PublicProduct[] {
  if (memoryPublicProducts !== null) return memoryPublicProducts;
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(PUBLIC_CATALOG_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        memoryPublicProducts = parsed;
        updateBaseSkuImageMap(parsed as unknown as Product[]);
        return parsed;
      }
    }
  } catch {}
  return [];
}

function saveLocalPublicCatalog(items: PublicProduct[]) {
  memoryPublicProducts = items;
  updateBaseSkuImageMap(items as unknown as Product[]);
  if (typeof window !== 'undefined') {
    setIdb(PUBLIC_CATALOG_STORAGE_KEY, items);
    safeSetLocalStorage(PUBLIC_CATALOG_STORAGE_KEY, JSON.stringify(items));
  }
}

function publicToSafeProductShell(pub: PublicProduct): Product {
  return {
    ...pub,
    prices: { unit: 0, dozen: 0, wholesale: 0 },
    branchOverrides: pub.branchOverrides as unknown as Record<string, BranchOverride> | undefined,
  };
}

export async function fetchPublicCatalog(tenantId = 'default'): Promise<Product[]> {
  let masterPublic: PublicProduct[] = memoryPublicProducts || [];
  if (masterPublic.length === 0) {
    const idbPub = await getIdb<PublicProduct[]>(PUBLIC_CATALOG_STORAGE_KEY, []);
    if (Array.isArray(idbPub) && idbPub.length > 0) {
      masterPublic = idbPub;
      memoryPublicProducts = idbPub;
    } else {
      masterPublic = getLocalPublicCatalog();
    }
  }

  if (isFirebaseConfigured() && db) {
    try {
      const snap = await safeGetDocs(collection(db, 'catalog_public'), 14000);
      if (!snap.empty) {
        const list: PublicProduct[] = [];
        snap.forEach((d: any) => {
          const raw = d.data();
          // Garantía defensiva adicional: jamás retener precios aunque existieran
          const { prices: _ignored, ...safeRaw } = raw || {};
          list.push({ id: d.id, ...safeRaw } as PublicProduct);
        });
        masterPublic = list;
        saveLocalPublicCatalog(list);
      } else {
        masterPublic = [];
        saveLocalPublicCatalog([]);
      }
    } catch (e) {
      console.warn('Firestore fetchPublicCatalog error, using local cache:', e);
    }
  }

  return masterPublic
    .map(publicToSafeProductShell)
    .filter((p) => isProductInBranch(p, tenantId))
    .map((prod) => {
      const override = getBranchOverride(prod, tenantId);
      if (!override) return prod;
      return {
        ...prod,
        stock: override.stock ?? prod.stock,
        status: override.status || prod.status,
        filledWeight: override.filledWeight !== undefined ? override.filledWeight : prod.filledWeight,
      };
    })
    .filter((p) => p.status !== 'disabled');
}

export function getInstantPublicCatalogData(tenantSlug: string = 'default') {
  const branches = getLocalBranches();
  const rawSlug = tenantSlug || 'default';
  const normalizedSlug = rawSlug === 'costa-rica' ? 'costarica' : rawSlug;
  const currentBranch = branches.find(
    (b) => b.slug === normalizedSlug || b.slug === rawSlug || b.id === normalizedSlug
  );
  const map = getLocalCompanyInfoMap();
  let comp = map[normalizedSlug] || map[rawSlug] || map['default'] || map['main'] || INITIAL_COMPANY_INFO;
  if (currentBranch) {
    comp = {
      ...comp,
      name: currentBranch.name || comp.name,
      phone: currentBranch.phone || comp.phone,
      address: currentBranch.address || comp.address,
      slogan: currentBranch.slogan || comp.slogan,
      socialMedia: currentBranch.socialMedia || comp.socialMedia,
      socialLinks: currentBranch.socialLinks || comp.socialLinks,
      currencySymbol: currentBranch.currencySymbol || comp.currencySymbol,
      currencyCode: currentBranch.currencyCode || comp.currencyCode,
      logoUrl: currentBranch.logoUrl || comp.logoUrl,
      country: currentBranch.country || comp.country,
      orderPrefix: currentBranch.orderPrefix || (currentBranch.slug === 'costarica' ? 'CR' : currentBranch.slug === 'mexico' ? 'MX' : currentBranch.slug === 'default' ? 'CO' : currentBranch.country?.substring(0, 2).toUpperCase() || 'CR'),
      showStock: currentBranch.showStock !== undefined ? currentBranch.showStock : (comp.showStock ?? true),
    };
  }

  const prods = getLocalPublicCatalog()
    .map(publicToSafeProductShell)
    .filter((p) => isProductInBranch(p, normalizedSlug))
    .map((prod) => {
      const override = getBranchOverride(prod, normalizedSlug);
      if (!override) return prod;
      return {
        ...prod,
        stock: override.stock ?? prod.stock,
        status: override.status || prod.status,
        filledWeight: override.filledWeight !== undefined ? override.filledWeight : prod.filledWeight,
      };
    })
    .filter((p) => p.status !== 'disabled');

  return { branches, currentBranch, company: comp, products: prods };
}

export async function loadPublicCatalogDataParallel(tenantSlug: string = 'default') {
  const rawSlug = tenantSlug || 'default';
  const normalizedSlug = rawSlug === 'costa-rica' ? 'costarica' : rawSlug;

  const [branches, comp, prods] = await Promise.all([
    fetchBranches(),
    fetchCompanyInfo(normalizedSlug),
    fetchPublicCatalog(normalizedSlug),
  ]);

  const currentBranch = branches.find(
    (b) => b.slug === normalizedSlug || b.slug === rawSlug || b.id === normalizedSlug
  );

  let mergedCompany = comp;
  if (currentBranch) {
    mergedCompany = {
      ...comp,
      name: currentBranch.name || comp.name,
      phone: currentBranch.phone || comp.phone,
      address: currentBranch.address || comp.address,
      slogan: currentBranch.slogan || comp.slogan,
      socialMedia: currentBranch.socialMedia || comp.socialMedia,
      socialLinks: currentBranch.socialLinks || comp.socialLinks,
      currencySymbol: currentBranch.currencySymbol || comp.currencySymbol,
      currencyCode: currentBranch.currencyCode || comp.currencyCode,
      logoUrl: currentBranch.logoUrl || comp.logoUrl,
      country: currentBranch.country || comp.country,
      orderPrefix: currentBranch.orderPrefix || (currentBranch.slug === 'costarica' ? 'CR' : currentBranch.slug === 'mexico' ? 'MX' : currentBranch.slug === 'default' ? 'CO' : currentBranch.country?.substring(0, 2).toUpperCase() || 'CR'),
      showStock: currentBranch.showStock !== undefined ? currentBranch.showStock : (comp.showStock ?? true),
    };
  }

  return { branches, currentBranch, company: mergedCompany, products: prods };
}

// ==========================================
// FAST INSTANT LOADERS & PARALLEL SWR SYNC
// ==========================================

export function getInstantCatalogData(tenantSlug: string = 'default') {
  const branches = getLocalBranches();
  const rawSlug = tenantSlug || 'default';
  const normalizedSlug = rawSlug === 'costa-rica' ? 'costarica' : rawSlug;

  const currentBranch = branches.find(
    (b) => b.slug === normalizedSlug || b.slug === rawSlug || b.id === normalizedSlug
  );

  const map = getLocalCompanyInfoMap();
  let comp = map[normalizedSlug] || map[rawSlug] || map['default'] || map['main'] || INITIAL_COMPANY_INFO;
  if (currentBranch) {
    comp = {
      ...comp,
      name: currentBranch.name || comp.name,
      phone: currentBranch.phone || comp.phone,
      address: currentBranch.address || comp.address,
      slogan: currentBranch.slogan || comp.slogan,
      socialMedia: currentBranch.socialMedia || comp.socialMedia,
      socialLinks: currentBranch.socialLinks || comp.socialLinks,
      currencySymbol: currentBranch.currencySymbol || comp.currencySymbol,
      currencyCode: currentBranch.currencyCode || comp.currencyCode,
      logoUrl: currentBranch.logoUrl || comp.logoUrl,
      country: currentBranch.country || comp.country,
      orderPrefix: currentBranch.orderPrefix || (currentBranch.slug === 'costarica' ? 'CR' : currentBranch.slug === 'mexico' ? 'MX' : currentBranch.slug === 'default' ? 'CO' : currentBranch.country?.substring(0, 2).toUpperCase() || 'CR'),
      showStock: currentBranch.showStock !== undefined ? currentBranch.showStock : (comp.showStock ?? true),
    };
  }


  const prods = getLocalProducts().filter((p) => isProductInBranch(p, normalizedSlug));
  const resolved = prods
    .map((prod) => {
      const override = getBranchOverride(prod, normalizedSlug);
      if (!override) return prod;
      return {
        ...prod,
        prices: override.prices || prod.prices,
        stock: override.stock ?? prod.stock,
        status: override.status || prod.status,
        filledWeight: override.filledWeight !== undefined ? override.filledWeight : prod.filledWeight,
      };
    })
    .filter((p) => p.status !== 'disabled');

  return {
    branches,
    currentBranch,
    company: comp,
    products: resolved,
  };
}

export async function loadCatalogDataParallel(tenantSlug: string = 'default') {
  const rawSlug = tenantSlug || 'default';
  const normalizedSlug = rawSlug === 'costa-rica' ? 'costarica' : rawSlug;

  const [branches, comp, prods] = await Promise.all([
    fetchBranches(),
    fetchCompanyInfo(normalizedSlug),
    fetchProducts(false, normalizedSlug),
  ]);

  const currentBranch = branches.find(
    (b) => b.slug === normalizedSlug || b.slug === rawSlug || b.id === normalizedSlug
  );

  let mergedCompany = comp;
  if (currentBranch) {
    mergedCompany = {
      ...comp,
      name: currentBranch.name || comp.name,
      phone: currentBranch.phone || comp.phone,
      address: currentBranch.address || comp.address,
      slogan: currentBranch.slogan || comp.slogan,
      socialMedia: currentBranch.socialMedia || comp.socialMedia,
      socialLinks: currentBranch.socialLinks || comp.socialLinks,
      currencySymbol: currentBranch.currencySymbol || comp.currencySymbol,
      currencyCode: currentBranch.currencyCode || comp.currencyCode,
      logoUrl: currentBranch.logoUrl || comp.logoUrl,
      country: currentBranch.country || comp.country,
      orderPrefix: currentBranch.orderPrefix || (currentBranch.slug === 'costarica' ? 'CR' : currentBranch.slug === 'mexico' ? 'MX' : currentBranch.slug === 'default' ? 'CO' : currentBranch.country?.substring(0, 2).toUpperCase() || 'CR'),
      showStock: currentBranch.showStock !== undefined ? currentBranch.showStock : (comp.showStock ?? true),
    };
  }

  return {
    branches,
    currentBranch,
    company: mergedCompany,
    products: prods,
  };
}

export function getInstantAdminData(branchSlug?: string) {
  const branches = getLocalBranches();
  const targetSlug = branchSlug || (branches.length > 0 ? branches[0].slug : 'costarica');
  const currentBranch = branches.find((b) => b.slug === targetSlug || b.id === targetSlug);

  const map = getLocalCompanyInfoMap();
  let comp = map[targetSlug] || map['default'] || map['main'] || INITIAL_COMPANY_INFO;
  if (currentBranch) {
    comp = {
      ...comp,
      name: currentBranch.name || comp.name,
      phone: currentBranch.phone || comp.phone,
      address: currentBranch.address || comp.address,
      slogan: currentBranch.slogan || comp.slogan,
      socialMedia: currentBranch.socialMedia || comp.socialMedia,
      socialLinks: currentBranch.socialLinks || comp.socialLinks,
      currencySymbol: currentBranch.currencySymbol || comp.currencySymbol,
      currencyCode: currentBranch.currencyCode || comp.currencyCode,
      logoUrl: currentBranch.logoUrl || comp.logoUrl,
      country: currentBranch.country || comp.country,
      orderPrefix: currentBranch.orderPrefix || (currentBranch.slug === 'costarica' ? 'CR' : currentBranch.slug === 'mexico' ? 'MX' : currentBranch.slug === 'default' ? 'CO' : currentBranch.country?.substring(0, 2).toUpperCase() || 'CR'),
      showStock: currentBranch.showStock !== undefined ? currentBranch.showStock : (comp.showStock ?? true),
    };
  }

  const prods = getLocalProducts().filter((p) => isProductInBranch(p, targetSlug));
  const resolved = prods.map((prod) => {
    const override = getBranchOverride(prod, targetSlug);
    if (!override) return prod;
    return {
      ...prod,
      prices: override.prices || prod.prices,
      stock: override.stock ?? prod.stock,
      status: override.status || prod.status,
      filledWeight: override.filledWeight !== undefined ? override.filledWeight : prod.filledWeight,
    };
  });

  return {
    branches,
    targetSlug,
    currentBranch,
    company: comp,
    products: resolved,
  };
}

export async function loadAdminDataParallel(branchSlug: string) {
  const [branches, comp, prods] = await Promise.all([
    fetchBranches(),
    fetchCompanyInfo(branchSlug),
    fetchProducts(true, branchSlug),
  ]);

  const currentBranch = branches.find(
    (b) => b.slug === branchSlug || b.id === branchSlug
  );

  let mergedCompany = comp;
  if (currentBranch) {
    mergedCompany = {
      ...comp,
      name: currentBranch.name || comp.name,
      phone: currentBranch.phone || comp.phone,
      address: currentBranch.address || comp.address,
      slogan: currentBranch.slogan || comp.slogan,
      socialMedia: currentBranch.socialMedia || comp.socialMedia,
      socialLinks: currentBranch.socialLinks || comp.socialLinks,
      currencySymbol: currentBranch.currencySymbol || comp.currencySymbol,
      currencyCode: currentBranch.currencyCode || comp.currencyCode,
      logoUrl: currentBranch.logoUrl || comp.logoUrl,
      country: currentBranch.country || comp.country,
      orderPrefix: currentBranch.orderPrefix || (currentBranch.slug === 'costarica' ? 'CR' : currentBranch.slug === 'mexico' ? 'MX' : currentBranch.slug === 'default' ? 'CO' : currentBranch.country?.substring(0, 2).toUpperCase() || 'CR'),
      showStock: currentBranch.showStock !== undefined ? currentBranch.showStock : (comp.showStock ?? true),
    };
  }


  return {
    branches,
    currentBranch,
    company: mergedCompany,
    products: prods,
  };
}

export async function saveProduct(
  productData: Omit<Product, 'id'> & { id?: string },
  tenantId = 'default'
): Promise<Product> {
  const products = getLocalProducts();
  const now = new Date().toISOString();
  let resultProduct: Product;

  if (productData.id) {
    const index = products.findIndex((p) => p.id === productData.id);
    if (index !== -1) {
      const target = products[index];

      const catList = (productData.category || target.category || '')
        .split(/[,/|;\n]/)
        .map((c) => c.trim())
        .filter(Boolean);
      const computedCategories = productData.categories || (catList.length > 0 ? catList : [productData.category || target.category]);
      const computedTags = productData.tags || [
        ...catList.map((c) => c.toLowerCase()),
        (productData.name || target.name || '').toLowerCase(),
      ];

      // If saving for default/main, update master product directly
      if (!tenantId || tenantId === 'default' || tenantId === 'main') {
        const updatedProduct: Product = {
          ...target,
          ...productData,
          category: productData.category || target.category,
          categories: computedCategories,
          tags: computedTags,
          filledWeight: productData.filledWeight !== undefined ? productData.filledWeight : target.filledWeight,
          updatedAt: now,
        } as Product;
        products[index] = updatedProduct;
        saveLocalProducts(products);
        resultProduct = updatedProduct;
      } else {
        // If saving for a specific branch (e.g. costarica), update master photo/SKU/size and save branch override
        const targetBranchCode = normalizeBranchIdentifier(tenantId);
        const currentOverrides = target.branchOverrides || {};
        const branchOverridePayload: BranchOverride = {
          prices: productData.prices || target.prices,
          stock: productData.stock ?? target.stock,
          status: productData.status || target.status,
          filledWeight: productData.filledWeight !== undefined ? productData.filledWeight : (currentOverrides[tenantId]?.filledWeight ?? target.filledWeight),
        };
        const updatedOverrides: Record<string, BranchOverride> = {
          ...currentOverrides,
          [tenantId]: branchOverridePayload,
        };
        if (targetBranchCode && targetBranchCode !== tenantId) {
          updatedOverrides[targetBranchCode] = branchOverridePayload;
        }

        const updatedProduct: Product = {
          ...target,
          ...productData,
          sku: productData.sku || target.sku,
          name: productData.name || target.name,
          category: productData.category || target.category,
          categories: computedCategories,
          tags: computedTags,
          size: productData.size !== undefined ? productData.size : target.size,
          filledWeight: productData.filledWeight !== undefined ? productData.filledWeight : target.filledWeight,
          processedImageUrl: productData.processedImageUrl || target.processedImageUrl,
          branchOverrides: updatedOverrides,
          updatedAt: now,
        };

        products[index] = updatedProduct;
        saveLocalProducts(products);
        resultProduct = updatedProduct;
      }
    } else {
      resultProduct = {
        ...productData,
        id: productData.id,
        tenantId: tenantId && tenantId !== 'default' && tenantId !== 'main' ? tenantId : productData.tenantId || 'default',
        filledWeight: productData.filledWeight,
        createdAt: now,
        updatedAt: now,
      } as Product;
      products.unshift(resultProduct);
      saveLocalProducts(products);
    }
  } else {
    // Create new master product
    resultProduct = {
      ...productData,
      id: `pel-${Date.now()}`,
      tenantId: tenantId && tenantId !== 'default' && tenantId !== 'main' ? tenantId : productData.tenantId || 'default',
      filledWeight: productData.filledWeight,
      branchOverrides: tenantId && tenantId !== 'default' && tenantId !== 'main' ? {
        [tenantId]: {
          prices: productData.prices,
          stock: productData.stock,
          status: productData.status,
          filledWeight: productData.filledWeight,
        }
      } : undefined,
      createdAt: now,
      updatedAt: now,
    } as Product;

    products.unshift(resultProduct);
    saveLocalProducts(products);
  }

  // Sync dual a Firestore: products (maestro) + catalog_public (sin precios)
  if (isFirebaseConfigured() && db && resultProduct.id) {
    try {
      const cleanDoc = cleanForFirestore(resultProduct) as Record<string, unknown>;
      const cleanPublic = cleanForFirestore(toPublicProductProjection(resultProduct)) as Record<string, unknown>;
      const batch = writeBatch(db);
      batch.set(doc(db, 'products', resultProduct.id), cleanDoc, { merge: true });
      batch.set(doc(db, 'catalog_public', resultProduct.id), cleanPublic, { merge: true });
      await batch.commit();
    } catch (e) {
      console.warn('Firestore saveProduct error:', e);
    }
  }

  return resultProduct;
}


export async function bulkSaveProducts(importedProducts: Product[], tenantId = 'default'): Promise<Product[]> {
  let currentProducts = memoryProducts;
  if (!currentProducts || currentProducts.length === 0) {
    const idbProds = await getIdb<Product[]>(PRODUCTS_STORAGE_KEY, []);
    if (Array.isArray(idbProds) && idbProds.length > 0) {
      currentProducts = idbProds;
      memoryProducts = idbProds;
    } else {
      currentProducts = getLocalProducts();
    }
  }
  currentProducts = currentProducts ? [...currentProducts] : [];

  const targetBranchCode = normalizeBranchIdentifier(tenantId);

  // Maintain stable maps to prevent any array index shifting bugs
  const productById = new Map<string, Product>();
  const productByCleanSku = new Map<string, Product>();
  const productByNoSep = new Map<string, Product>();
  const productByBaseSku = new Map<string, Product[]>();

  currentProducts.forEach((p) => {
    if (p.id) productById.set(p.id, p);
    if (p.sku) {
      const clean = p.sku.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase();
      if (!productByCleanSku.has(clean)) productByCleanSku.set(clean, p);

      const noSep = clean.replace(/[\s\-_]/g, '');
      if (noSep && !productByNoSep.has(noSep)) {
        productByNoSep.set(noSep, p);
      }

      const bSku = getBaseSku(clean);
      if (bSku) {
        const arr = productByBaseSku.get(bSku) || [];
        arr.push(p);
        productByBaseSku.set(bSku, arr);
      }
    }
  });

  const workingList = [...currentProducts];
  const productsToUpsert: Product[] = [];

  importedProducts.forEach((imp) => {
    const cleanImpSku = (imp.sku || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase();
    const impNoSep = cleanImpSku.replace(/[\s\-_]/g, '');
    const impBaseSku = getBaseSku(cleanImpSku);

    // 1. Find existing target product by priority
    let target: Product | undefined = undefined;

    if (imp.id && productById.has(imp.id)) {
      target = productById.get(imp.id);
    }
    if (!target && cleanImpSku && productByCleanSku.has(cleanImpSku)) {
      target = productByCleanSku.get(cleanImpSku);
    }
    if (!target && impNoSep && productByNoSep.has(impNoSep)) {
      target = productByNoSep.get(impNoSep);
    }
    if (!target && impBaseSku && productByBaseSku.has(impBaseSku)) {
      const candidates = productByBaseSku.get(impBaseSku) || [];
      // Prioritize candidate matching the current active branch
      target = candidates.find((c) => isProductInBranch(c, tenantId)) || candidates[0];
    }

    const validFilledWeight =
      typeof imp.filledWeight === 'number' && !isNaN(imp.filledWeight)
        ? imp.filledWeight
        : undefined;

    if (target) {
      // Preserve existing valid image if none supplied in import
      const currentValidTargetImg =
        target.processedImageUrl &&
        target.processedImageUrl !== '/assets/REF_1.jpg' &&
        !target.processedImageUrl.includes('REF_1.jpg')
          ? target.processedImageUrl
          : '';

      const resolvedImage =
        imp.processedImageUrl &&
        imp.processedImageUrl !== '/assets/REF_1.jpg' &&
        !imp.processedImageUrl.includes('REF_1.jpg')
          ? imp.processedImageUrl
          : currentValidTargetImg;

      const categoryList = (imp.category || target.category || '')
        .split(/[,/|;\n]/)
        .map((c) => c.trim())
        .filter(Boolean);
      const computedCategories =
        imp.categories && imp.categories.length > 0
          ? imp.categories
          : categoryList.length > 0
          ? categoryList
          : [imp.category || target.category || 'General'];
      const computedTags = imp.tags && imp.tags.length > 0 ? imp.tags : [
        ...categoryList.map((c) => c.toLowerCase()),
        (imp.name || target.name || '').toLowerCase(),
      ];

      const resolvedWeight =
        validFilledWeight !== undefined ? validFilledWeight : target.filledWeight;

      const currentOverrides = target.branchOverrides || {};
      const targetOverride = getBranchOverride(target, tenantId);

      const resolvedPrices =
        imp.prices && (imp.prices.unit > 0 || imp.prices.dozen > 0 || imp.prices.wholesale > 0)
          ? imp.prices
          : (targetOverride?.prices || target.prices);

      const resolvedStock =
        imp.stock !== undefined ? imp.stock : (targetOverride?.stock ?? target.stock);

      const resolvedStatus =
        imp.status || targetOverride?.status || target.status;

      let merged: Product;

      if (!tenantId || tenantId === 'default' || tenantId === 'main') {
        merged = {
          ...target,
          name: imp.name || target.name,
          category: imp.category || target.category,
          categories: computedCategories,
          tags: computedTags,
          size: imp.size !== undefined && imp.size !== '' ? imp.size : target.size,
          filledWeight: resolvedWeight,
          stock: resolvedStock,
          prices: resolvedPrices,
          status: resolvedStatus,
          processedImageUrl: resolvedImage,
          updatedAt: new Date().toISOString(),
        };
      } else {
        const branchOverridePayload: BranchOverride = {
          prices: resolvedPrices,
          stock: resolvedStock,
          status: resolvedStatus,
          filledWeight: resolvedWeight,
        };

        const updatedOverrides = {
          ...currentOverrides,
          [tenantId]: branchOverridePayload,
        };
        if (targetBranchCode && targetBranchCode !== tenantId) {
          updatedOverrides[targetBranchCode] = branchOverridePayload;
        }

        merged = {
          ...target,
          name: imp.name || target.name,
          category: imp.category || target.category,
          categories: computedCategories,
          tags: computedTags,
          size: imp.size !== undefined && imp.size !== '' ? imp.size : target.size,
          filledWeight: resolvedWeight,
          stock: resolvedStock,
          prices: resolvedPrices,
          status: resolvedStatus,
          processedImageUrl: resolvedImage,
          branchOverrides: updatedOverrides,
          updatedAt: new Date().toISOString(),
        };
      }

      // Update in working array in-place without altering other indices
      const listIdx = workingList.findIndex((p) => p.id === target.id);
      if (listIdx !== -1) {
        workingList[listIdx] = merged;
      } else {
        workingList.push(merged);
      }

      // Update lookup maps with merged product
      productById.set(merged.id, merged);
      if (merged.sku) {
        const cSku = merged.sku.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase();
        productByCleanSku.set(cSku, merged);
      }

      productsToUpsert.push(merged);
    } else {
      // CREATE BRAND NEW PRODUCT
      const cleanImpImage =
        imp.processedImageUrl &&
        imp.processedImageUrl !== '/assets/REF_1.jpg' &&
        !imp.processedImageUrl.includes('REF_1.jpg')
          ? imp.processedImageUrl
          : '';

      const categoryList = (imp.category || 'General')
        .split(/[,/|;\n]/)
        .map((c) => c.trim())
        .filter(Boolean);
      const computedCategories =
        imp.categories && imp.categories.length > 0
          ? imp.categories
          : categoryList.length > 0
          ? categoryList
          : [imp.category || 'General'];
      const computedTags = imp.tags && imp.tags.length > 0 ? imp.tags : [
        ...categoryList.map((c) => c.toLowerCase()),
        (imp.name || '').toLowerCase(),
      ];

      const safeId =
        imp.id && !imp.id.startsWith('pel-imp-')
          ? imp.id
          : `pel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${cleanImpSku.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;

      const newOverrides: Record<string, BranchOverride> = {};
      if (tenantId && tenantId !== 'default' && tenantId !== 'main') {
        const bPayload: BranchOverride = {
          prices: imp.prices,
          stock: imp.stock,
          status: imp.status || (imp.stock > 0 ? 'active' : 'out_of_stock'),
          filledWeight: validFilledWeight,
        };
        newOverrides[tenantId] = bPayload;
        if (targetBranchCode && targetBranchCode !== tenantId) {
          newOverrides[targetBranchCode] = bPayload;
        }
      }

      const newProd: Product = {
        id: safeId,
        sku: cleanImpSku,
        name: imp.name || 'Producto Importado',
        category: imp.category || 'General',
        categories: computedCategories,
        tags: computedTags,
        size: imp.size || '',
        filledWeight: validFilledWeight,
        stock: imp.stock ?? 12,
        status: imp.status || (imp.stock > 0 ? 'active' : 'out_of_stock'),
        prices: imp.prices || { wholesale: 0, dozen: 0, unit: 0 },
        processedImageUrl: cleanImpImage,
        tenantId: tenantId && tenantId !== 'default' && tenantId !== 'main' ? tenantId : imp.tenantId || 'default',
        branchOverrides: Object.keys(newOverrides).length > 0 ? newOverrides : imp.branchOverrides,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      workingList.push(newProd);
      productById.set(newProd.id, newProd);
      if (cleanImpSku) productByCleanSku.set(cleanImpSku, newProd);
      if (impNoSep) productByNoSep.set(impNoSep, newProd);
      if (impBaseSku) {
        const arr = productByBaseSku.get(impBaseSku) || [];
        arr.push(newProd);
        productByBaseSku.set(impBaseSku, arr);
      }

      productsToUpsert.push(newProd);
    }
  });

  saveLocalProducts(workingList);

  // Sync to Firestore in small chunks of 10 products (20 writes: products + catalog_public)
  if (isFirebaseConfigured() && db && productsToUpsert.length > 0) {
    try {
      const CHUNK_SIZE = 10;
      for (let i = 0; i < productsToUpsert.length; i += CHUNK_SIZE) {
        const chunk = productsToUpsert.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((p) => {
          if (p.id) {
            const cleanDoc = cleanForFirestore(p) as Record<string, unknown>;
            const cleanPub = cleanForFirestore(toPublicProductProjection(p)) as Record<string, unknown>;
            batch.set(doc(db!, 'products', p.id), cleanDoc, { merge: true });
            batch.set(doc(db!, 'catalog_public', p.id), cleanPub, { merge: true });
          }
        });
        await batch.commit();
        if (i + CHUNK_SIZE < productsToUpsert.length) {
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
      }
    } catch (e) {
      console.warn('Firestore bulkSaveProducts error (persisted locally):', e);
    }
  }

  return workingList;
}

export async function updateProductStatus(id: string, status: ProductStatus, tenantId = 'default'): Promise<boolean> {
  const products = getLocalProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index !== -1) {
    if (!tenantId || tenantId === 'default') {
      products[index].status = status;
    } else {
      const overrides = products[index].branchOverrides || {};
      products[index].branchOverrides = {
        ...overrides,
        [tenantId]: {
          ...overrides[tenantId],
          status,
        },
      };
    }
    products[index].updatedAt = new Date().toISOString();
    saveLocalProducts(products);

    if (isFirebaseConfigured() && db) {
      try {
        const cleanDoc = cleanForFirestore(products[index]) as Record<string, unknown>;
        const cleanPub = cleanForFirestore(toPublicProductProjection(products[index])) as Record<string, unknown>;
        const batch = writeBatch(db);
        batch.set(doc(db, 'products', id), cleanDoc, { merge: true });
        batch.set(doc(db, 'catalog_public', id), cleanPub, { merge: true });
        await batch.commit();
      } catch (e) {
        console.warn('Firestore updateProductStatus error:', e);
      }
    }
    return true;
  }
  return false;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const products = getLocalProducts();
  const filtered = products.filter((p) => p.id !== id);
  saveLocalProducts(filtered);

  if (isFirebaseConfigured() && db) {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'products', id));
      batch.delete(doc(db, 'catalog_public', id));
      await batch.commit();
    } catch (e) {
      console.warn('Firestore deleteProduct error:', e);
    }
  }
  return true;
}

export async function bulkDeleteProducts(ids: string[]): Promise<boolean> {
  const products = getLocalProducts();
  const idsSet = new Set(ids);
  const filtered = products.filter((p) => !idsSet.has(p.id));
  saveLocalProducts(filtered);

  if (isFirebaseConfigured() && db && ids.length > 0) {
    try {
      const CHUNK_SIZE = 200;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((docId) => {
          batch.delete(doc(db!, 'products', docId));
          batch.delete(doc(db!, 'catalog_public', docId));
        });
        await batch.commit();
      }
    } catch (e) {
      console.warn('Firestore bulkDeleteProducts error:', e);
    }
  }
  return true;
}

export async function bulkUpdateStatus(
  ids: string[],
  status: ProductStatus,
  tenantId = 'default'
): Promise<boolean> {
  const products = getLocalProducts();
  const idsSet = new Set(ids);
  const now = new Date().toISOString();
  const changedProducts: Product[] = [];

  products.forEach((p) => {
    if (idsSet.has(p.id)) {
      if (!tenantId || tenantId === 'default' || tenantId === 'main') {
        p.status = status;
      } else {
        const overrides = p.branchOverrides || {};
        p.branchOverrides = {
          ...overrides,
          [tenantId]: {
            ...overrides[tenantId],
            status,
          },
        };
      }
      p.updatedAt = now;
      changedProducts.push(p);
    }
  });

  saveLocalProducts(products);

  if (isFirebaseConfigured() && db && changedProducts.length > 0) {
    try {
      const CHUNK_SIZE = 200;
      for (let i = 0; i < changedProducts.length; i += CHUNK_SIZE) {
        const chunk = changedProducts.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((p) => {
          if (p.id) {
            batch.set(doc(db!, 'products', p.id), cleanForFirestore(p) as Record<string, unknown>, { merge: true });
            batch.set(doc(db!, 'catalog_public', p.id), cleanForFirestore(toPublicProductProjection(p)) as Record<string, unknown>, { merge: true });
          }
        });
        await batch.commit();
      }
    } catch (e) {
      console.warn('Firestore bulkUpdateStatus error:', e);
    }
  }
  return true;
}

export async function bulkAssignBranch(
  ids: string[],
  targetBranchSlug: string,
  action: 'enable' | 'disable'
): Promise<boolean> {
  const products = getLocalProducts();
  const idsSet = new Set(ids);
  const now = new Date().toISOString();
  const status: ProductStatus = action === 'enable' ? 'active' : 'disabled';
  const changedProducts: Product[] = [];

  products.forEach((p) => {
    if (idsSet.has(p.id)) {
      const overrides = p.branchOverrides || {};
      p.branchOverrides = {
        ...overrides,
        [targetBranchSlug]: {
          ...overrides[targetBranchSlug],
          prices: overrides[targetBranchSlug]?.prices || p.prices,
          stock: overrides[targetBranchSlug]?.stock ?? p.stock,
          status,
        },
      };
      p.updatedAt = now;
      changedProducts.push(p);
    }
  });

  saveLocalProducts(products);

  if (isFirebaseConfigured() && db && changedProducts.length > 0) {
    try {
      const CHUNK_SIZE = 200;
      for (let i = 0; i < changedProducts.length; i += CHUNK_SIZE) {
        const chunk = changedProducts.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((p) => {
          if (p.id) {
            batch.set(doc(db!, 'products', p.id), cleanForFirestore(p) as Record<string, unknown>, { merge: true });
            batch.set(doc(db!, 'catalog_public', p.id), cleanForFirestore(toPublicProductProjection(p)) as Record<string, unknown>, { merge: true });
          }
        });
        await batch.commit();
      }
    } catch (e) {
      console.warn('Firestore bulkAssignBranch error:', e);
    }
  }
  return true;
}

export async function resetAllProducts(): Promise<void> {
  saveLocalProducts([]);
  saveLocalPublicCatalog([]);
  baseSkuImageMap.clear();

  if (isFirebaseConfigured() && db) {
    const firestoreDb = db;
    try {
      for (const colName of ['products', 'catalog_public']) {
        const snap = await getDocs(collection(firestoreDb, colName));
        if (!snap.empty) {
          const docs = snap.docs;
          const CHUNK_SIZE = 400;
          for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
            const chunk = docs.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(firestoreDb);
            chunk.forEach((d) => {
              batch.delete(doc(firestoreDb, colName, d.id));
            });
            await batch.commit();
          }
        }
      }
    } catch (e) {
      console.warn('Firestore resetAllProducts error:', e);
    }
  }
}

export async function resetToSeedData(): Promise<void> {
  await resetAllProducts();
  saveLocalCompanyInfoMap({ default: INITIAL_COMPANY_INFO });
  saveLocalBranches(INITIAL_BRANCHES);

  if (isFirebaseConfigured() && db) {
    const firestore = db;
    try {
      const batch = writeBatch(firestore);
      INITIAL_BRANCHES.forEach((b) => {
        batch.set(doc(firestore, 'branches', b.slug), b);
      });
      batch.set(doc(firestore, 'company_info', 'default'), INITIAL_COMPANY_INFO);
      await batch.commit();
    } catch (e) {
      console.warn('Firestore resetToSeedData error:', e);
    }
  }
}

// ==========================================
// PERSISTENT CART HELPERS (Local-First + Sync)
// ==========================================

export function sanitizeCartForStorage(cart: CartItem[]): CartItem[] {
  if (!Array.isArray(cart)) return [];
  return cart.map((it) => ({
    ...it,
    product: {
      ...it.product,
      processedImageUrl:
        it.product.processedImageUrl && (it.product.processedImageUrl.startsWith('data:') || it.product.processedImageUrl.length > 2048)
          ? ''
          : it.product.processedImageUrl,
      originalImageUrl:
        it.product.originalImageUrl && (it.product.originalImageUrl.startsWith('data:') || it.product.originalImageUrl.length > 2048)
          ? ''
          : it.product.originalImageUrl,
    },
  }));
}

export function getLocalCart(tenantSlug: string = 'default'): CartItem[] {
  if (typeof window === 'undefined') return [];
  const key = `katalog_cart_${tenantSlug || 'default'}`;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Fallback if localStorage quota exceeded
  }
  return [];
}

export async function getLocalCartAsync(tenantSlug: string = 'default'): Promise<CartItem[]> {
  const local = getLocalCart(tenantSlug);
  if (local && local.length > 0) return local;
  if (typeof window === 'undefined') return [];
  const key = `katalog_cart_${tenantSlug || 'default'}`;
  try {
    const idbCart = await getIdb<CartItem[]>(key, []);
    if (idbCart && Array.isArray(idbCart) && idbCart.length > 0) {
      return idbCart;
    }
  } catch {}
  return [];
}

export function saveLocalCart(tenantSlug: string = 'default', cart: CartItem[]): void {
  if (typeof window === 'undefined') return;
  const key = `katalog_cart_${tenantSlug || 'default'}`;
  // Sanitizar el carrito eliminando las imágenes Base64 pesadas
  // Esto reduce el peso de 4.5MB a ~15KB, evitando QuotaExceededError en navegadores móviles/desktop
  const safeCart = sanitizeCartForStorage(cart);
  try {
    localStorage.setItem(key, JSON.stringify(safeCart));
    setIdb(key, safeCart);
  } catch (err) {
    console.warn('localStorage setItem exceeded quota, persisting to IndexedDB fallback:', err);
    setIdb(key, safeCart);
  }
}

export function clearLocalCart(tenantSlug: string = 'default'): void {
  if (typeof window === 'undefined') return;
  const key = `katalog_cart_${tenantSlug || 'default'}`;
  try {
    localStorage.removeItem(key);
    setIdb(key, []);
  } catch {}
}

// ==========================================
// CUSTOMER PROFILE API (100% KYG Gestión Compatible)
// ==========================================

export function getCachedCustomerProfile(): Customer | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return null;
}

export function setCachedCustomerProfile(customer: Customer | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (customer) {
      localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(customer));
    } else {
      localStorage.removeItem(CUSTOMER_STORAGE_KEY);
    }
  } catch {}
}

export async function fetchCustomerProfile(uidOrId: string): Promise<Customer | null> {
  if (!uidOrId) return null;

  const cached = getCachedCustomerProfile();

  // Consultar siempre Firestore primero cuando está configurado para detectar cambios
  // de aprobación, rol o listas de precios al instante (fallback a caché solo si falla la red).
  if (isFirebaseConfigured() && db) {
    try {
      const docSnap = await safeGetDoc(doc(db, 'clientes', uidOrId), 4500);
      if (docSnap.exists()) {
        const custData = { id: docSnap.id, ...docSnap.data() } as Customer;
        setCachedCustomerProfile(custData);
        return custData;
      }

      const q = query(collection(db, 'clientes'), where('uid', '==', uidOrId), limit(1));
      const querySnap = await safeGetDocs(q, 4500);
      if (!querySnap.empty) {
        const d = querySnap.docs[0];
        const custData = { id: d.id, ...d.data() } as Customer;
        setCachedCustomerProfile(custData);
        return custData;
      }
      return null;
    } catch (e) {
      console.warn('Firestore fetchCustomerProfile error, using local fallback:', e);
    }
  }

  if (cached && (cached.id === uidOrId || cached.uid === uidOrId)) {
    return cached;
  }
  return null;
}

export async function saveCustomerProfile(customerData: Partial<Customer>): Promise<Customer> {
  const now = new Date().toISOString();
  const cached = getCachedCustomerProfile();
  const customerId = customerData.id || customerData.uid || cached?.id || `CL-${Date.now().toString().slice(-6)}`;

  const updated: Customer = {
    ...cached,
    ...customerData,
    id: customerId,
    nombre: customerData.nombre || cached?.nombre || 'Cliente',
    creado_en: customerData.creado_en || cached?.creado_en || now,
    ultimo_acceso: now,
    rol: customerData.rol || cached?.rol || 'cliente',
    estado_acceso: customerData.estado_acceso || cached?.estado_acceso || 'pendiente',
  };

  setCachedCustomerProfile(updated);

  if (isFirebaseConfigured() && db) {
    try {
      const cleanDoc = cleanForFirestore(updated) as Record<string, unknown>;
      await setDoc(doc(db, 'clientes', customerId), cleanDoc, { merge: true });
    } catch (e) {
      console.warn('Firestore saveCustomerProfile error:', e);
    }
  }

  return updated;
}

/**
 * Registra un nuevo solicitante desde el catálogo público creando su perfil en estado 'pendiente'
 * y su solicitud en 'access_requests' cumpliendo las reglas anti-escalamiento de Firestore.
 */
export async function registerCustomerWithAccessRequest(payload: {
  uid: string;
  nombre: string;
  negocio?: string;
  telefonos: string;
  email: string;
  ciudad?: string;
  pais: string;
  sucursal: string;
  perfil_solicitado: 'cliente' | 'emprendedor';
  mensaje?: string;
}): Promise<{ customer: Customer; request: AccessRequest }> {
  const now = new Date().toISOString();
  const customerDoc: Customer = {
    id: payload.uid,
    uid: payload.uid,
    nombre: payload.nombre.trim(),
    negocio: payload.negocio?.trim() || undefined,
    telefonos: payload.telefonos.trim(),
    email: payload.email.trim().toLowerCase(),
    ciudad: payload.ciudad?.trim() || undefined,
    pais: payload.pais,
    sucursal: payload.sucursal,
    rol: 'cliente', // Firestore Rules exigen rol='cliente' en auto-creación; el deseado va en perfil_solicitado
    perfil_solicitado: payload.perfil_solicitado,
    estado_acceso: 'pendiente',
    allowedPriceLists: [],
    whiteLabelEnabled: false,
    subscriptionStatus: 'none',
    creado_en: now,
    ultimo_acceso: now,
  };

  const reqId = `REQ-${payload.uid}-${Date.now()}`;
  const requestDoc: AccessRequest = {
    id: reqId,
    uid: payload.uid,
    customerId: payload.uid,
    nombre: customerDoc.nombre,
    negocio: customerDoc.negocio,
    telefonos: payload.telefonos.trim(),
    email: customerDoc.email || '',
    ciudad: customerDoc.ciudad,
    pais: payload.pais,
    sucursal: payload.sucursal,
    tipo_solicitud: 'nuevo_registro',
    perfil_solicitado: payload.perfil_solicitado,
    mensaje: payload.mensaje?.trim() || undefined,
    estado: 'pendiente',
    creado_en: now,
  };

  setCachedCustomerProfile(customerDoc);

  if (isFirebaseConfigured() && db) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'clientes', payload.uid), cleanForFirestore(customerDoc) as Record<string, unknown>, { merge: true });
    batch.set(doc(db, 'access_requests', reqId), cleanForFirestore(requestDoc) as Record<string, unknown>);
    await batch.commit();
  }

  return { customer: customerDoc, request: requestDoc };
}

/**
 * Permite a un usuario ya aprobado solicitar ampliación de listas o cambio a perfil Emprendedor.
 */
export async function submitUpgradeAccessRequest(
  customer: Customer,
  payload: {
    tipo_solicitud: 'cambio_perfil' | 'ampliar_listas';
    perfil_solicitado: 'cliente' | 'emprendedor';
    listas_solicitadas?: string[];
    mensaje?: string;
  }
): Promise<AccessRequest> {
  const now = new Date().toISOString();
  const uid = customer.uid || customer.id;
  const reqId = `REQ-${uid}-${Date.now()}`;
  const reqDoc: AccessRequest = {
    id: reqId,
    uid,
    customerId: customer.id,
    nombre: customer.nombre,
    negocio: customer.negocio,
    telefonos: customer.telefonos || '',
    email: customer.email || '',
    ciudad: customer.ciudad,
    pais: customer.pais || 'Costa Rica',
    sucursal: customer.sucursal || 'costarica',
    tipo_solicitud: payload.tipo_solicitud,
    perfil_solicitado: payload.perfil_solicitado,
    listas_solicitadas: payload.listas_solicitadas,
    mensaje: payload.mensaje?.trim() || undefined,
    estado: 'pendiente',
    creado_en: now,
  };

  if (isFirebaseConfigured() && db) {
    await setDoc(doc(db, 'access_requests', reqId), cleanForFirestore(reqDoc) as Record<string, unknown>);
  }

  return reqDoc;
}

export async function fetchMyAccessRequests(uid: string): Promise<AccessRequest[]> {
  if (!uid || !isFirebaseConfigured() || !db) return [];
  try {
    const q = query(collection(db, 'access_requests'), where('uid', '==', uid), limit(20));
    const snap = await safeGetDocs(q, 4500);
    const list: AccessRequest[] = [];
    snap.forEach((d: any) => list.push({ id: d.id, ...d.data() } as AccessRequest));
    return list.sort((a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime());
  } catch (e) {
    console.warn('fetchMyAccessRequests error:', e);
    return [];
  }
}

export async function saveResellerConfig(
  customerId: string,
  resellerConfig: ResellerConfig
): Promise<void> {
  const cached = getCachedCustomerProfile();
  if (cached && (cached.id === customerId || cached.uid === customerId)) {
    setCachedCustomerProfile({ ...cached, resellerConfig });
  }
  if (isFirebaseConfigured() && db && customerId) {
    await setDoc(
      doc(db, 'clientes', customerId),
      { resellerConfig: cleanForFirestore(resellerConfig) },
      { merge: true }
    );
  }
}

export async function fetchBranchCustomersForSeller(branchSlug: string): Promise<Customer[]> {
  if (!branchSlug || !isFirebaseConfigured() || !db) return [];
  try {
    const q = query(
      collection(db, 'clientes'),
      where('sucursal', '==', branchSlug),
      where('rol', 'in', ['cliente', 'emprendedor']),
      limit(200)
    );
    const snap = await safeGetDocs(q, 5000);
    const list: Customer[] = [];
    snap.forEach((d: any) => list.push({ id: d.id, ...d.data() } as Customer));
    return list.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  } catch (e) {
    console.warn('fetchBranchCustomersForSeller error:', e);
    return [];
  }
}

export async function syncCustomerCart(customerId: string, cart: CartItem[]): Promise<void> {
  if (!customerId) return;
  const cached = getCachedCustomerProfile();
  if (cached) {
    cached.activeCart = cart;
    setCachedCustomerProfile(cached);
  }

  if (isFirebaseConfigured() && db) {
    try {
      const safeCart = cart.map((it) => ({
        ...it,
        product: {
          ...it.product,
          processedImageUrl:
            it.product.processedImageUrl && (it.product.processedImageUrl.startsWith('data:') || it.product.processedImageUrl.length > 2048)
              ? ''
              : it.product.processedImageUrl,
          originalImageUrl:
            it.product.originalImageUrl && (it.product.originalImageUrl.startsWith('data:') || it.product.originalImageUrl.length > 2048)
              ? ''
              : it.product.originalImageUrl,
        },
      }));
      await setDoc(doc(db, 'clientes', customerId), { activeCart: cleanForFirestore(safeCart) }, { merge: true });
    } catch (e) {
      console.warn('Firestore syncCustomerCart error:', e);
    }
  }
}

// ==========================================
// CUSTOMER ORDERS API (100% KYG Gestión Compatible)
// ==========================================

export function generateNextOrderId(options?: {
  orderPrefix?: string;
  sucursal?: string;
  pais?: string;
}): { orderId: string; sucCode: string } {
  let sucCode = (options?.orderPrefix || '').trim().toUpperCase();
  if (!sucCode) {
    const branches = getLocalBranches();
    const branch = branches.find(
      (b) =>
        b.slug === options?.sucursal ||
        b.id === options?.sucursal ||
        (options?.pais && b.country?.toLowerCase() === options?.pais?.toLowerCase())
    );
    if (branch && branch.orderPrefix) {
      sucCode = branch.orderPrefix.toUpperCase();
    } else {
      const map: Record<string, string> = {
        'costarica': 'CR',
        'costa-rica': 'CR',
        'costa rica': 'CR',
        'honduras': 'HN',
        'colombia': 'CO',
        'mexico': 'MX',
        'méxico': 'MX',
        'guatemala': 'GT',
        'panama': 'PA',
        'panamá': 'PA',
        'el-salvador': 'SV',
        'elsalvador': 'SV',
        'estadosunidos': 'US',
        'usa': 'US',
      };
      const key = (options?.sucursal || options?.pais || '').toLowerCase().trim();
      sucCode = map[key] || (options?.sucursal || 'CR').substring(0, 2).toUpperCase();
    }
  }

  let nextConsecutive = 1;
  try {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(ORDERS_STORAGE_KEY || 'katalog_local_orders') : null;
    if (stored) {
      const list: CustomerOrder[] = JSON.parse(stored);
      // Filtramos únicamente pedidos con sufijo de 6 cifras numéricas (ej: CR-000001)
      // para descartar los folios legacy de 4 dígitos (como CR-9849) e iniciar limpiamente en 1
      const matching = list.filter((o) => {
        if (!o.id || !o.id.startsWith(`${sucCode}-`)) return false;
        const parts = o.id.split('-');
        return parts.length >= 2 && parts[1].length === 6 && /^\d{6}$/.test(parts[1]);
      });
      if (matching.length > 0) {
        const numbers = matching.map((o) => {
          const parts = o.id.split('-');
          const num = parseInt(parts[1], 10);
          return isNaN(num) ? 0 : num;
        });
        const maxNum = Math.max(...numbers, 0);
        nextConsecutive = maxNum + 1;
      }
    }
  } catch {}

  const formattedSuffix = String(nextConsecutive).padStart(6, '0');
  return { orderId: `${sucCode}-${formattedSuffix}`, sucCode };
}

/**
 * Reserva el siguiente consecutivo de pedido atómicamente en Firestore si hay conexión,
 * o recurre a la base de pedidos local si está fuera de línea.
 */
export async function allocateNextConsecutiveOrderId(options?: {
  orderPrefix?: string;
  sucursal?: string;
  pais?: string;
}): Promise<{ orderId: string; sucCode: string }> {
  const localGen = generateNextOrderId(options);
  const sucCode = localGen.sucCode;

  if (isFirebaseConfigured() && db) {
    try {
      const counterDocRef = doc(db, 'metadatos', 'order_counters');
      const nextNum = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(counterDocRef);
        let current = 0;
        if (snap.exists()) {
          const data = snap.data();
          current = typeof data?.[sucCode] === 'number' ? data[sucCode] : 0;
        }

        const allocated = current + 1;

        transaction.set(counterDocRef, { [sucCode]: allocated, updatedAt: new Date().toISOString() }, { merge: true });
        return allocated;
      });

      const formattedSuffix = String(nextNum).padStart(6, '0');
      return { orderId: `${sucCode}-${formattedSuffix}`, sucCode };
    } catch (e) {
      console.warn('Error reservando consecutivo atómico en Firestore, usando fallback local:', e);
    }
  }

  return localGen;
}

/**
 * Reinicia el consecutivo de una sucursal en Firestore para que el próximo sea 000001 (o startFrom + 1)
 */
export async function resetOrderConsecutive(sucCode: string, startFrom: number = 0): Promise<void> {
  const code = sucCode.trim().toUpperCase();
  if (isFirebaseConfigured() && db) {
    try {
      const counterDocRef = doc(db, 'metadatos', 'order_counters');
      await setDoc(counterDocRef, { [code]: startFrom, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.warn('Error reiniciando contador en Firestore:', e);
    }
  }
}

export const ORDERS_STORAGE_KEY = 'katalog_local_orders';
export const PENDING_ORDERS_SYNC_KEY = 'katalog_pending_orders_sync';

export function getLocalOrders(): CustomerOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(ORDERS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveLocalOrders(orders: CustomerOrder[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders.slice(0, 100)));
  } catch {}
}

export function getPendingOrdersSyncQueue(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(PENDING_ORDERS_SYNC_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addOrderToPendingSync(orderId: string): void {
  if (typeof window === 'undefined' || !orderId) return;
  try {
    const queue = getPendingOrdersSyncQueue();
    if (!queue.includes(orderId)) {
      queue.push(orderId);
      localStorage.setItem(PENDING_ORDERS_SYNC_KEY, JSON.stringify(queue));
    }
  } catch {}
}

export function removeOrderFromPendingSync(orderId: string): void {
  if (typeof window === 'undefined' || !orderId) return;
  try {
    const queue = getPendingOrdersSyncQueue().filter((id) => id !== orderId);
    localStorage.setItem(PENDING_ORDERS_SYNC_KEY, JSON.stringify(queue));
  } catch {}
}

/**
 * Recorre la cola de sincronización pendiente y los pedidos locales no sincronizados
 * y los sube a Firestore en la nube de forma garantizada y resiliente.
 */
export async function syncPendingOrdersToFirestore(): Promise<{ syncedCount: number; errors: number }> {
  if (!isFirebaseConfigured() || !db || typeof window === 'undefined') {
    return { syncedCount: 0, errors: 0 };
  }

  const pendingIds = new Set(getPendingOrdersSyncQueue());
  const localOrders = getLocalOrders();

  // Encontrar todas las órdenes marcadas como pendientes de sync o con syncedToCloud === false
  const toSync = localOrders.filter(
    (o) => pendingIds.has(o.id) || o.syncedToCloud === false
  );

  if (toSync.length === 0) {
    return { syncedCount: 0, errors: 0 };
  }

  let syncedCount = 0;
  let errors = 0;

  for (const order of toSync) {
    try {
      // Sanitizar referencias para eliminar payloads pesados en base64 de pedidos antiguos o en cola
      const sanitizedItems = (order.items || []).map((it) => {
        const rawImg = it.imagen_url || '';
        const safeImg = (rawImg.startsWith('data:') || rawImg.length > 2048) ? '' : rawImg;
        return {
          ...it,
          imagen_url: safeImg,
        };
      });
      order.items = sanitizedItems;

      const cleanDoc = cleanForFirestore({
        ...order,
        items: sanitizedItems,
        syncedToCloud: true,
      }) as Record<string, unknown>;

      await setDoc(doc(db, 'pedidos', order.id), cleanDoc, { merge: true });
      const flushed = await flushPendingFirestoreWrites(4500);

      if (flushed) {
        removeOrderFromPendingSync(order.id);
        order.syncedToCloud = true;
        syncedCount++;
      } else {
        errors++;
      }
    } catch (err) {
      console.warn(`Error al sincronizar pedido pendiente [${order.id}]:`, err);
      errors++;
    }
  }

  if (syncedCount > 0) {
    saveLocalOrders(localOrders);
    window.dispatchEvent(
      new CustomEvent('katalog:orders-synced', {
        detail: { syncedCount },
      })
    );
  }

  return { syncedCount, errors };
}

export async function saveCustomerOrder(orderData: Partial<CustomerOrder>): Promise<CustomerOrder> {
  const now = new Date().toISOString();

  let targetOrderId = orderData.id;
  let isExistingUpdate = false;
  let previousCreatedAt = orderData.creado_en;

  // Si se envió un ID previo (ej. de la sesión de carrito actual), verificar si ya existe en Firestore o LocalStorage
  if (targetOrderId) {
    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDoc(doc(db, 'pedidos', targetOrderId));
        if (snap.exists()) {
          const prev = snap.data() as Partial<CustomerOrder>;
          // Si el pedido anterior ya no está en estado pendiente (ej. bodega, empaque, proceso, facturado),
          // no sobreescribirlo para no alterar la orden en producción. Forzar nuevo folio.
          if (prev.estado && prev.estado !== 'pendiente') {
            targetOrderId = undefined;
          } else {
            isExistingUpdate = true;
            if (prev.creado_en) previousCreatedAt = prev.creado_en;
          }
        }
      } catch (err) {
        console.warn('Error verificando pedido existente en Firestore:', err);
      }
    } else if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(ORDERS_STORAGE_KEY);
        if (stored) {
          const list: CustomerOrder[] = JSON.parse(stored);
          const found = list.find((o) => o.id === targetOrderId);
          if (found) {
            if (found.estado && found.estado !== 'pendiente') {
              targetOrderId = undefined;
            } else {
              isExistingUpdate = true;
              if (found.creado_en) previousCreatedAt = found.creado_en;
            }
          }
        }
      } catch {}
    }
  }

  const generated = await allocateNextConsecutiveOrderId({
    orderPrefix: orderData.orderPrefix,
    sucursal: orderData.sucursal,
    pais: orderData.pais,
  });

  const sucCode = orderData.orderPrefix?.trim().toUpperCase() || generated.sucCode;
  const orderId = targetOrderId || generated.orderId;

  // Sanitizar items para eliminar imágenes base64 que excederían el límite de 1MB de Firestore
  const sanitizedItems = (orderData.items || []).map((it) => {
    const rawImg = it.imagen_url || '';
    const safeImg = (rawImg.startsWith('data:') || rawImg.length > 2048) ? '' : rawImg;
    return {
      ...it,
      imagen_url: safeImg,
    };
  });

  const fullOrder: CustomerOrder = {
    id: orderId,
    orderPrefix: sucCode,
    cliente_id: orderData.cliente_id || 'CLIENTE-INVITADO',
    cliente_nombre: orderData.cliente_nombre || 'Cliente',
    cliente_tienda: orderData.cliente_tienda || orderData.negocio || '',
    negocio: orderData.negocio || orderData.cliente_tienda || '',
    cliente_direccion: orderData.cliente_direccion || '',
    cliente_telefono: orderData.cliente_telefono || '',
    cliente_email: orderData.cliente_email || '',
    pais: orderData.pais || 'COSTA RICA',
    sucursal: orderData.sucursal || 'costarica',

    caja_id: orderData.caja_id || 'ONLINE-KATALOG',
    punto_venta: orderData.punto_venta || 'KATALOG-WEB',
    condicion: orderData.condicion || 'Contado',
    moneda: orderData.moneda || 'USD',
    tasa_cambio: orderData.tasa_cambio || 1.0,
    items: sanitizedItems,
    subtotal_gravado: orderData.subtotal_gravado || 0,
    subtotal_exento: orderData.subtotal_exento || 0,
    descuento_total: orderData.descuento_total || 0,
    isv_total: orderData.isv_total || 0,
    total_factura: orderData.total_factura || 0,
    monto_abonado: orderData.monto_abonado || 0,
    saldo: orderData.saldo ?? orderData.total_factura ?? 0,
    estado_pago: orderData.estado_pago || 'pendiente',
    fecha_promesa_pago: orderData.fecha_promesa_pago || '',
    metodo_pago: orderData.metodo_pago || '',
    stock_descontado: orderData.stock_descontado || false,
    historial_abonos: orderData.historial_abonos || [],
    incluye_iva: orderData.incluye_iva ?? true,
    iva_tasa: orderData.iva_tasa || 15.0,
    nota: orderData.nota || '',
    estado: orderData.estado || 'pendiente', // Recibido como PENDIENTE
    tipo_solicitud: orderData.tipo_solicitud || 'PEDIDO',
    tarifa_aplicada: orderData.tarifa_aplicada || 'wholesale',
    tarifa_nombre: orderData.tarifa_nombre,
    origen: 'katalog_web',
    facturado: orderData.facturado ?? false,
    numero_factura: orderData.numero_factura || '',
    fecha_factura: orderData.fecha_factura || '',
    creado_en: previousCreatedAt || now,
    actualizado_en: isExistingUpdate ? now : undefined,
    modificado: isExistingUpdate ? true : (orderData.modificado || false),
    atendido_por: orderData.atendido_por || 'KataloG Online',
    vendedor: orderData.vendedor || 'KataloG Online',
    vendedor_id: orderData.vendedor_id,
    syncedToCloud: false,
  };


  // 1. Guardar primero en LocalStorage de forma preventiva
  const currentLocalList = getLocalOrders();
  const existingIdx = currentLocalList.findIndex((o) => o.id === orderId);
  if (existingIdx >= 0) {
    currentLocalList[existingIdx] = fullOrder;
  } else {
    currentLocalList.unshift(fullOrder);
  }
  saveLocalOrders(currentLocalList);

  // 2. Transmitir a Firestore 'pedidos' y confirmar la persistencia en la nube
  if (isFirebaseConfigured() && db) {
    try {
      const cleanDoc = cleanForFirestore({
        ...fullOrder,
        syncedToCloud: true,
      }) as Record<string, unknown>;

      await setDoc(doc(db, 'pedidos', orderId), cleanDoc, { merge: true });
      const flushed = await flushPendingFirestoreWrites(4500);

      if (flushed) {
        fullOrder.syncedToCloud = true;
        removeOrderFromPendingSync(orderId);

        // Actualizar el estado en caché local a confirmado
        const updatedList = getLocalOrders();
        const idx = updatedList.findIndex((o) => o.id === orderId);
        if (idx >= 0) {
          updatedList[idx].syncedToCloud = true;
          saveLocalOrders(updatedList);
        }
      } else {
        console.warn(`[${orderId}] Escritura local guardada, pero confirmación de red excedió tiempo. Encolando para sincronización garantizada.`);
        addOrderToPendingSync(orderId);
      }
    } catch (e) {
      console.warn('Firestore saveCustomerOrder error (persisted locally, enqueued):', e);
      addOrderToPendingSync(orderId);
    }
  } else {
    addOrderToPendingSync(orderId);
  }

  return fullOrder;
}

/**
 * Determina si un pedido pertenece estrictamente a un cliente específico según ID, teléfono o correo.
 */
export function orderBelongsToCustomer(
  order: CustomerOrder,
  customerOrIdentifier?: Customer | string | null
): boolean {
  if (!customerOrIdentifier) return true;

  if (typeof customerOrIdentifier === 'string') {
    const term = customerOrIdentifier.trim().toLowerCase();
    if (!term) return true;

    if (order.cliente_id && order.cliente_id.toLowerCase() === term) return true;
    if (order.cliente_email && order.cliente_email.toLowerCase() === term) return true;

    const termPhone = term.replace(/[^\d]/g, '');
    const orderPhone = (order.cliente_telefono || '').replace(/[^\d]/g, '');
    if (
      termPhone.length >= 7 &&
      orderPhone.length >= 7 &&
      (termPhone === orderPhone || termPhone.endsWith(orderPhone) || orderPhone.endsWith(termPhone))
    ) {
      return true;
    }

    return false;
  }

  // Si es un objeto Customer
  const cust = customerOrIdentifier;

  // 1. Coincidencia estricta por ID o UID (o vendedor asignado)
  if (cust.id && order.cliente_id && (order.cliente_id === cust.id || order.cliente_id === cust.uid)) {
    return true;
  }
  if (cust.uid && order.cliente_id && (order.cliente_id === cust.uid || order.cliente_id === cust.id)) {
    return true;
  }
  if (cust.rol === 'vendedor' && order.vendedor_id && (order.vendedor_id === cust.uid || order.vendedor_id === cust.id)) {
    return true;
  }

  // 2. Coincidencia por Correo Electrónico
  if (
    cust.email &&
    order.cliente_email &&
    cust.email.trim().toLowerCase() === order.cliente_email.trim().toLowerCase()
  ) {
    return true;
  }

  // 3. Coincidencia por Teléfono (normalizado solo dígitos)
  if (cust.telefonos && order.cliente_telefono) {
    const custPhone = cust.telefonos.replace(/[^\d]/g, '');
    const orderPhone = order.cliente_telefono.replace(/[^\d]/g, '');
    if (
      custPhone.length >= 7 &&
      orderPhone.length >= 7 &&
      (custPhone === orderPhone || custPhone.endsWith(orderPhone) || orderPhone.endsWith(custPhone))
    ) {
      return true;
    }
  }

  // No coincide con ninguno de los identificadores del cliente
  return false;
}

export async function fetchCustomerOrders(
  customerOrIdentifier?: Customer | string
): Promise<CustomerOrder[]> {
  const localOrders: CustomerOrder[] = [];
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('katalog_local_orders');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) localOrders.push(...parsed);
      }
    } catch {}
  }

  if (isFirebaseConfigured() && db) {
    const firestoreDb = db;
    try {
      const ordersMap = new Map<string, CustomerOrder>();
      const deletedOrderIds = new Set<string>();

      const uidTerm =
        typeof customerOrIdentifier === 'object' && customerOrIdentifier !== null
          ? (customerOrIdentifier.uid || customerOrIdentifier.id || '').trim()
          : typeof customerOrIdentifier === 'string'
          ? customerOrIdentifier.trim()
          : '';

      const isSellerUser =
        typeof customerOrIdentifier === 'object' &&
        customerOrIdentifier !== null &&
        customerOrIdentifier.rol === 'vendedor';

      const promises: Promise<void>[] = [];

      // 1. Verificar únicamente los pedidos locales que ya pertenecen al usuario autenticado
      localOrders
        .filter((localOrd) => orderBelongsToCustomer(localOrd, customerOrIdentifier))
        .forEach((localOrd) => {
          if (localOrd.id) {
            promises.push(
              getDoc(doc(firestoreDb, 'pedidos', localOrd.id))
                .then((docSnap) => {
                  if (docSnap.exists()) {
                    const serverOrd = { id: docSnap.id, ...docSnap.data() } as CustomerOrder;
                    if (orderBelongsToCustomer(serverOrd, customerOrIdentifier)) {
                      ordersMap.set(docSnap.id, serverOrd);
                    }
                  } else {
                    deletedOrderIds.add(localOrd.id);
                  }
                })
                .catch(() => {})
            );
          }
        });

      // 2. Consultar pedidos en Firestore alineados con firestore.rules (cliente_id y vendedor_id)
      if (uidTerm) {
        promises.push(
          getDocs(query(collection(firestoreDb, 'pedidos'), where('cliente_id', '==', uidTerm), limit(50)))
            .then((snap) => {
              snap.forEach((d) => {
                const ord = { id: d.id, ...d.data() } as CustomerOrder;
                ordersMap.set(d.id, ord);
              });
            })
            .catch(() => {})
        );

        if (isSellerUser) {
          promises.push(
            getDocs(query(collection(firestoreDb, 'pedidos'), where('vendedor_id', '==', uidTerm), limit(100)))
              .then((snap) => {
                snap.forEach((d) => {
                  const ord = { id: d.id, ...d.data() } as CustomerOrder;
                  ordersMap.set(d.id, ord);
                });
              })
              .catch(() => {})
          );
        }
      }

      await Promise.all(promises);

      // 3. Limpieza automática del caché local (localStorage):
      //    - Remover permanentemente pedidos borrados de Firestore
      //    - Actualizar con las versiones oficiales de Firestore
      if (typeof window !== 'undefined') {
        try {
          const freshStored = localStorage.getItem('katalog_local_orders');
          const currentList: CustomerOrder[] = freshStored ? JSON.parse(freshStored) : [];
          const cleanedList = currentList
            .filter((o) => !deletedOrderIds.has(o.id))
            .map((o) => ordersMap.get(o.id) || o);

          // Agregar pedidos nuevos del cliente traídos de Firestore
          ordersMap.forEach((ord, id) => {
            if (!cleanedList.some((o) => o.id === id)) {
              cleanedList.push(ord);
            }
          });

          cleanedList.sort((a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime());
          localStorage.setItem('katalog_local_orders', JSON.stringify(cleanedList.slice(0, 50)));
        } catch {}
      }

      // 4. Filtrar y ordenar los pedidos para este cliente
      const finalOrders = Array.from(ordersMap.values()).filter((o) =>
        orderBelongsToCustomer(o, customerOrIdentifier)
      );
      finalOrders.sort((a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime());

      return finalOrders;
    } catch (e) {
      console.warn('Firestore fetchCustomerOrders error, using local orders:', e);
    }
  }

  // Fallback offline: devolver únicamente pedidos locales pertenecientes a este cliente
  return localOrders
    .filter((o) => orderBelongsToCustomer(o, customerOrIdentifier))
    .sort((a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime());
}


// ==========================================
// PRICE LISTS API (Modelo Híbrido Dinámico)
// ==========================================

function getLocalPriceListsMap(): Record<string, PriceList[]> {
  if (memoryPriceLists !== null) return memoryPriceLists;
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(PRICE_LISTS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        memoryPriceLists = parsed;
        return parsed;
      }
    }
  } catch {}
  return {};
}

function saveLocalPriceListsMap(branchSlug: string, lists: PriceList[]) {
  const map = getLocalPriceListsMap();
  map[branchSlug] = lists;
  memoryPriceLists = map;
  if (typeof window !== 'undefined') {
    safeSetLocalStorage(PRICE_LISTS_STORAGE_KEY, JSON.stringify(map));
    setIdb(PRICE_LISTS_STORAGE_KEY, map);
  }
}

export async function fetchPriceLists(branchSlug: string = 'costarica'): Promise<PriceList[]> {
  const cleanBranch = branchSlug || 'costarica';
  const defaults = getDefaultPriceListsForBranch(cleanBranch);

  if (isFirebaseConfigured() && db) {
    try {
      const q = query(
        collection(db, 'price_lists'),
        where('branchSlug', 'in', [cleanBranch, 'global'])
      );
      const snap = await safeGetDocs(q, 5000);
      const mapById = new Map<string, PriceList>();
      defaults.forEach((d) => mapById.set(d.id, d));

      snap.forEach((docSnap: any) => {
        const data = docSnap.data() as PriceList;
        const resolvedId = data.id || docSnap.id;
        // Normalizar id lógico cuando el doc se guarda como `${branchSlug}_${id}`
        const logicalId = resolvedId.startsWith(`${cleanBranch}_`)
          ? resolvedId.slice(cleanBranch.length + 1)
          : resolvedId;
        mapById.set(logicalId, { ...data, id: logicalId });
      });

      const merged = Array.from(mapById.values()).sort(
        (a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)
      );
      saveLocalPriceListsMap(cleanBranch, merged);
      return merged;
    } catch (e) {
      console.warn('Firestore fetchPriceLists error, using fallback:', e);
    }
  }

  const localMap = getLocalPriceListsMap();
  return localMap[cleanBranch] && localMap[cleanBranch].length > 0
    ? localMap[cleanBranch]
    : defaults;
}

export async function savePriceList(priceList: PriceList): Promise<PriceList> {
  const now = new Date().toISOString();
  const branch = priceList.branchSlug || 'costarica';
  const docId = `${branch}_${priceList.id}`;
  const updated: PriceList = {
    ...priceList,
    branchSlug: branch,
    updatedAt: now,
    createdAt: priceList.createdAt || now,
  };

  const current = await fetchPriceLists(branch);
  const idx = current.findIndex((l) => l.id === updated.id);
  const nextList = idx >= 0
    ? current.map((l, i) => (i === idx ? updated : l))
    : [...current, updated];
  saveLocalPriceListsMap(branch, nextList);

  if (isFirebaseConfigured() && db) {
    await setDoc(doc(db, 'price_lists', docId), cleanForFirestore(updated) as Record<string, unknown>, { merge: true });
  }

  return updated;
}

export async function deletePriceList(listId: string, branchSlug: string = 'costarica'): Promise<boolean> {
  if (listId === 'unit' || listId === 'dozen' || listId === 'wholesale') {
    throw new Error('Las listas base (Unidad, Docena, Mayorista) no pueden eliminarse, solo editarse o desactivarse.');
  }
  const cleanBranch = branchSlug || 'costarica';
  const docId = `${cleanBranch}_${listId}`;

  const localMap = getLocalPriceListsMap();
  if (localMap[cleanBranch]) {
    saveLocalPriceListsMap(
      cleanBranch,
      localMap[cleanBranch].filter((l) => l.id !== listId)
    );
  }

  if (isFirebaseConfigured() && db) {
    await deleteDoc(doc(db, 'price_lists', docId));
  }
  return true;
}

// ==========================================
// ADMIN CRM, ACCESS REQUESTS & ORDERS API
// ==========================================

export async function fetchAllCustomersAdmin(options?: {
  isSuperAdmin?: boolean;
  allowedBranches?: string[];
}): Promise<Customer[]> {
  if (isFirebaseConfigured() && db) {
    try {
      const isSuper = options?.isSuperAdmin !== false;
      const branches = (options?.allowedBranches || []).filter((b) => b && b !== '*');

      const q =
        !isSuper && branches.length > 0
          ? query(collection(db, 'clientes'), where('sucursal', 'in', branches.slice(0, 10)))
          : collection(db, 'clientes');

      const snap = await getDocs(q);
      const list: Customer[] = [];
      snap.forEach((d) => {
        list.push({
          id: d.id,
          ...d.data(),
        } as Customer);
      });

      const superAdminEmail = 'crestrepol.kyg@gmail.com';
      const hasSuperAdmin = list.some((c) => (c.email || '').toLowerCase().trim() === superAdminEmail);
      if (isSuper && !hasSuperAdmin) {
        list.unshift({
          id: 'superadmin-crestrepol',
          nombre: 'Cristian Restrepo',
          email: superAdminEmail,
          telefonos: '',
          pais: 'COSTA RICA',
          sucursal: 'costarica',
          rol: 'superadmin',
          estado_acceso: 'aprobado',
          lista_precio: 'mayoreo',
          allowedPriceLists: ['unit', 'dozen', 'wholesale'],
          creado_en: '2026-08-16T00:00:00.000Z',
          ultimo_acceso: new Date().toISOString(),
        } as Customer);
      }

      list.sort((a, b) => {
        const timeA = a.ultimo_acceso || a.creado_en || '';
        const timeB = b.ultimo_acceso || b.creado_en || '';
        return timeB.localeCompare(timeA);
      });

      return list;
    } catch (e) {
      console.warn('Firestore fetchAllCustomersAdmin error, falling back to local cache:', e);
    }
  }

  const customersMap = new Map<string, Customer>();
  const cached = getCachedCustomerProfile();
  if (cached && cached.id) {
    customersMap.set(cached.id, cached);
  }
  return Array.from(customersMap.values());
}

export async function fetchAccessRequestsAdmin(options?: {
  isSuperAdmin?: boolean;
  allowedBranches?: string[];
}): Promise<AccessRequest[]> {
  if (!isFirebaseConfigured() || !db) return [];
  try {
    const isSuper = options?.isSuperAdmin !== false;
    const branches = (options?.allowedBranches || []).filter((b) => b && b !== '*');
    const q =
      !isSuper && branches.length > 0
        ? query(collection(db, 'access_requests'), where('sucursal', 'in', branches.slice(0, 10)), limit(200))
        : query(collection(db, 'access_requests'), limit(200));

    const snap = await getDocs(q);
    const list: AccessRequest[] = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AccessRequest));
    return list.sort((a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime());
  } catch (e) {
    console.warn('Firestore fetchAccessRequestsAdmin error:', e);
    return [];
  }
}

export async function approveAccessRequest(
  requestId: string,
  payload: {
    customerId: string;
    rol: Customer['rol'];
    allowedPriceLists: string[];
    defaultPriceList?: string;
    whiteLabelEnabled?: boolean;
    subscriptionStatus?: Customer['subscriptionStatus'];
    adminName: string;
    note?: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const primaryList = payload.defaultPriceList || payload.allowedPriceLists[0] || 'unit';
  const customerUpdate: Partial<Customer> = {
    rol: payload.rol || 'cliente',
    estado_acceso: 'aprobado',
    allowedPriceLists: payload.allowedPriceLists,
    defaultPriceList: primaryList,
    lista_precio: mapListIdToLegacyTier(primaryList),
    whiteLabelEnabled: payload.rol === 'emprendedor' ? Boolean(payload.whiteLabelEnabled) : false,
    subscriptionStatus: payload.rol === 'emprendedor'
      ? (payload.subscriptionStatus || (payload.whiteLabelEnabled ? 'active' : 'none'))
      : 'none',
    ultimo_acceso: now,
  };

  if (isFirebaseConfigured() && db) {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'clientes', payload.customerId),
      cleanForFirestore(customerUpdate) as Record<string, unknown>,
      { merge: true }
    );
    if (requestId) {
      batch.set(
        doc(db, 'access_requests', requestId),
        cleanForFirestore({
          estado: 'aprobado',
          revisado_por: payload.adminName,
          revisado_en: now,
          nota_admin: payload.note || '',
        }) as Record<string, unknown>,
        { merge: true }
      );
    }
    await batch.commit();
  }
}

export async function rejectAccessRequest(
  requestId: string,
  customerId: string,
  isNewRegistration: boolean,
  adminName: string,
  note?: string
): Promise<void> {
  const now = new Date().toISOString();
  if (isFirebaseConfigured() && db) {
    const batch = writeBatch(db);
    if (requestId) {
      batch.set(
        doc(db, 'access_requests', requestId),
        cleanForFirestore({
          estado: 'rechazado',
          revisado_por: adminName,
          revisado_en: now,
          nota_admin: note || '',
        }) as Record<string, unknown>,
        { merge: true }
      );
    }
    if (isNewRegistration && customerId) {
      batch.set(
        doc(db, 'clientes', customerId),
        { estado_acceso: 'rechazado', ultimo_acceso: now },
        { merge: true }
      );
    }
    await batch.commit();
  }
}

export async function updateCustomerAdmin(customerId: string, customerData: Partial<Customer>): Promise<Customer> {
  const now = new Date().toISOString();
  const updated: Customer = {
    ...customerData,
    id: customerId,
    nombre: customerData.nombre || 'Cliente',
    ultimo_acceso: now,
  };

  const cached = getCachedCustomerProfile();
  if (cached && (cached.id === customerId || cached.uid === customerId)) {
    setCachedCustomerProfile({ ...cached, ...updated });
  }

  if (isFirebaseConfigured() && db) {
    try {
      const cleanDoc = cleanForFirestore(updated) as Record<string, unknown>;
      await setDoc(doc(db, 'clientes', customerId), cleanDoc, { merge: true });
      if (customerData.uid && customerData.uid !== customerId) {
        await setDoc(doc(db, 'clientes', customerData.uid), cleanDoc, { merge: true });
      }
    } catch (e) {
      console.error('Firestore updateCustomerAdmin error:', e);
      throw e;
    }
  }

  return updated;
}

export async function deleteCustomerAdmin(customerId: string, uid?: string): Promise<void> {
  if (isFirebaseConfigured() && db) {
    try {
      await deleteDoc(doc(db, 'clientes', customerId));
      if (uid && uid !== customerId) {
        try {
          await deleteDoc(doc(db, 'clientes', uid));
        } catch {}
      }
    } catch (e) {
      console.error('Firestore deleteCustomerAdmin error:', e);
      throw e;
    }
  }

  const cached = getCachedCustomerProfile();
  if (cached && (cached.id === customerId || cached.uid === customerId || (uid && (cached.id === uid || cached.uid === uid)))) {
    setCachedCustomerProfile(null);
  }
}

export async function fetchAllOrdersAdmin(
  customerId?: string,
  options?: { isSuperAdmin?: boolean; allowedBranches?: string[] }
): Promise<CustomerOrder[]> {
  if (typeof window !== 'undefined') {
    syncPendingOrdersToFirestore().catch(() => {});
  }

  if (isFirebaseConfigured() && db) {
    try {
      const isSuper = options?.isSuperAdmin !== false;
      const branches = (options?.allowedBranches || []).filter((b) => b && b !== '*');

      let q;
      if (customerId) {
        q = query(collection(db, 'pedidos'), where('cliente_id', '==', customerId), limit(100));
      } else if (!isSuper && branches.length > 0) {
        q = query(collection(db, 'pedidos'), where('sucursal', 'in', branches.slice(0, 10)), limit(200));
      } else {
        q = query(collection(db, 'pedidos'), limit(200));
      }
      const snap = await getDocs(q);
      const list: CustomerOrder[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data(), syncedToCloud: true } as CustomerOrder);
      });
      list.sort((a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime());

      // Sincronizar el caché local preservando cualquier orden local no sincronizada
      if (typeof window !== 'undefined') {
        try {
          if (!customerId) {
            const pendingQueue = new Set(getPendingOrdersSyncQueue());
            const localOrders = getLocalOrders();
            const unsynced = localOrders.filter(
              (o) => pendingQueue.has(o.id) || o.syncedToCloud === false
            );

            // Mergear lista de Firestore con las órdenes locales que aún no suben
            const combinedMap = new Map<string, CustomerOrder>();
            list.forEach((o) => combinedMap.set(o.id, o));
            unsynced.forEach((o) => {
              if (!combinedMap.has(o.id)) combinedMap.set(o.id, o);
            });

            const mergedList = Array.from(combinedMap.values());
            mergedList.sort((a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime());
            saveLocalOrders(mergedList);
            return mergedList;
          }
        } catch {}
      }

      return list;
    } catch (e) {
      console.warn('Firestore fetchAllOrdersAdmin error, falling back to local storage:', e);
    }
  }

  // Offline fallback only
  const localList = getLocalOrders();
  const filtered = customerId
    ? localList.filter((o) => o.cliente_id === customerId)
    : localList;
  filtered.sort((a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime());
  return filtered;
}


export async function updateCustomerOrderAdmin(orderId: string, orderData: Partial<CustomerOrder>): Promise<CustomerOrder> {
  const sanitizedItems = orderData.items
    ? orderData.items.map((it) => {
        const rawImg = it.imagen_url || '';
        const safeImg = (rawImg.startsWith('data:') || rawImg.length > 2048) ? '' : rawImg;
        return { ...it, imagen_url: safeImg };
      })
    : undefined;

  const fullOrder = {
    ...orderData,
    ...(sanitizedItems ? { items: sanitizedItems } : {}),
    id: orderId,
  } as CustomerOrder;

  // 1. Update local storage
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('katalog_local_orders');
      if (stored) {
        const list: CustomerOrder[] = JSON.parse(stored);
        const idx = list.findIndex((o) => o.id === orderId);
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...orderData, ...(sanitizedItems ? { items: sanitizedItems } : {}) };
        } else {
          list.unshift(fullOrder);
        }
        localStorage.setItem('katalog_local_orders', JSON.stringify(list));
      }
    } catch {}
  }

  // 2. Update Firestore
  if (isFirebaseConfigured() && db) {
    try {
      const cleanDoc = cleanForFirestore(fullOrder) as Record<string, unknown>;
      await setDoc(doc(db, 'pedidos', orderId), cleanDoc, { merge: true });
    } catch (e) {
      console.error('Firestore updateCustomerOrderAdmin error:', e);
      throw e;
    }
  }

  return fullOrder;
}

export async function deleteCustomerOrderAdmin(orderId: string): Promise<void> {
  // 1. Remove from local storage
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('katalog_local_orders');
      if (stored) {
        const list: CustomerOrder[] = JSON.parse(stored);
        const filtered = list.filter((o) => o.id !== orderId);
        localStorage.setItem('katalog_local_orders', JSON.stringify(filtered));
      }
    } catch {}
  }

  // 2. Delete from Firestore
  if (isFirebaseConfigured() && db) {
    try {
      await deleteDoc(doc(db, 'pedidos', orderId));
    } catch (e) {
      console.error('Firestore deleteCustomerOrderAdmin error:', e);
      throw e;
    }
  }
}

export async function deductOrderStock(
  order: CustomerOrder,
  branchSlug: string,
  currentProducts: Product[]
): Promise<{ updatedProducts: Product[]; updatedOrder: CustomerOrder }> {
  const productsMap = new Map<string, Product>();
  currentProducts.forEach((p) => productsMap.set(p.sku.toLowerCase(), { ...p }));

  for (const item of order.items || []) {
    const p = productsMap.get(item.referencia.toLowerCase());
    if (p) {
      if (p.branchOverrides && p.branchOverrides[branchSlug]) {
        const currentStock = p.branchOverrides[branchSlug].stock ?? p.stock;
        p.branchOverrides[branchSlug].stock = Math.max(0, currentStock - item.cantidad);
      } else {
        p.stock = Math.max(0, p.stock - item.cantidad);
      }
      await saveProduct(p, branchSlug);
    }
  }

  const updatedOrder = await updateCustomerOrderAdmin(order.id, {
    ...order,
    stock_descontado: true,
  });

  return {
    updatedProducts: Array.from(productsMap.values()),
    updatedOrder,
  };
}

export async function restoreOrderStock(
  order: CustomerOrder,
  branchSlug: string,
  currentProducts: Product[]
): Promise<{ updatedProducts: Product[]; updatedOrder: CustomerOrder }> {
  const productsMap = new Map<string, Product>();
  currentProducts.forEach((p) => productsMap.set(p.sku.toLowerCase(), { ...p }));

  for (const item of order.items || []) {
    const p = productsMap.get(item.referencia.toLowerCase());
    if (p) {
      if (p.branchOverrides && p.branchOverrides[branchSlug]) {
        const currentStock = p.branchOverrides[branchSlug].stock ?? p.stock;
        p.branchOverrides[branchSlug].stock = currentStock + item.cantidad;
      } else {
        p.stock = p.stock + item.cantidad;
      }
      await saveProduct(p, branchSlug);
    }
  }

  const updatedOrder = await updateCustomerOrderAdmin(order.id, {
    ...order,
    stock_descontado: false,
  });

  return {
    updatedProducts: Array.from(productsMap.values()),
    updatedOrder,
  };
}



