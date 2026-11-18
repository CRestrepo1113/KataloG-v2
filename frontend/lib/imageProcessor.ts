import { BRAND_COLORS } from './theme';

/**
 * Standardizes any image URL or Blob into a crisp 600x600 WebP data URL.
 */
export function standardizeWebP(sourceUrlOrFile: string | Blob, size = 600): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = typeof sourceUrlOrFile === 'string' ? sourceUrlOrFile : URL.createObjectURL(sourceUrlOrFile);
    img.src = url;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.clearRect(0, 0, size, size);
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (size - w) / 2;
        const y = (size - h) / 2;

        ctx.drawImage(img, x, y, w, h);
        resolve(canvas.toDataURL('image/webp', 0.90));
      } else {
        resolve(img.src);
      }
    };
    img.onerror = () => resolve(typeof sourceUrlOrFile === 'string' ? sourceUrlOrFile : '');
  });
}

/**
 * Removes background using @imgly/background-removal directly in the browser (WebAssembly).
 */
export async function removeBackgroundBrowser(
  sourceUrl: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (typeof window !== 'undefined') {
    const g = window as unknown as { ort?: { env?: { wasm?: { numThreads?: number } } } };
    g.ort = g.ort || {};
    g.ort.env = g.ort.env || {};
    g.ort.env.wasm = g.ort.env.wasm || {};
    g.ort.env.wasm.numThreads = 1;
  }

  const { removeBackground } = await import('@imgly/background-removal');
  const blob = await removeBackground(sourceUrl, {
    progress: (_key, current, total) => {
      if (total > 0 && onProgress) {
        const pct = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
        onProgress(pct);
      }
    },
  });

  const transparentUrl = URL.createObjectURL(blob);
  return await standardizeWebP(transparentUrl, 600);
}

/**
 * Composites a centered subject onto a harmonious brand pastel studio backdrop with lighting boost.
 */
export function applyStudioPastelBrowser(sourceUrlOrFile: string | Blob): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = typeof sourceUrlOrFile === 'string' ? sourceUrlOrFile : URL.createObjectURL(sourceUrlOrFile);
    img.src = url;
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = BRAND_COLORS.cardBg.hex;
        ctx.fillRect(0, 0, 600, 600);

        // Mantener escala 100% original sin añadir recuadros ni márgenes internos
        const scale = Math.min(600 / img.width, 600 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (600 - w) / 2;
        const y = (600 - h) / 2;

        ctx.drawImage(img, x, y, w, h);

        resolve(canvas.toDataURL('image/webp', 0.90));
      } else {
        resolve(img.src);
      }
    };
    img.onerror = () => resolve(typeof sourceUrlOrFile === 'string' ? sourceUrlOrFile : '');
  });
}
