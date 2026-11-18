import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  transformProductForV2,
  buildPublicCatalogDoc,
  validateNoPricesInPublicDoc,
  buildDefaultPriceListsForBranches,
  assertV1IsNotV2,
} from '../../scripts/migrate_v1_to_v2.mjs';

test('migrate_v1_to_v2 transforma productos v1 y garantiza catalog_public sin precios', () => {
  const v2Prod = transformProductForV2('doc-1', {
    sku: 'OSO-V1',
    name: 'Oso Clasico',
    category: 'Osos',
    stock: 20,
    prices: { unit: 10000, dozen: 7500, wholesale: 6000 },
    branchOverrides: {
      honduras: {
        stock: 5,
        prices: { unit: 500, dozen: 400, wholesale: 320 },
      },
    },
  });

  assert.equal(v2Prod.prices.basePrice, 6000);
  assert.equal(v2Prod.prices.unit, 10000);
  assert.equal(v2Prod.branchOverrides.honduras.prices.basePrice, 320);

  const pubDoc = buildPublicCatalogDoc(v2Prod);
  assert.equal('prices' in pubDoc, false);
  assert.equal('prices' in (pubDoc.branchOverrides?.honduras || {}), false);
  assert.equal(pubDoc.branchOverrides.honduras.stock, 5);

  assert.throws(() => {
    validateNoPricesInPublicDoc({ id: 'bad', prices: { unit: 100 } });
  }, /Violación de privacidad/);

  const lists = buildDefaultPriceListsForBranches([{ slug: 'costarica' }, { slug: 'honduras' }]);
  assert.equal(lists.length, 6);

  assert.throws(() => {
    assertV1IsNotV2({ projectId: 'same-id' }, { projectId: 'same-id' });
  }, /Abortando/);
});

test('CLI migrate_v1_to_v2.mjs --dry-run --from-json ejecuta extremo a extremo sin escribir en BD', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'katalog-migrate-test-'));
  const snapshotFile = path.join(tmpDir, 'snapshot.json');
  try {
    fs.writeFileSync(
      snapshotFile,
      JSON.stringify({
        branches: [{ id: 'costarica', data: { slug: 'costarica', name: 'KYG CR' } }],
        company_info: [{ id: 'default', data: { name: 'KYG' } }],
        products: [
          {
            id: 'p1',
            data: {
              sku: 'SKU-1',
              name: 'Peluche Test',
              category: 'Osos',
              stock: 10,
              prices: { unit: 8000, dozen: 6000, wholesale: 5000 },
            },
          },
        ],
      })
    );

    const scriptPath = path.resolve(process.cwd(), 'scripts/migrate_v1_to_v2.mjs');
    const stdout = execFileSync(process.execPath, [scriptPath, '--from-json', snapshotFile, '--dry-run'], {
      encoding: 'utf8',
    });

    assert.match(stdout, /catalog_public:\s*1 \(validados: 0 campos de precio\)/);
    assert.match(stdout, /\[DRY-RUN\] No se realizaron escrituras/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
