# Protocolo de Seguridad y Privacidad — KataloG v2

## 1. Principios de Seguridad Obligatorios

KataloG v2 opera con arquitectura estática (`output: 'export'`) conectada directamente a Firebase Authentication y Cloud Firestore. Por ello, **toda regla de autorización debe aplicarse en `firestore.rules`**, nunca confiando únicamente en ocultar componentes de React.

---

## 2. Matriz de Protección de Datos en Firestore

| Colección | Lectura Pública | Lectura Autenticada | Escritura | Datos Sensibles Permitidos |
| :--- | :--- | :--- | :--- | :--- |
| `catalog_public` | ✅ Sí (`true`) | ✅ Sí | Solo `admin` / `superadmin` | SKU, nombre, categoría, medida, stock, estado, `processedImageUrl`. **PROHIBIDO guardar precios.** |
| `branches`, `company_info` | ✅ Sí (`true`) | ✅ Sí | Solo `superadmin` | Datos públicos de sucursal y branding. |
| `products` | ❌ No | Solo usuarios con `estado_acceso == 'aprobado'` o `admin`/`superadmin` | Solo `admin` / `superadmin` | Precios (`basePrice`, `unit`, `dozen`, `wholesale`, `customLists`) y `branchOverrides`. |
| `price_lists` | ❌ No | Solo usuarios con `estado_acceso == 'aprobado'` o `admin`/`superadmin` | Solo `admin` / `superadmin` | Reglas de listas dinámicas, porcentajes y mínimos. |
| `clientes` | ❌ No | Propio doc (`uid`), `vendedor` (solo clientes de su sucursal), `admin` (sus sucursales), `superadmin` | Auto-creación restringida; cambios de rol/listas/estado solo `admin` o `superadmin` | Datos CRM, teléfono, rol, estado, listas habilitadas. |
| `access_requests` | ❌ No | Propia solicitud (`uid`) o `admin`/`superadmin` de la sucursal | Creación por el propio `uid` en `estado == 'pendiente'`; actualización solo `admin`/`superadmin` | Datos de solicitud de acceso. |
| `pedidos` | ❌ No | Propio pedido (`cliente_id == uid` o `vendedor_id == uid`) o `admin`/`superadmin` | Creación por usuario `aprobado`; edición/borrado solo `admin`/`superadmin` | Detalles comerciales, totales, abonos, saldos. |
| `metadatos` | ❌ No | Solo `aprobado` o `admin`/`superadmin` | Contadores atómicos por `aprobado`/`admin` | Contadores de folios. |

---

## 3. Reglas Anti-Escalamiento de Privilegios

1. **Registro desde el Catálogo Público:**
   - Todo documento nuevo creado por un usuario en `clientes/{uid}` debe cumplir obligatoriamente en `firestore.rules`:
     - `request.resource.data.rol == 'cliente'` (el perfil deseado se guarda en `perfil_solicitado` dentro de `['cliente', 'emprendedor']`).
     - `request.resource.data.estado_acceso == 'pendiente'`.
     - `request.resource.data.whiteLabelEnabled == false`.
     - `request.resource.data.allowedPriceLists.size() == 0`.
2. **Auto-actualización de Perfil:**
   - Un usuario autenticado que actualiza su propio documento en `clientes/{uid}` tiene **prohibido** modificar los campos: `rol`, `estado_acceso`, `allowedPriceLists`, `defaultPriceList`, `whiteLabelEnabled`, `subscriptionStatus`, `assigned_branches`, `saldo`.
3. **Separación Admin vs. SuperAdmin:**
   - Un `Admin` de sede **no puede** crear, modificar ni eliminar cuentas `superadmin` o `admin`, ni asignarse sucursales nuevas, ni acceder a la pestaña/lógica financiera.
   - Todo `Admin` de sede solo lee/edita clientes, solicitudes y pedidos pertenecientes a sus sucursales autorizadas (`assigned_branches` o `sucursal`).
4. **Higiene de Caché Local (`localStorage` / IndexedDB):**
   - Al cerrar sesión o detectar que un usuario no está `aprobado`, el cliente **debe purgar inmediatamente** las claves locales de inventario con precios (`katalog_products_db`, `katalog_price_lists_db`) y cualquier carrito cacheado no autorizado.

---

## 4. Seguridad de Código, Exportaciones y Entorno

* **Cero credenciales hardcodeadas:** `lib/firebase.ts` no debe contener valores de respaldo de otro proyecto. Si faltan variables `NEXT_PUBLIC_FIREBASE_*`, Firebase debe permanecer desactivado de forma segura sin conectarse a entornos ajenos.
* **Protección de Exportaciones:** Todo campo de texto exportado a Excel debe pasar por `sanitizeExcelText()` contra inyección de fórmulas (`=`, `+`, `-`, `@`, `\t`, `\r`).
* **Validación de Entradas:** Precios, porcentajes y cantidades deben validarse como números finitos no negativos antes de calcular totales o guardar en Firestore.
* **Comprobación Pre-Despliegue:** Ninguna versión se considera lista sin:
  1. Verificación de `firestore.rules` (tests de reglas o auditoría línea por línea).
  2. Test unitario que confirme que `toPublicProductProjection()` elimina el 100% de precios.
  3. Compilación limpia (`tsc --noEmit`, `eslint`, `next build`).
