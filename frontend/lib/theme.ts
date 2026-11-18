import { PriceTier } from './types';

export const BRAND_COLORS = {
  primary: '#3C5866',    // Azul Pizarra / Denim Corporativo
  accent: '#C37D41',     // Marrón Caramelo
  dark: '#263842',
  light: '#F8FAFC',
  cardBg: { name: 'Azul Cielo Pastel', hex: '#B9E0FD', border: '#93D0FC' },
  pastels: [
    { name: 'Azul Cielo Pastel', hex: '#B9E0FD', border: '#93D0FC' },
  ],
};

export const PRICE_TIER_LABELS: Record<string, string> = {
  unit: 'Unidad',
  dozen: 'Docena',
  wholesale: 'Mayorista',
};

export function getTierForQuantity(quantity: number): 'unit' | 'dozen' | 'wholesale' {
  if (quantity >= 13) return 'wholesale';
  if (quantity === 12) return 'dozen';
  return 'unit';
}

export function getPriceForQuantity(prices: { unit: number; dozen: number; wholesale: number }, quantity: number): { unitPrice: number; tier: PriceTier; tierLabel: string } {
  const tier = getTierForQuantity(quantity);
  const unitPrice = prices[tier] ?? prices.unit ?? 0;
  return {
    unitPrice,
    tier,
    tierLabel: PRICE_TIER_LABELS[tier] || 'Unidad',
  };
}

export function getPastelBgColor(_index?: number) {
  return BRAND_COLORS.cardBg;
}

export function extractImageBgColor(_src?: string): Promise<{ hex: string; border: string }> {
  // Siempre devuelve el azul pastel estándar unificado para que tarjeta y fondo coincidan exactamente
  return Promise.resolve(BRAND_COLORS.cardBg);
}

export function parseFlexiblePrice(rawVal: string | number | undefined, defaultVal = 0): number {
  if (rawVal === undefined || rawVal === null || rawVal === '') return defaultVal;
  if (typeof rawVal === 'number') return isNaN(rawVal) ? defaultVal : rawVal;

  let str = String(rawVal).trim().replace(/[$€₡L\s]/gi, ''); // Remove currency symbols & spaces
  if (!str) return defaultVal;

  // Case 1: Has both dot and comma e.g. "1.240,50" or "1,240.50" or "1.500.000,00"
  if (str.includes('.') && str.includes(',')) {
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    if (lastDot < lastComma) {
      // Spanish/European: dots are thousands, last comma is decimal (e.g. 1.240,50)
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: commas are thousands, last dot is decimal (e.g. 1,240.50)
      str = str.replace(/,/g, '');
    }
  }
  // Case 2: Only has dots e.g. "1.240", "12.500", "1.240.000", "12.99"
  else if (str.includes('.')) {
    const dotParts = str.split('.');
    if (dotParts.length > 2) {
      // Multiple dots e.g. "1.240.000" -> all dots are thousands separators
      str = str.replace(/\./g, '');
    } else {
      // Single dot e.g. "1.240" vs "12.99" vs "1240.50"
      const decimalPart = dotParts[1];
      // If exactly 3 digits after dot (e.g. 1.240, 1.550, 2.730, 15.500), it's a thousands separator from Excel/Spanish format
      if (decimalPart.length === 3) {
        str = str.replace(/\./g, '');
      }
      // Otherwise (e.g. 12.99, 1240.50, 79.85) -> keep decimal dot
    }
  }
  // Case 3: Only has commas e.g. "1,240", "12,500", "1,240,000", "79,85", "1240,5"
  else if (str.includes(',')) {
    const commaParts = str.split(',');
    if (commaParts.length > 2) {
      // Multiple commas e.g. "1,240,000" -> thousands separators
      str = str.replace(/,/g, '');
    } else {
      const decimalPart = commaParts[1];
      // If exactly 3 digits after comma (e.g. 1,240, 12,500) -> thousands separator
      if (decimalPart.length === 3) {
        str = str.replace(/,/g, '');
      } else {
        // 1 or 2 digits (e.g. 79,85 or 1240,5) -> decimal comma
        str = str.replace(',', '.');
      }
    }
  }

  // Clean any remaining non-numeric chars except dot
  str = str.replace(/[^0-9.]/g, '');
  const num = parseFloat(str);

  if (isNaN(num)) return defaultVal;

  // Return rounded to 2 decimal places
  return Math.round(num * 100) / 100;
}

export function formatCurrency(amount: number, symbol: string = '$'): string {
  if (amount === undefined || amount === null || isNaN(amount)) return `${symbol} 0`;
  const formattedNumber = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${symbol} ${formattedNumber}`;
}

export function formatSize(size?: string): string {
  if (!size) return '';
  const trimmed = size.trim();
  if (!trimmed) return '';
  if (/cm$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return `${trimmed} CM`;
}

/**
 * Extrae el valor numérico en centímetros del campo de tamaño de un producto para ordenamiento.
 * Soporta "30 cm", "25CM", "1.2 m", "40", etc.
 */
export function parseProductNumericSize(size?: string): number {
  if (!size) return 0;
  const trimmed = size.trim();
  if (!trimmed) return 0;

  // Si incluye metros (ej: "1.2 m", "1,5 mts", "1m")
  const meterMatch = trimmed.match(/([\d]+[.,]?\d*)\s*m(?:etro)?s?(?:$|\s)/i);
  if (meterMatch) {
    const val = parseFloat(meterMatch[1].replace(',', '.'));
    if (!isNaN(val)) return val * 100;
  }

  // Coincidencia para centímetros o número simple (ej: "30 cm", "25cm", "40")
  const numMatch = trimmed.match(/([\d]+[.,]?\d*)/);
  if (numMatch) {
    const val = parseFloat(numMatch[1].replace(',', '.'));
    if (!isNaN(val)) return val;
  }

  return 0;
}

export function cleanCategoryString(str?: string): string {
  if (!str) return '';
  return str
    .replace(/[\r\n\t\uFEFF\u200B-\u200D\u00A0]/g, '')
    .trim();
}

export function getProductCategoryList(product: any): string[] {
  if (!product) return [];
  const set = new Set<string>();

  const processVal = (val: any) => {
    if (!val) return;
    if (typeof val === 'string') {
      val.split(/[,/|;\n]/).forEach((c) => {
        const cleaned = cleanCategoryString(c);
        if (cleaned) set.add(cleaned.toLowerCase());
      });
    } else if (Array.isArray(val)) {
      val.forEach((item) => processVal(item));
    }
  };

  if (product.category && typeof product.category === 'string' && product.category.trim()) {
    processVal(product.category);
  } else if (product.categories) {
    processVal(product.categories);
  }

  return Array.from(set);
}

export function getAllUniqueCategories(products: any[]): string[] {
  if (!products || !Array.isArray(products)) return [];
  const set = new Set<string>();

  products.forEach((p) => {
    const cats = getProductCategoryList(p);
    cats.forEach((c) => {
      if (c) {
        set.add(c.toUpperCase());
      }
    });
  });

  return Array.from(set);
}

export function isProductInCategory(product: any, selectedCategory: string): boolean {
  if (!selectedCategory || selectedCategory === 'all') return true;

  const target = cleanCategoryString(selectedCategory).toLowerCase();
  if (!target || target === 'all') return true;

  const prodCats = getProductCategoryList(product);
  return prodCats.includes(target);
}

export function getBaseSku(sku: string): string {
  if (!sku) return '';
  const clean = sku
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toUpperCase();

  // Strips branch/country suffixes like " HON", " CR", " COL", "-HON", "_CR", "-HN", etc.
  return clean.replace(/[\s\-_]+(HON|HN|CR|COL|CO|MX|GT|SV|NI|PA|PE|CL|AR|EC|DO|UY|PY|BO|VE|BR|DEFAULT|MAIN)$/i, '').trim();
}

export function extractSkusFromFilename(filename: string): string[] {
  if (!filename) return [];
  const lastDotIndex = filename.lastIndexOf('.');
  const baseName = lastDotIndex !== -1 ? filename.substring(0, lastDotIndex) : filename;

  // Normalize separators: comas, guiones bajos, ' y ', '&', '+', '/', etc.
  const normalized = baseName
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+(?:y|e|&|and|\+)\s+/gi, ',')
    .replace(/[\/,;|+]/g, ',')
    .replace(/\s+-\s+/g, ',')
    .replace(/_{1,}/g, ',');

  const tokens = normalized
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const results = new Set<string>();
  for (const token of tokens) {
    const clean = token
      .replace(/^\uFEFF/, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
      .toUpperCase();
    if (clean) {
      results.add(clean);
      const bSku = getBaseSku(clean);
      if (bSku) {
        results.add(bSku);
      }
    }
  }

  const fullBase = getBaseSku(baseName.trim());
  if (fullBase) {
    results.add(fullBase);
  }

  return Array.from(results);
}

