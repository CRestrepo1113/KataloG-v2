import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  getDefaultPriceListsForBranch,
  resolveProductPriceForList,
  resolveResellerPrice,
  getVisiblePriceListsForUser,
  validateCartMinimums,
  toPublicProductProjection,
  roundToCommercialStep,
} from '../pricing';
import {
  resolveAccessStatus,
  canViewPrices,
  canUseCart,
  canUseWhiteLabel,
  canAccessFinancialModule,
  canManageUserRoles,
  canManagePriceLists,
} from '../auth';
import { Customer, PriceList, Product } from '../types';

const REPO_ROOT = path.resolve(process.cwd(), '..');
const FRONTEND_ROOT = process.cwd();

const sampleProduct: Product = {
  id: 'prod-oso-30',
  sku: 'OSO-30-CR',
  name: 'Oso Ternura 30cm',
  category: 'Osos',
  size: '30 cm',
  filledWeight: 320,
  stock: 40,
  status: 'active',
  prices: {
    basePrice: 5000,
    wholesale: 5500,
    dozen: 6500,
    unit: 9500,
    customLists: {
      vip_cash: 4800,
    },
  },
  originalImageUrl: 'https://private.example/raw.png',
  processedImageUrl: 'https://cdn.example/oso.webp',
  tags: ['osos'],
  branchOverrides: {
    honduras: {
      prices: {
        basePrice: 250,
        wholesale: 280,
        dozen: 320,
        unit: 450,
        customLists: {
          vip_cash: 240,
        },
      },
      stock: 15,
      status: 'active',
    },
  },
};

const sampleLists: PriceList[] = [
  ...getDefaultPriceListsForBranch('costarica'),
  {
    id: 'emprendedor_plus',
    name: 'Emprendedor +20%',
    branchSlug: 'costarica',
    mode: 'base_percent',
    baseOperation: 'markup',
    percentValue: 20,
    roundingStep: 500,
    minUnits: 6,
    minOrderAmount: 30000,
    isActive: true,
    sortOrder: 4,
  },
  {
    id: 'vip_cash',
    name: 'VIP Contado (-10%)',
    branchSlug: 'costarica',
    mode: 'base_percent',
    baseOperation: 'discount',
    percentValue: 10,
    roundingStep: 100,
    isActive: true,
    sortOrder: 5,
  },
  {
    id: 'hidden_promo',
    name: 'Promo Inactiva',
    branchSlug: 'costarica',
    mode: 'base_percent',
    baseOperation: 'discount',
    percentValue: 15,
    isActive: false,
    sortOrder: 6,
  },
];

test('Modelo híbrido de listas de precios calcula manual, % base, redondeo y excepciones por SKU', () => {
  assert.equal(resolveProductPriceForList(sampleProduct, 'unit', 'costarica', sampleLists), 9500);
  assert.equal(resolveProductPriceForList(sampleProduct, 'dozen', 'costarica', sampleLists), 6500);
  assert.equal(resolveProductPriceForList(sampleProduct, 'wholesale', 'costarica', sampleLists), 5500);

  // Lista base_percent +20% sobre 5000 = 6000 (redondeo 500 -> 6000)
  assert.equal(
    resolveProductPriceForList(sampleProduct, 'emprendedor_plus', 'costarica', sampleLists),
    6000
  );

  // Excepción explícita customLists['vip_cash'] debe anular el cálculo -10%
  assert.equal(
    resolveProductPriceForList(sampleProduct, 'vip_cash', 'costarica', sampleLists),
    4800
  );

  // Branch override en Honduras debe usar precios de Honduras
  assert.equal(
    resolveProductPriceForList(sampleProduct, 'unit', 'honduras', sampleLists),
    450
  );
  assert.equal(
    resolveProductPriceForList(sampleProduct, 'emprendedor_plus', 'honduras', sampleLists),
    500 // 250 * 1.2 = 300 -> redondeado al step 500 = 500
  );
  assert.equal(roundToCommercialStep(4320, 100), 4300);
});

test('Emprendedor en Modo Marca Blanca calcula margen %, redondeo y excepciones por SKU', () => {
  const resellerCfg = {
    defaultMarkupPercent: 35,
    roundingStep: 500,
    productOverrides: {
      'OSO-30-CR': 9900,
    },
  };
  assert.equal(resolveResellerPrice(5500, sampleProduct, resellerCfg), 9900);
  assert.equal(
    resolveResellerPrice(5500, { id: 'other-id', sku: 'OTHER-1' }, resellerCfg),
    7500 // 5500 * 1.35 = 7425 -> step 500 => 7500
  );
});

test('Visibilidad estricta de listas de precios según visitante, estado y rol', () => {
  const approvedClient: Customer = {
    id: 'u-cli',
    nombre: 'Ana',
    rol: 'cliente',
    estado_acceso: 'aprobado',
    allowedPriceLists: ['unit', 'hidden_promo'],
  };
  const pendingClient: Customer = {
    ...approvedClient,
    estado_acceso: 'pendiente',
  };
  const seller: Customer = {
    id: 'u-vend',
    nombre: 'Luis',
    rol: 'vendedor',
    estado_acceso: 'aprobado',
  };
  const entrepreneur: Customer = {
    id: 'u-emp',
    nombre: 'Tienda Mia',
    rol: 'emprendedor',
    estado_acceso: 'aprobado',
    allowedPriceLists: ['wholesale', 'emprendedor_plus'],
    whiteLabelEnabled: true,
    subscriptionStatus: 'active',
  };

  // Visitante anónimo y usuario pendiente nunca reciben listas
  assert.deepEqual(getVisiblePriceListsForUser(sampleLists, 'cliente', null, false), []);
  assert.deepEqual(getVisiblePriceListsForUser(sampleLists, 'cliente', pendingClient, true), []);

  // Cliente aprobado solo ve listas activas que el Admin habilitó (hidden_promo filtrada)
  const cliLists = getVisiblePriceListsForUser(sampleLists, 'cliente', approvedClient, true);
  assert.deepEqual(
    cliLists.map((l) => l.id),
    ['unit']
  );

  // Emprendedor aprobado solo ve sus listas habilitadas
  const empLists = getVisiblePriceListsForUser(sampleLists, 'emprendedor', entrepreneur, true);
  assert.deepEqual(
    empLists.map((l) => l.id),
    ['wholesale', 'emprendedor_plus']
  );

  // Vendedor ve todas las listas activas de la sede
  const vendLists = getVisiblePriceListsForUser(sampleLists, 'vendedor', seller, true);
  assert.equal(vendLists.length, 5);
});

test('Validación de mínimos de pedido por lista y exención de Vendedor/Admin', () => {
  const empList = sampleLists.find((l) => l.id === 'emprendedor_plus');

  const tooFewUnits = validateCartMinimums([{ quantity: 3 }], empList, 35000, 'cliente');
  assert.equal(tooFewUnits.valid, false);
  assert.equal(tooFewUnits.missingUnits, 3);

  const tooLowAmount = validateCartMinimums([{ quantity: 6 }], empList, 20000, 'emprendedor');
  assert.equal(tooLowAmount.valid, false);
  assert.equal(tooLowAmount.missingAmount, 10000);

  const okClient = validateCartMinimums([{ quantity: 6 }], empList, 36000, 'cliente');
  assert.equal(okClient.valid, true);

  // Vendedor exento de mínimos incluso con 1 unidad
  const okSeller = validateCartMinimums([{ quantity: 1 }], empList, 6000, 'vendedor');
  assert.equal(okSeller.valid, true);
});

test('Proyección pública catalog_public nunca filtra precios ni URLs privadas', () => {
  const pub = toPublicProductProjection(sampleProduct) as unknown as Record<string, unknown>;
  const pubOverrides = pub.branchOverrides as Record<string, Record<string, unknown>> | undefined;
  assert.equal('prices' in pub, false);
  assert.equal('originalImageUrl' in pub, false);
  assert.equal('prices' in (pubOverrides?.honduras || {}), false);
  assert.equal(pubOverrides?.honduras?.stock, 15);
  assert.equal(pub.sku, 'OSO-30-CR');
});

test('Autorización de roles, estado de acceso, Marca Blanca y módulo financiero', () => {
  assert.equal(resolveAccessStatus(null), 'visitante');
  assert.equal(canViewPrices(null), false);
  assert.equal(canUseCart(null), false);

  const pendingUser: Customer = {
    id: 'u1',
    nombre: 'Pendiente',
    rol: 'cliente',
    estado_acceso: 'pendiente',
  };
  assert.equal(canViewPrices(pendingUser, 'cliente'), false);
  assert.equal(canUseCart(pendingUser, 'cliente'), false);

  const rejectedUser: Customer = { ...pendingUser, estado_acceso: 'rechazado' };
  assert.equal(canViewPrices(rejectedUser, 'cliente'), false);

  const approvedEntrepreneur: Customer = {
    id: 'u2',
    nombre: 'Emp',
    rol: 'emprendedor',
    estado_acceso: 'aprobado',
    whiteLabelEnabled: true,
    subscriptionStatus: 'active',
  };
  assert.equal(canViewPrices(approvedEntrepreneur, 'emprendedor'), true);
  assert.equal(canUseWhiteLabel(approvedEntrepreneur), true);
  assert.equal(
    canUseWhiteLabel({ ...approvedEntrepreneur, subscriptionStatus: 'expired' }),
    false
  );
  assert.equal(
    canUseWhiteLabel({ ...approvedEntrepreneur, rol: 'cliente' }),
    false
  );

  // Separación Admin vs SuperAdmin
  assert.equal(canAccessFinancialModule('superadmin'), true);
  assert.equal(canAccessFinancialModule('admin'), false);
  assert.equal(canManageUserRoles('superadmin'), true);
  assert.equal(canManageUserRoles('admin'), false);
  assert.equal(canManagePriceLists('admin'), true);
  assert.equal(canManagePriceLists('vendedor'), false);
});

test('firestore.rules bloquea escalamiento de privilegios y protege colecciones sensibles', () => {
  const rulesPath = path.join(REPO_ROOT, 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // Ninguna regla abierta wildcard para usuarios autenticados
  assert.equal(/allow read, write:\s*if\s+request\.auth\s*!=\s*null/.test(rules), false);

  // catalog_public lectura pública, sin prices en escritura
  assert.match(rules, /match \/catalog_public\/\{docId\}/);
  assert.match(rules, /!\('prices' in request\.resource\.data\)/);

  // products & price_lists solo lectura a usuarios aprobados
  assert.match(rules, /match \/products\/\{productId\}[\s\S]*allow read:\s*if isApproved\(\)/);
  assert.match(rules, /match \/price_lists\/\{listId\}[\s\S]*allow read:\s*if isApproved\(\)/);
  assert.match(rules, /match \/price_lists\/\{listId\}[\s\S]*allow create, update:/);
  assert.match(rules, /match \/price_lists\/\{listId\}[\s\S]*allow delete:/);

  // Creación propia de cliente exige estado pendiente y rol cliente
  assert.match(rules, /request\.resource\.data\.rol == 'cliente'/);
  assert.match(rules, /request\.resource\.data\.estado_acceso == 'pendiente'/);
  assert.match(rules, /request\.resource\.data\.whiteLabelEnabled == false/);
  assert.match(rules, /request\.resource\.data\.allowedPriceLists\.size\(\) == 0/);
});

test('Cero credenciales hardcodeadas de v1 en código fuente ni scripts de v2', () => {
  const filesToAudit = [
    path.join(FRONTEND_ROOT, 'lib/firebase.ts'),
    path.join(FRONTEND_ROOT, 'scripts/migrate_v1_to_v2.mjs'),
    path.join(FRONTEND_ROOT, 'scripts/inspect_db.mjs'),
    path.join(FRONTEND_ROOT, 'scripts/reset_products.mjs'),
  ];

  for (const filePath of filesToAudit) {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(content.includes('AIzaSy'), false, `Hardcoded API key detected in ${filePath}`);
    assert.equal(
      content.includes('katalog-277ca'),
      false,
      `Hardcoded v1 projectId detected in ${filePath}`
    );
  }
});
