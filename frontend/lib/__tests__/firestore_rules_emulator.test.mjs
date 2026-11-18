import test from 'node:test';
import assert from 'node:assert/strict';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'katalog-v2-emu';

if (!HOST) {
  throw new Error(
    'FIRESTORE_EMULATOR_HOST no está definido. Ejecuta este test con: firebase emulators:exec --only firestore ...'
  );
}

const BASE = `http://${HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function base64Url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeEmulatorJwt(uid, email, emailVerified = true) {
  const header = base64Url({ alg: 'none', typ: 'JWT' });
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = base64Url({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    auth_time: nowSec,
    user_id: uid,
    sub: uid,
    iat: nowSec,
    exp: nowSec + 3600,
    email,
    email_verified: emailVerified,
    firebase: { identities: { email: [email] }, sign_in_provider: 'password' },
  });
  return `${header}.${payload}.`;
}

function encodeVal(val) {
  if (val === null) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(encodeVal) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = encodeVal(v);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function toDocBody(data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) fields[k] = encodeVal(v);
  }
  return { fields };
}

async function req(method, docPath, { token = '', body = null } = {}) {
  const url = `${BASE}/${docPath}`;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(toDocBody(body)) : undefined,
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

async function seedDoc(docPath, data) {
  const res = await req('PATCH', docPath, { token: 'owner', body: data });
  assert.equal(res.status, 200, `Seed falló para ${docPath}: ${res.text}`);
}

const TOKENS = {
  superadmin: makeEmulatorJwt('uid-super', 'crestrepol.kyg@gmail.com', true),
  adminCr: makeEmulatorJwt('uid-admin-cr', 'admincr@test.com', true),
  sellerCr: makeEmulatorJwt('uid-seller-cr', 'vendedorcr@test.com', true),
  approvedClient: makeEmulatorJwt('uid-cli-ok', 'cliok@test.com', true),
  pendingClient: makeEmulatorJwt('uid-cli-pend', 'clipend@test.com', true),
  newRegistrant: makeEmulatorJwt('uid-new-user', 'nuevo@test.com', true),
};

test.before(async () => {
  await seedDoc('branches/costarica', { slug: 'costarica', name: 'CR' });
  await seedDoc('company_info/default', { name: 'KYG' });
  await seedDoc('catalog_public/p1', {
    id: 'p1',
    sku: 'SKU-1',
    name: 'Oso Test',
    status: 'active',
  });
  await seedDoc('products/p1', {
    id: 'p1',
    sku: 'SKU-1',
    name: 'Oso Test',
    status: 'active',
    prices: { unit: 5000, dozen: 4000, wholesale: 3000, basePrice: 3000 },
  });
  await seedDoc('price_lists/costarica_unit', {
    id: 'unit',
    name: 'Unidad',
    branchSlug: 'costarica',
    mode: 'manual',
    isActive: true,
    sortOrder: 1,
  });
  await seedDoc('price_lists/honduras_unit', {
    id: 'unit',
    name: 'Unidad HN',
    branchSlug: 'honduras',
    mode: 'manual',
    isActive: true,
    sortOrder: 1,
  });
  await seedDoc('clientes/uid-super', {
    id: 'uid-super',
    uid: 'uid-super',
    email: 'crestrepol.kyg@gmail.com',
    rol: 'superadmin',
    estado_acceso: 'aprobado',
    sucursal: 'costarica',
  });
  await seedDoc('clientes/uid-admin-cr', {
    id: 'uid-admin-cr',
    uid: 'uid-admin-cr',
    email: 'admincr@test.com',
    rol: 'admin',
    estado_acceso: 'aprobado',
    sucursal: 'costarica',
    assigned_branches: ['costarica'],
  });
  await seedDoc('clientes/uid-admin-hn', {
    id: 'uid-admin-hn',
    uid: 'uid-admin-hn',
    email: 'adminhn@test.com',
    rol: 'admin',
    estado_acceso: 'aprobado',
    sucursal: 'honduras',
    assigned_branches: ['honduras'],
  });
  await seedDoc('clientes/uid-seller-cr', {
    id: 'uid-seller-cr',
    uid: 'uid-seller-cr',
    email: 'vendedorcr@test.com',
    rol: 'vendedor',
    estado_acceso: 'aprobado',
    sucursal: 'costarica',
  });
  await seedDoc('clientes/uid-cli-ok', {
    id: 'uid-cli-ok',
    uid: 'uid-cli-ok',
    nombre: 'Cliente OK',
    email: 'cliok@test.com',
    rol: 'cliente',
    estado_acceso: 'aprobado',
    sucursal: 'costarica',
    allowedPriceLists: ['unit'],
    whiteLabelEnabled: false,
    subscriptionStatus: 'none',
    saldo: 0,
  });
  await seedDoc('clientes/uid-cli-hn', {
    id: 'uid-cli-hn',
    uid: 'uid-cli-hn',
    nombre: 'Cliente HN',
    email: 'clihn@test.com',
    rol: 'cliente',
    estado_acceso: 'aprobado',
    sucursal: 'honduras',
    allowedPriceLists: ['unit'],
  });
  await seedDoc('clientes/uid-cli-pend', {
    id: 'uid-cli-pend',
    uid: 'uid-cli-pend',
    nombre: 'Cliente Pendiente',
    email: 'clipend@test.com',
    rol: 'cliente',
    estado_acceso: 'pendiente',
    sucursal: 'costarica',
    allowedPriceLists: [],
    whiteLabelEnabled: false,
  });
  await seedDoc('pedidos/ord-cr-1', {
    id: 'ord-cr-1',
    cliente_id: 'uid-cli-ok',
    vendedor_id: 'uid-seller-cr',
    sucursal: 'costarica',
    total_factura: 5000,
  });
  await seedDoc('pedidos/ord-hn-1', {
    id: 'ord-hn-1',
    cliente_id: 'uid-cli-hn',
    sucursal: 'honduras',
    total_factura: 500,
  });
  await seedDoc('access_requests/req-1', {
    id: 'req-1',
    uid: 'uid-cli-pend',
    sucursal: 'costarica',
    estado: 'pendiente',
  });
  await seedDoc('metadatos/ord_count', { ultimo_numero: 1 });
});

test('Visitante anónimo lee catalog_public/branches/company_info y es bloqueado en todo lo privado', async () => {
  assert.equal((await req('GET', 'catalog_public/p1')).status, 200);
  assert.equal((await req('GET', 'branches/costarica')).status, 200);
  assert.equal((await req('GET', 'company_info/default')).status, 200);

  for (const privPath of [
    'products/p1',
    'price_lists/costarica_unit',
    'clientes/uid-cli-ok',
    'access_requests/req-1',
    'pedidos/ord-cr-1',
    'metadatos/ord_count',
  ]) {
    assert.equal((await req('GET', privPath)).status, 403, `Visitante no debe leer ${privPath}`);
  }
});

test('Anti-escalamiento de privilegios en auto-registro y auto-edición de clientes', async () => {
  // Ataques en create: aprobarse, asignarse rol superior, marca blanca o listas
  assert.equal(
    (
      await req('POST', 'clientes?documentId=uid-new-user', {
        token: TOKENS.newRegistrant,
        body: {
          uid: 'uid-new-user',
          rol: 'cliente',
          estado_acceso: 'aprobado',
          allowedPriceLists: [],
          whiteLabelEnabled: false,
        },
      })
    ).status,
    403
  );
  assert.equal(
    (
      await req('POST', 'clientes?documentId=uid-new-user', {
        token: TOKENS.newRegistrant,
        body: {
          uid: 'uid-new-user',
          rol: 'superadmin',
          estado_acceso: 'pendiente',
          allowedPriceLists: [],
          whiteLabelEnabled: false,
        },
      })
    ).status,
    403
  );
  assert.equal(
    (
      await req('POST', 'clientes?documentId=uid-new-user', {
        token: TOKENS.newRegistrant,
        body: {
          uid: 'uid-new-user',
          rol: 'cliente',
          estado_acceso: 'pendiente',
          allowedPriceLists: ['wholesale'],
          whiteLabelEnabled: true,
        },
      })
    ).status,
    403
  );

  // Registro válido en pendiente -> permitido
  assert.equal(
    (
      await req('POST', 'clientes?documentId=uid-new-user', {
        token: TOKENS.newRegistrant,
        body: {
          id: 'uid-new-user',
          uid: 'uid-new-user',
          nombre: 'Nuevo Seguro',
          rol: 'cliente',
          estado_acceso: 'pendiente',
          allowedPriceLists: [],
          whiteLabelEnabled: false,
          sucursal: 'costarica',
        },
      })
    ).status,
    200
  );

  // Cliente aprobado intenta auto-modificarse listas, rol o marca blanca -> 403
  for (const tamperField of [
    { allowedPriceLists: ['unit', 'wholesale'] },
    { rol: 'vendedor' },
    { whiteLabelEnabled: true },
    { saldo: 50000 },
  ]) {
    assert.equal(
      (
        await req('PATCH', 'clientes/uid-cli-ok', {
          token: TOKENS.approvedClient,
          body: {
            uid: 'uid-cli-ok',
            nombre: 'Cliente OK',
            rol: 'cliente',
            estado_acceso: 'aprobado',
            sucursal: 'costarica',
            allowedPriceLists: ['unit'],
            whiteLabelEnabled: false,
            subscriptionStatus: 'none',
            saldo: 0,
            ...tamperField,
          },
        })
      ).status,
      403
    );
  }

  // Cliente aprobado actualiza solo nombre/ciudad sin tocar campos protegidos -> 200
  assert.equal(
    (
      await req('PATCH', 'clientes/uid-cli-ok', {
        token: TOKENS.approvedClient,
        body: {
          uid: 'uid-cli-ok',
          nombre: 'Cliente Actualizado',
          ciudad: 'Heredia',
          rol: 'cliente',
          estado_acceso: 'aprobado',
          sucursal: 'costarica',
          allowedPriceLists: ['unit'],
          whiteLabelEnabled: false,
          subscriptionStatus: 'none',
          saldo: 0,
        },
      })
    ).status,
    200
  );
});

test('Pendiente vs Aprobado sobre products, price_lists y pedidos', async () => {
  assert.equal((await req('GET', 'products/p1', { token: TOKENS.pendingClient })).status, 403);
  assert.equal(
    (await req('GET', 'price_lists/costarica_unit', { token: TOKENS.pendingClient })).status,
    403
  );
  assert.equal(
    (
      await req('POST', 'pedidos?documentId=ord-pend', {
        token: TOKENS.pendingClient,
        body: { cliente_id: 'uid-cli-pend', sucursal: 'costarica', total_factura: 1000 },
      })
    ).status,
    403
  );

  assert.equal((await req('GET', 'products/p1', { token: TOKENS.approvedClient })).status, 200);
  assert.equal(
    (await req('GET', 'price_lists/costarica_unit', { token: TOKENS.approvedClient })).status,
    200
  );
  assert.equal(
    (
      await req('POST', 'pedidos?documentId=ord-cli-new', {
        token: TOKENS.approvedClient,
        body: { cliente_id: 'uid-cli-ok', sucursal: 'costarica', total_factura: 5000 },
      })
    ).status,
    200
  );
  assert.equal(
    (
      await req('PATCH', 'products/p1', {
        token: TOKENS.approvedClient,
        body: { id: 'p1', sku: 'SKU-1', name: 'Hack', status: 'active', prices: { unit: 1 } },
      })
    ).status,
    403
  );
});

test('Separación estricta Admin de Sede vs SuperAdmin y protección de catalog_public', async () => {
  // Admin CR puede aprobar y habilitar emprendedor en CR
  assert.equal(
    (
      await req('PATCH', 'clientes/uid-cli-pend', {
        token: TOKENS.adminCr,
        body: {
          uid: 'uid-cli-pend',
          nombre: 'Emprendedor CR',
          rol: 'emprendedor',
          estado_acceso: 'aprobado',
          sucursal: 'costarica',
          allowedPriceLists: ['unit'],
          whiteLabelEnabled: true,
        },
      })
    ).status,
    200
  );

  // Admin CR puede crear, actualizar y BORRAR lista de precios en CR
  assert.equal(
    (
      await req('POST', 'price_lists?documentId=costarica_vip', {
        token: TOKENS.adminCr,
        body: { id: 'vip', name: 'VIP', branchSlug: 'costarica', isActive: true, sortOrder: 4 },
      })
    ).status,
    200
  );
  assert.equal(
    (await req('DELETE', 'price_lists/costarica_vip', { token: TOKENS.adminCr })).status,
    200
  );

  // Admin CR NO puede escribir precios dentro de catalog_public
  assert.equal(
    (
      await req('POST', 'catalog_public?documentId=p-leak', {
        token: TOKENS.adminCr,
        body: { id: 'p-leak', sku: 'LEAK', prices: { unit: 999 } },
      })
    ).status,
    403
  );

  // Admin CR NO puede leer ni tocar sede Honduras, ni otro Admin, ni SuperAdmin, ni branches
  assert.equal((await req('GET', 'clientes/uid-cli-hn', { token: TOKENS.adminCr })).status, 403);
  assert.equal((await req('GET', 'pedidos/ord-hn-1', { token: TOKENS.adminCr })).status, 403);
  assert.equal((await req('DELETE', 'price_lists/honduras_unit', { token: TOKENS.adminCr })).status, 403);
  assert.equal(
    (
      await req('PATCH', 'clientes/uid-super', {
        token: TOKENS.adminCr,
        body: { rol: 'cliente', estado_acceso: 'suspendido', sucursal: 'costarica' },
      })
    ).status,
    403
  );
  assert.equal(
    (
      await req('PATCH', 'clientes/uid-admin-hn', {
        token: TOKENS.adminCr,
        body: { rol: 'cliente', sucursal: 'costarica' },
      })
    ).status,
    403
  );
  assert.equal(
    (
      await req('PATCH', 'clientes/uid-cli-ok', {
        token: TOKENS.adminCr,
        body: {
          uid: 'uid-cli-ok',
          rol: 'admin',
          estado_acceso: 'aprobado',
          sucursal: 'costarica',
        },
      })
    ).status,
    403
  );
  assert.equal(
    (
      await req('PATCH', 'branches/costarica', {
        token: TOKENS.adminCr,
        body: { slug: 'costarica', name: 'CR Hack' },
      })
    ).status,
    403
  );

  // SuperAdmin sí puede administrar branches y cualquier sede
  assert.equal(
    (
      await req('PATCH', 'branches/costarica', {
        token: TOKENS.superadmin,
        body: { slug: 'costarica', name: 'KYG CR' },
      })
    ).status,
    200
  );
});

test('Permisos acotados de Vendedor sobre clientes de su sede y pedidos', async () => {
  assert.equal((await req('GET', 'clientes/uid-cli-ok', { token: TOKENS.sellerCr })).status, 200);
  assert.equal((await req('GET', 'clientes/uid-cli-hn', { token: TOKENS.sellerCr })).status, 403);
  assert.equal((await req('GET', 'clientes/uid-super', { token: TOKENS.sellerCr })).status, 403);

  assert.equal(
    (
      await req('POST', 'pedidos?documentId=ord-seller-ok', {
        token: TOKENS.sellerCr,
        body: {
          cliente_id: 'uid-cli-ok',
          vendedor_id: 'uid-seller-cr',
          sucursal: 'costarica',
          total_factura: 9000,
        },
      })
    ).status,
    200
  );

  // Vendedor NO puede editar ni borrar pedidos existentes ni crear pedido bajo otro vendedor
  assert.equal(
    (
      await req('POST', 'pedidos?documentId=ord-seller-spoof', {
        token: TOKENS.sellerCr,
        body: {
          cliente_id: 'uid-cli-ok',
          vendedor_id: 'otro-vendedor',
          sucursal: 'costarica',
          total_factura: 9000,
        },
      })
    ).status,
    403
  );
  assert.equal(
    (await req('DELETE', 'pedidos/ord-cr-1', { token: TOKENS.sellerCr })).status,
    403
  );
});
