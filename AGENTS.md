# KataloG v2 — Reglas de Desarrollo y Gobernanza

Este documento rige cualquier cambio, módulo o corrección en **KataloG v2**. Antes de escribir código o modificar la interfaz, consulta y respeta de forma estricta los tres estándares rectores:

1. **[Estándar de Diseño y Microcopy](docs/DESIGN_SYSTEM.md):** Estética minimalista y elegante, paleta única basada en el logotipo de KYG, encabezados y botones breves, cero subtextos innecesarios, responsividad total y eliminación de elementos redundantes.
2. **[Protocolo de Seguridad y Privacidad](docs/SECURITY_PROTOCOL.md):** Principio de mínimo privilegio en Firestore, separación real entre `catalog_public` (sin precios) y colecciones protegidas (`products`, `price_lists`, `clientes`, `access_requests`, `pedidos`), bloqueo de auto-escalación de privilegios y verificación obligatoria de `firestore.rules`.
3. **[Arquitectura de KataloG v2](docs/ARCHITECTURE.md):** Modelo de 5 perfiles autenticados + visitante sin registro, estado `pendiente`, motor híbrido de listas de precios (`Precio Base` + listas dinámicas + overrides), modo Marca Blanca para Emprendedores y compatibilidad con `output: 'export'` y **KYG Gestión**.

## Reglas Operativas Innegociables

* **Aislamiento de v1:** Este repositorio pertenece exclusivamente a **KataloG v2**. Nunca apuntar `.firebaserc`, `.env.local` ni scripts de escritura hacia el proyecto heredado `katalog-277ca`.
* **Cero llaves secretas o hardcodeadas de producción:** Toda configuración de Firebase del cliente debe resolverse mediante variables `NEXT_PUBLIC_FIREBASE_*`.
* **Control de calidad antes de cerrar cualquier tarea:**
  1. Ejecutar pruebas unitarias del motor de precios, permisos y proyecciones públicas.
  2. Ejecutar `npx tsc --noEmit` y `npm run lint`.
  3. Ejecutar `npm run build` validando la generación estática (`output: 'export'`).
  4. Revisar explícitamente que `catalog_public` no contenga precios y que `firestore.rules` no use `allow read, write: if true`.
