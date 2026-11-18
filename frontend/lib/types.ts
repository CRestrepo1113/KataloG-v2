export type BuiltInPriceListId = 'unit' | 'dozen' | 'wholesale';
export type PriceTier = BuiltInPriceListId | (string & {});
export type CatalogSortOption = 'default' | 'price-asc' | 'price-desc' | 'size-asc' | 'size-desc';

export type UserRole = 'superadmin' | 'admin' | 'vendedor' | 'emprendedor' | 'cliente';
export type AccessStatus = 'pendiente' | 'aprobado' | 'rechazado' | 'suspendido';

export interface PriceList {
  id: string;
  name: string;
  branchSlug: string; // 'global' o slug de sucursal (ej. 'costarica')
  mode: 'manual' | 'base_percent';
  baseOperation?: 'markup' | 'discount';
  percentValue?: number;
  roundingStep?: number;
  minUnits?: number;
  minOrderAmount?: number;
  isActive: boolean;
  isDefaultForSeller?: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductPrices {
  unit: number;
  dozen: number;
  wholesale: number;
  special?: number;
  basePrice?: number;
  customLists?: Record<string, number>;
}

export type ProductStatus = 'active' | 'out_of_stock' | 'disabled';

export interface BranchOverride {
  prices?: ProductPrices;
  stock?: number;
  status?: ProductStatus;
  filledWeight?: number; // Weight with stuffing in grams
}

export interface Product {
  id: string;
  tenantId?: string;
  sku: string;
  name: string;
  category: string;
  categories?: string[]; // Support multi-category tags e.g. ["Animales", "Osos", "Bolso", "Rosa"]
  size?: string; // Size / Measurement in cm (e.g. "30 cm")
  filledWeight?: number; // Weight with stuffing in grams (e.g. 180, 350)
  stock: number;
  status: ProductStatus;
  prices: ProductPrices;
  originalImageUrl?: string;
  processedImageUrl: string;
  tags: string[];
  branchOverrides?: Record<string, BranchOverride>; // Branch-specific prices, stock & weight
  createdAt?: string;
  updatedAt?: string;
}

export interface PublicProduct {
  id: string;
  tenantId?: string;
  sku: string;
  name: string;
  category: string;
  categories?: string[];
  size?: string;
  filledWeight?: number;
  stock: number;
  status: ProductStatus;
  processedImageUrl: string;
  tags: string[];
  branchOverrides?: Record<string, Omit<BranchOverride, 'prices'>>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SocialLinks {
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
}

export interface CompanyInfo {
  tenantId?: string;
  name: string;
  country?: string;
  orderPrefix?: string; // Indicativo / Prefijo de pedidos (ej: CR, HN, CO, MX)
  slogan: string;
  phone: string;
  address: string;
  socialMedia: string;
  socialLinks?: SocialLinks;
  logoUrl: string;
  nameLogoUrl: string;
  currencySymbol?: string;
  currencyCode?: string;
  showStock?: boolean;
  brandColors: {
    primary: string;
    accent: string;
    pastels: string[];
  };
}

export interface Branch {
  id: string;
  slug: string;
  name: string;
  country: string;
  orderPrefix?: string; // Indicativo / Prefijo de pedidos asignado (ej: CR, HN, CO, MX)
  currencySymbol: string;
  currencyCode: string;
  phone: string;
  address?: string;
  slogan?: string;
  socialMedia?: string;
  socialLinks?: SocialLinks;
  logoUrl?: string;
  isActive: boolean;
  isMain?: boolean;
  showStock?: boolean;
  createdAt?: string;
}

export type TenantInfo = Branch;

export interface CartItem {
  product: Product;
  quantity: number;
  comment?: string;
}

export interface ResellerConfig {
  defaultMarkupPercent: number;
  roundingStep?: number;
  sourceCostListId?: string;
  productOverrides?: Record<string, number>;
  hideStockInClientMode?: boolean;
  brandTitle?: string;
}

// -------------------------------------------------------------
// CUSTOMER & ORDER MODELS (Retrocompatibles con KYG Gestión)
// -------------------------------------------------------------
export interface Customer {
  id: string; // CL-000XXX or Firebase Auth UID
  uid?: string; // Firebase Auth UID
  nombre: string;
  negocio?: string;
  cedula?: string;
  telefonos?: string;
  email?: string;
  ciudad?: string;
  direccion?: string;
  lista_precio?: 'unidad' | 'docena' | 'mayoreo';
  allowedPriceLists?: string[];
  defaultPriceList?: string;
  estado_acceso?: AccessStatus;
  perfil_solicitado?: 'cliente' | 'emprendedor';
  whiteLabelEnabled?: boolean;
  subscriptionStatus?: 'none' | 'trial' | 'active' | 'expired';
  resellerConfig?: ResellerConfig;
  pais?: string;
  sucursal?: string;
  assigned_branches?: string[]; // Sucursales autorizadas para administradores (multi-sucursal)
  caja_id?: string;
  punto_venta?: string;
  saldo?: number;
  creado_en?: string;
  ultimo_acceso?: string;
  activeCart?: CartItem[];
  rol?: UserRole;
}

export interface AccessRequest {
  id: string;
  uid: string;
  customerId: string;
  nombre: string;
  negocio?: string;
  telefonos: string;
  email: string;
  ciudad?: string;
  pais: string;
  sucursal: string;
  tipo_solicitud: 'nuevo_registro' | 'cambio_perfil' | 'ampliar_listas';
  perfil_solicitado: 'cliente' | 'emprendedor';
  listas_solicitadas?: string[];
  mensaje?: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  revisado_por?: string;
  revisado_en?: string;
  nota_admin?: string;
  creado_en: string;
}

export interface OrderItem {
  referencia: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  descuento_porcentaje?: number; // Descuento porcentual por referencia (ej: 10 para 10%)
  descuento_monto?: number; // Monto descontado en esta línea
  moneda?: string;
  gramos_relleno?: number;
  imagen_url?: string;
  comentario?: string;
  medida?: string;
}

export type OrderStatus =
  | 'pendiente'
  | 'proceso'
  | 'empacado'
  | 'entregado'
  | 'cancelado'
  | 'bodega'
  | 'empaque'
  | 'despacho'
  | 'entrega';
export type PaymentStatus = 'pendiente' | 'parcial' | 'pagado';

export interface PaymentDeposit {
  fecha: string;
  monto: number;
  metodo?: string;
  nota?: string;
}

export interface CustomerOrder {
  id: string; // Correlative ID e.g. CR-000001
  cliente_id: string;
  cliente_nombre: string;
  cliente_tienda?: string;
  negocio?: string;
  cliente_direccion?: string;
  cliente_telefono?: string;
  cliente_email?: string;
  pais: string;
  sucursal: string;
  orderPrefix?: string; // Indicativo de la sucursal (ej: CR, HN, CO, MX)
  caja_id?: string;
  punto_venta?: string;
  condicion: 'Contado' | 'Credito';
  moneda: string;
  tasa_cambio?: number;
  items: OrderItem[];
  subtotal_bruto?: number;
  subtotal_gravado?: number;
  subtotal_exento?: number;
  descuento_items?: number;
  descuento_porcentaje_general?: number;
  descuento_general?: number;
  descuento_total?: number;
  isv_total?: number;
  total_factura: number;
  monto_abonado?: number;
  saldo?: number;
  estado_pago?: PaymentStatus;
  fecha_promesa_pago?: string;
  metodo_pago?: string;
  stock_descontado?: boolean;
  historial_abonos?: PaymentDeposit[];
  incluye_iva?: boolean;
  iva_tasa?: number;
  nota?: string;
  estado: OrderStatus;
  tipo_solicitud?: 'PEDIDO' | string;
  tarifa_aplicada?: PriceTier;
  tarifa_nombre?: string;
  origen?: 'katalog_web' | 'katalog_app' | 'caja';
  creado_en: string;
  actualizado_en?: string;
  modificado?: boolean;
  atendido_por?: string;
  vendedor?: string;
  vendedor_id?: string;
  facturado?: boolean;
  numero_factura?: string;
  fecha_factura?: string;
  syncedToCloud?: boolean;
}
