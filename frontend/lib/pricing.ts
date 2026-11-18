import {
  BranchOverride,
  BuiltInPriceListId,
  CartItem,
  Customer,
  PriceList,
  PriceTier,
  Product,
  ProductPrices,
  PublicProduct,
  ResellerConfig,
  UserRole,
} from './types';

export const BUILT_IN_PRICE_LIST_IDS: BuiltInPriceListId[] = ['unit', 'dozen', 'wholesale'];

export const DEFAULT_PRICE_LIST_META: Record<
  BuiltInPriceListId,
  { name: string; sortOrder: number; defaultMinUnits?: number }
> = {
  unit: { name: 'Unidad', sortOrder: 1 },
  dozen: { name: 'Docena', sortOrder: 2, defaultMinUnits: 12 },
  wholesale: { name: 'Mayorista', sortOrder: 3, defaultMinUnits: 12 },
};

/**
 * Normaliza identificadores de sucursal o país para resolución de overrides sin dependencias de red.
 */
export function normalizeBranchKey(val?: string): string {
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

/**
 * Obtiene el override de sucursal de un producto o proyección pública de forma pura.
 */
export function resolveProductBranchOverride<
  T extends { branchOverrides?: Record<string, BranchOverride | Omit<BranchOverride, 'prices'>> }
>(
  product: T | null | undefined,
  branchSlug?: string
): BranchOverride | Omit<BranchOverride, 'prices'> | undefined {
  if (!product || !product.branchOverrides || !branchSlug) return undefined;
  if (product.branchOverrides[branchSlug] !== undefined) {
    return product.branchOverrides[branchSlug];
  }
  const targetCode = normalizeBranchKey(branchSlug);
  if (targetCode) {
    if (product.branchOverrides[targetCode] !== undefined) {
      return product.branchOverrides[targetCode];
    }
    for (const [key, val] of Object.entries(product.branchOverrides)) {
      if (normalizeBranchKey(key) === targetCode) {
        return val;
      }
    }
  }
  return undefined;
}

/**
 * Genera las 3 listas base iniciales compatibles con el inventario migrado de v1.
 */
export function getDefaultPriceListsForBranch(branchSlug: string = 'costarica'): PriceList[] {
  const cleanBranch = branchSlug || 'costarica';
  return [
    {
      id: 'unit',
      name: 'Unidad',
      branchSlug: cleanBranch,
      mode: 'manual',
      isActive: true,
      sortOrder: 1,
    },
    {
      id: 'dozen',
      name: 'Docena',
      branchSlug: cleanBranch,
      mode: 'manual',
      minUnits: 12,
      isActive: true,
      sortOrder: 2,
    },
    {
      id: 'wholesale',
      name: 'Mayorista',
      branchSlug: cleanBranch,
      mode: 'manual',
      minUnits: 12,
      isActive: true,
      isDefaultForSeller: true,
      sortOrder: 3,
    },
  ];
}

export function mapLegacyTierToListId(
  tier?: 'unidad' | 'docena' | 'mayoreo'
): BuiltInPriceListId {
  if (tier === 'unidad') return 'unit';
  if (tier === 'docena') return 'dozen';
  if (tier === 'mayoreo') return 'wholesale';
  return 'unit';
}

export function mapListIdToLegacyTier(
  listId?: string
): 'unidad' | 'docena' | 'mayoreo' {
  if (listId === 'unit') return 'unidad';
  if (listId === 'dozen') return 'docena';
  return 'mayoreo';
}

/**
 * Redondea un valor monetario al múltiplo comercial configurado (ej. 100, 500, 1000).
 */
export function roundToCommercialStep(value: number, step?: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (!step || step <= 1) {
    return Math.round(value * 100) / 100;
  }
  return Math.round(value / step) * step;
}

/**
 * Resuelve el objeto ProductPrices efectivo para una sucursal dada.
 */
export function getEffectiveProductPrices(
  product: Pick<Product, 'prices' | 'branchOverrides'>,
  branchSlug?: string
): ProductPrices {
  const override = resolveProductBranchOverride(product, branchSlug) as BranchOverride | undefined;
  return override?.prices || product.prices || { unit: 0, dozen: 0, wholesale: 0 };
}

/**
 * Calcula el precio de un producto para una lista específica siguiendo el Modelo Híbrido:
 * 1. Excepción manual explícita en `customLists[listId]` si existe (> 0).
 * 2. Si la lista tiene `mode === 'base_percent'`, calcula desde `basePrice` + `%` + redondeo comercial.
 * 3. Para listas base (`unit`, `dozen`, `wholesale`) en modo manual, usa su valor exacto guardado.
 */
export function resolveProductPriceForList(
  product: Pick<Product, 'prices' | 'branchOverrides'>,
  priceListOrId: PriceList | PriceTier,
  branchSlug?: string,
  allLists?: PriceList[]
): number {
  const prices = getEffectiveProductPrices(product, branchSlug);
  const listId = typeof priceListOrId === 'string' ? priceListOrId : priceListOrId.id;
  const listObj =
    typeof priceListOrId === 'object'
      ? priceListOrId
      : allLists?.find((l) => l.id === listId);

  const customOverride = prices.customLists?.[listId];
  if (typeof customOverride === 'number' && Number.isFinite(customOverride) && customOverride > 0) {
    return customOverride;
  }

  if (listObj?.mode === 'base_percent') {
    const base =
      prices.basePrice && prices.basePrice > 0
        ? prices.basePrice
        : prices.wholesale && prices.wholesale > 0
        ? prices.wholesale
        : prices.unit || 0;

    if (base > 0) {
      const pct = Math.max(0, Number(listObj.percentValue || 0));
      const factor =
        listObj.baseOperation === 'discount' ? 1 - pct / 100 : 1 + pct / 100;
      const raw = Math.max(0, base * factor);
      return roundToCommercialStep(raw, listObj.roundingStep);
    }
  }

  if (listId === 'unit' || listId === 'dozen' || listId === 'wholesale') {
    const directVal = prices[listId];
    if (typeof directVal === 'number' && Number.isFinite(directVal) && directVal > 0) {
      return directVal;
    }
  }

  if (typeof prices.basePrice === 'number' && prices.basePrice > 0) {
    return prices.basePrice;
  }

  return prices.unit || prices.wholesale || prices.dozen || 0;
}

/**
 * Calcula el precio de venta al cliente final configurado por un Emprendedor en Modo Marca Blanca.
 */
export function resolveResellerPrice(
  costPrice: number,
  product: Pick<Product, 'id' | 'sku'>,
  resellerConfig?: ResellerConfig | null
): number {
  const cleanCost = Number.isFinite(costPrice) && costPrice > 0 ? costPrice : 0;
  if (!resellerConfig) return cleanCost;

  const overrideBySku = resellerConfig.productOverrides?.[product.sku];
  if (typeof overrideBySku === 'number' && Number.isFinite(overrideBySku) && overrideBySku > 0) {
    return overrideBySku;
  }
  const overrideById = resellerConfig.productOverrides?.[product.id];
  if (typeof overrideById === 'number' && Number.isFinite(overrideById) && overrideById > 0) {
    return overrideById;
  }

  const markup = Math.max(0, Number(resellerConfig.defaultMarkupPercent ?? 30));
  const raw = cleanCost * (1 + markup / 100);
  return roundToCommercialStep(raw, resellerConfig.roundingStep);
}

/**
 * Determina las listas de precios visibles y seleccionables para el usuario actual.
 * Visitantes y cuentas no aprobadas reciben siempre [].
 */
export function getVisiblePriceListsForUser(
  allBranchLists: PriceList[],
  role: UserRole,
  customer: Customer | null,
  isAuthenticated: boolean
): PriceList[] {
  const activeSorted = [...allBranchLists]
    .filter((l) => l.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  if (!isAuthenticated) {
    return [];
  }

  if (role === 'superadmin') {
    return activeSorted;
  }

  const isApproved = customer?.estado_acceso === 'aprobado';
  if (!isApproved) {
    return [];
  }

  if (role === 'admin' || role === 'vendedor') {
    return activeSorted;
  }

  // Cliente o Emprendedor: estrictamente restringido a las listas habilitadas por Admin
  const allowedIds = Array.isArray(customer?.allowedPriceLists)
    ? customer.allowedPriceLists
    : customer?.lista_precio
    ? [mapLegacyTierToListId(customer.lista_precio)]
    : [];

  if (allowedIds.length === 0) {
    return [];
  }

  const allowedSet = new Set(allowedIds);
  return activeSorted.filter((l) => allowedSet.has(l.id));
}

export interface CartMinimumValidationResult {
  valid: boolean;
  missingUnits: number;
  missingAmount: number;
  reason?: string;
}

/**
 * Valida si el carrito cumple los mínimos opcionales configurados en la lista de precios activa.
 * SuperAdmin, Admin y Vendedor están exentos de restricciones mínimas.
 */
export function validateCartMinimums(
  items: Pick<CartItem, 'quantity'>[],
  activeList: PriceList | undefined,
  totalAmount: number,
  role: UserRole
): CartMinimumValidationResult {
  if (role === 'superadmin' || role === 'admin' || role === 'vendedor') {
    return { valid: true, missingUnits: 0, missingAmount: 0 };
  }

  if (!activeList) {
    return { valid: false, missingUnits: 0, missingAmount: 0, reason: 'Sin lista de precios habilitada.' };
  }

  const totalUnits = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const minUnits = activeList.minUnits && activeList.minUnits > 0 ? activeList.minUnits : 0;
  const minAmount =
    activeList.minOrderAmount && activeList.minOrderAmount > 0 ? activeList.minOrderAmount : 0;

  const missingUnits = minUnits > 0 ? Math.max(0, minUnits - totalUnits) : 0;
  const missingAmount = minAmount > 0 ? Math.max(0, minAmount - totalAmount) : 0;

  if (missingUnits > 0 && missingAmount > 0) {
    return {
      valid: false,
      missingUnits,
      missingAmount,
      reason: `Faltan ${missingUnits} unid. y alcanzar el monto mínimo para tarifa ${activeList.name}.`,
    };
  }
  if (missingUnits > 0) {
    return {
      valid: false,
      missingUnits,
      missingAmount: 0,
      reason: `Faltan ${missingUnits} ${missingUnits === 1 ? 'unidad' : 'unidades'} para aplicar la tarifa ${activeList.name} (mín. ${minUnits}).`,
    };
  }
  if (missingAmount > 0) {
    return {
      valid: false,
      missingUnits: 0,
      missingAmount,
      reason: `Monto mínimo requerido para tarifa ${activeList.name} aún no alcanzado.`,
    };
  }

  return { valid: true, missingUnits: 0, missingAmount: 0 };
}

/**
 * Proyecta un producto maestro a su versión pública segura sin ningún campo de precios ni imagen original.
 */
export function toPublicProductProjection(product: Product): PublicProduct {
  let cleanOverrides: Record<string, Omit<BranchOverride, 'prices'>> | undefined;

  if (product.branchOverrides) {
    cleanOverrides = {};
    for (const [branchKey, override] of Object.entries(product.branchOverrides)) {
      if (!override) continue;
      cleanOverrides[branchKey] = {
        ...(override.stock !== undefined ? { stock: override.stock } : {}),
        ...(override.status !== undefined ? { status: override.status } : {}),
        ...(override.filledWeight !== undefined ? { filledWeight: override.filledWeight } : {}),
      };
    }
  }

  return {
    id: product.id,
    tenantId: product.tenantId,
    sku: product.sku,
    name: product.name,
    category: product.category,
    categories: product.categories,
    size: product.size,
    filledWeight: product.filledWeight,
    stock: product.stock,
    status: product.status,
    processedImageUrl: product.processedImageUrl,
    tags: product.tags || [],
    ...(cleanOverrides ? { branchOverrides: cleanOverrides } : {}),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
