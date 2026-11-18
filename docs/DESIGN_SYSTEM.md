# Estándar de Diseño, Estética y Microcopy — KataloG v2

## 1. Principio Rector
KataloG v2 debe proyectar una imagen **minimalista, elegante, limpia y profesional**, evitando ruido visual, textos largos, botones verbosos o componentes duplicados.

---

## 2. Paleta de Colores Oficial (Basada en el Logotipo)

Toda interfaz debe usar exclusivamente la familia cromática derivada del logotipo corporativo y neutros `slate`:

| Rol Visual | Token / Hex | Uso Permitido |
| :--- | :--- | :--- |
| **Primario Corporativo** | `#3C5866` | Cabeceras, botones principales, texto de marca, estado activo principal |
| **Primario Oscuro** | `#263842` | Hover de botones primarios, títulos de alta jerarquía |
| **Acento Caramelo** | `#C37D41` | Iconos de acento, categorías, precios destacados, badges de acción |
| **Acento Crema / Suave** | `#FFF3CD` | Fondos de botones secundarios destacados, texto suave sobre `#3C5866` |
| **Superficie Pastel Producto** | `#B9E0FD` (borde `#93D0FC`) | Fondo unificado de tarjetas de peluche/producto |
| **Superficie General** | `#F8FAFC` / `#FFFFFF` | Fondo de página y contenedores elevados |
| **Semánticos** | `emerald-600/50`, `amber-500/50`, `rose-600/50`, `sky-600/50` | Únicamente para estados (`Aprobado`, `Pendiente`, `Rechazado/Error`, `Proceso`) |

**Prohibición:** No introducir gradientes llamativos ni colores fuera de esta paleta en componentes comerciales o administrativos.

---

## 3. Reglas Estrictas de Texto (Microcopy)

1. **Encabezados breves (`2 a 4` palabras):**
   - ✅ Correcto: `Listas de Precios`, `Solicitudes Pendientes`, `Modo Cliente`, `Acceso al Catálogo`.
   - ❌ Incorrecto: `Configuración Avanzada de Tarifas y Listas Personalizadas para tus Clientes`.
2. **Botones ultra concisos (`1 a 3` palabras):**
   - ✅ Correcto: `Registrarme`, `Aprobar`, `Guardar`, `Agregar`, `Modo Cliente`, `Exportar PDF`.
   - ❌ Incorrecto: `Haz clic aquí para enviar tu solicitud de registro a ventas`.
3. **Política de Cero Subtextos Innecesarios:**
   - **No** colocar párrafos descriptivos debajo de cada título, cada input ni cada tarjeta.
   - Los subtextos se reservan **exclusivamente** para aclaraciones operativas indispensables:
     - Aviso al visitante sin registro: *"Regístrate y espera el contacto de ventas para ver precios."*
     - Aviso en cuenta `Pendiente`: *"Solicitud en revisión. Ventas te contactará pronto."*
     - Regla activa de mínimo en carrito: *"Faltan 4 unidades para habilitar la tarifa Docena."*
4. **Etiquetas de formularios:** Máximo 3 palabras en mayúscula sutil (`Nombre Completo *`, `WhatsApp *`, `Lista Base`).

---

## 4. Responsividad, Lógica y Cero Redundancia

* **Mobile-First real (`360px` a `1536px+`):**
  * Ninguna tabla, modal o barra de filtros puede generar desbordamiento horizontal involuntario de página.
  * Todos los modales en móvil deben usar `max-h-[90dvh]` con cuerpo scrollable interno y cabecera/pie fijos, soportando el botón "Atrás" mediante `useModalHistory`.
  * Todo botón interactivo debe mantener un área táctil cómoda (`>= 38px` de altura) y `cursor-pointer`.
* **Cero elementos redundantes:**
  * Si un usuario solo tiene **1 lista de precios** habilitada, **no** mostrar selector de tarifas; mostrar un indicador limpio de su tarifa asignada.
  * Si un usuario **no** tiene acceso a precios ni carrito, ocultar por completo controles inactivos como `Carrito`, `Ordenar por Precio` y `Exportar PDF` (en lugar de mostrar botones deshabilitados que frustran al usuario).
  * No duplicar alertas ni validaciones en pantalla.
* **Modo Marca Blanca (Emprendedor):**
  * Cuando `whiteLabelMode === true`, debe desaparecer el 100% de la identidad de KYG (logo, nombre comercial, slogan, teléfonos, redes, footer, acceso oculto de 5 toques al admin y marcas en PDF).

---

## 5. Jerarquía Visual y Espaciado

* Radios consistentes: `rounded-xl` (inputs/botones compactos), `rounded-2xl` (paneles/botones principales), `rounded-3xl` (tarjetas de producto y modales).
* Sombras sutiles (`shadow-xs` / `shadow-sm`) y bordes limpios (`border-slate-200/80`) en lugar de sombras pesadas.
* Iconografía uniforme de `lucide-react` (`w-4 h-4` en botones/inputs, `w-3.5 h-3.5` en badges).
