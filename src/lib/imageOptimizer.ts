/**
 * PineVela Lightweight Image Optimization Utility
 * Reduces image memory, payload, and GPU overhead for smooth 60fps scrolling
 * on low-end devices and mobile browsers.
 */

/**
 * Compresses and scales down any user image file from device to low-resolution thumbnail
 * Max dimensions: 360x360 px, Quality: 0.55 JPEG
 * Resulting size: ~15KB - 30KB (vs 5MB - 10MB raw)
 */
export async function compressImageFileToLowRes(
  file: File,
  maxDimension = 360,
  quality = 0.55
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          try {
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;

            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
              } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = Math.max(width, 1);
            canvas.height = Math.max(height, 1);

            const ctx = canvas.getContext('2d', { alpha: false });
            if (!ctx) {
              // Fallback to original if 2D context fails
              resolve(event.target?.result as string);
              return;
            }

            // High performance low-overhead rendering
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'medium';
            ctx.fillStyle = '#f1f5f9';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedBase64);
          } catch (e) {
            console.warn('Canvas image compression failed, using fallback:', e);
            resolve(event.target?.result as string);
          }
        };

        img.onerror = () => {
          resolve(event.target?.result as string);
        };

        img.src = event.target?.result as string;
      };

      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Optimizes external URLs (such as Unsplash CDN images) to lowest practical resolution
 * and low quality for instant rendering and smooth scrolling.
 */
export function optimizeImageDisplayUrl(url: string | null | undefined, width = 280, quality = 40): string {
  if (!url || typeof url !== 'string' || !url.trim()) {
    // Ultra-lightweight inline SVG placeholder
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" fill="%23f1f5f9"><rect width="200" height="200" fill="%23f1f5f9"/><circle cx="100" cy="100" r="28" fill="%23cbd5e1"/></svg>`;
  }

  const trimmed = url.trim();

  // If Unsplash URL, replace width and quality params with low-res equivalents
  if (trimmed.includes('images.unsplash.com')) {
    try {
      const urlObj = new URL(trimmed);
      urlObj.searchParams.set('w', String(width));
      urlObj.searchParams.set('q', String(quality));
      urlObj.searchParams.set('auto', 'format');
      urlObj.searchParams.set('fit', 'crop');
      return urlObj.toString();
    } catch (err) {
      // If parsing fails, append or return
      return `${trimmed.split('?')[0]}?w=${width}&q=${quality}&auto=format&fit=crop`;
    }
  }

  return trimmed;
}
