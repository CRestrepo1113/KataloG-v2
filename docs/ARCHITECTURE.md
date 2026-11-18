# Arquitectura Técnica — KataloG v2

## 1. Perfiles de Usuario y Estados de Acceso

KataloG v2 define **5 roles autenticados** (`UserRole`) más el estado de **Visitante sin registro**, gobernados por `estado_acceso`:

| Perfil / Estado | Acceso Catálogo | Listas de Precios | Carrito y Pedidos | Panel `/admin` | Características Clave |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Visitante (Sin registro)** | `catalog_public` (sin precios) | Ninguna | Bloqueado | No | Aviso claro para registrarse y esperar contacto de ventas |
| **Pendiente (`pendiente`)** | `catalog_public` (sin precios) | Ninguna | Bloqueado | No | Banner *"Solicitud en revisión"* + botón directo a WhatsApp ventas |
| **Rechazado / Suspendido** | `catalog_public` (sin precios) | Ninguna | Bloqueado | No | Aviso de acceso restringido + contacto a ventas |
| **Cliente (`cliente`, `aprobado`)** | `products` | Solo `allowedPriceLists` | Sí (con mínimos por lista) | No | Puede solicitar ampliación de listas o paso a Emprendedor |
| **Emprendedor (`emprendedor`, `aprobado`)** | `products` | Solo `allowedPriceLists` | Sí (en Vista KYG) | No | Si `whiteLabelEnabled`: alterna a *Modo Cliente Sin Marca*, configura margen `%`/overrides, exporta PDF catálogo sin marca y descarga doble PDF por pedido (KYG costo + Cliente sin marca) |
| **Vendedor (`vendedor`, `aprobado`)** | `products` | Todas las listas activas | Sí (**exento de mínimos**) | No | En checkout asigna cliente visitado (buscador de sucursal o manual) y queda trazabilidad en `vendedor_id` |
| **Admin (`admin`, `aprobado`)** | `products` | Todas las listas activas | Sí (**exento de mínimos**) | Sucursales asignadas (**sin Finanzas**) | Aprueba solicitudes, clasifica roles (`Cliente`, `Emprendedor`, `Vendedor`), gestiona inventario, listas y pedidos |
| **SuperAdmin (`superadmin`)** | `products` | Todas las listas activas | Sí (**exento de mínimos**) | Total (incluye **Finanzas**, Sucursales y Roles Admin) | Control global absoluto del sistema |

---

## 2. Sincronización Dual (`products` ↔ `catalog_public`)

Para garantizar que visitantes y usuarios `pendiente` nunca reciban precios por red:
1. Cada escritura administrativa sobre inventario (`saveProduct`, `bulkSaveProducts`, `updateProductStatus`, `deleteProduct`, `bulkDeleteProducts`, `bulkUpdateStatus`, `bulkAssignBranch`) escribe simultáneamente en:
   - `products/{id}`: documento maestro completo (con `prices` y `branchOverrides`).
   - `catalog_public/{id}`: proyección saneada generada por `toPublicProductProjection()`, sin `prices` ni `originalImageUrl`.
2. `TenantCatalogClient` decide al resolver sesión:
   - Si no hay sesión o `estado_acceso !== 'aprobado'` → lee únicamente `catalog_public`.
   - Si `estado_acceso === 'aprobado'` → lee `products` y `price_lists`.

---

## 3. Motor Híbrido de Listas de Precios (`lib/pricing.ts`)

* **Compatibilidad con v1 y KYG Gestión:** Las tres listas base (`unit`, `dozen`, `wholesale`) conservan sus valores numéricos exactos por producto y en `Customer.lista_precio`.
* **Precio Base + Listas Dinámicas (`price_lists`):**
  * Cada lista define `mode: 'manual' | 'base_percent'`.
  * En modo `base_percent`, calcula el precio desde `product.prices.basePrice` (respaldo: `wholesale` o `unit`) aplicando `markup` (`+ %`) o `discount` (`- %`) y redondeo al múltiplo comercial `roundingStep`.
  * Si un producto tiene excepción manual en `prices.customLists[listId]`, el override manual siempre tiene prioridad.
* **Mínimos configurables:** Cada `PriceList` admite `minUnits` y/o `minOrderAmount` opcionales. `validateCartMinimums()` exige su cumplimiento a `cliente` y `emprendedor`, eximiendo a `vendedor`, `admin` y `superadmin`.

---

## 4. Modo Marca Blanca (Emprendedor B2B2C)

Pensado para futura comercialización por suscripción (`subscriptionStatus: 'none' | 'trial' | 'active' | 'expired'`):
* En **Vista Compra KYG**: opera con sus costos habilitados y envía órdenes reales a KYG.
* En **Modo Cliente (Sin Marca)**:
  * Oculta toda referencia visual o enlace a KYG (logo, nombre, teléfono, dirección, redes, pie de página, gesto admin).
  * Sustituye los precios de costo por `resolveResellerPrice(costPrice, product, resellerConfig)`.
  * Bloquea el envío del carrito hacia el WhatsApp de KYG; permite generar cotización/comprobante sin marca para el cliente final.
  * Desde `Mis Pedidos`, genera dos documentos PDF diferenciados por orden: comprobante oficial KYG (costo) y comprobante sin marca para el cliente final (precio de reventa).

---

## 5. Exportación Estática (`output: 'export'`)

`next.config.ts` mantiene `output: 'export'`. Toda nueva vista o herramienta se integra mediante componentes cliente o rutas estáticas existentes (`/v/[tenant]/` y `/admin/inventory/`), sin requerir servidor SSR ni rutas dinámicas no pre-generables.
