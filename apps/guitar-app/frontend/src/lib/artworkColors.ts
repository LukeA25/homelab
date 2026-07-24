export type Hsl = { h: number; s: number; l: number };

export type ArtworkPalette = {
  dominant: Hsl;
  secondary: Hsl;
};

function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }
  return { h: h * 360, s, l };
}

type Bucket = { weight: number; r: number; g: number; b: number };

/**
 * Sample album art and return a dominant + secondary color.
 * Falls back to null if the image can't be read (CORS / load error).
 */
export function extractArtworkPalette(url: string): Promise<ArtworkPalette | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const buckets = new Map<number, Bucket>();

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          const a = data[i + 3]!;
          if (a < 200) continue;

          const { h, s, l } = rgbToHsl(r, g, b);
          // Skip near-black / near-white — they wash out the palette
          if (l < 0.07 || l > 0.93) continue;
          if (s < 0.06 && (l < 0.2 || l > 0.8)) continue;

          const weight = 0.35 + s * 0.9 + (1 - Math.abs(l - 0.42)) * 0.35;
          const key = Math.round(h / 12) * 12 % 360;
          const existing = buckets.get(key);
          if (existing) {
            existing.weight += weight;
            existing.r += r * weight;
            existing.g += g * weight;
            existing.b += b * weight;
          } else {
            buckets.set(key, { weight, r: r * weight, g: g * weight, b: b * weight });
          }
        }

        const ranked = [...buckets.values()].sort((a, b) => b.weight - a.weight);
        if (ranked.length === 0) {
          resolve(null);
          return;
        }

        const toHsl = (bucket: Bucket): Hsl =>
          rgbToHsl(bucket.r / bucket.weight, bucket.g / bucket.weight, bucket.b / bucket.weight);

        const dominant = toHsl(ranked[0]!);
        let secondary = ranked.length > 1 ? toHsl(ranked[1]!) : {
          h: (dominant.h + 28) % 360,
          s: Math.min(1, dominant.s * 0.85),
          l: Math.max(0.15, dominant.l * 0.75),
        };

        // Prefer a secondary that isn't nearly the same hue
        for (let i = 1; i < ranked.length; i++) {
          const candidate = toHsl(ranked[i]!);
          const dh = Math.min(
            Math.abs(candidate.h - dominant.h),
            360 - Math.abs(candidate.h - dominant.h),
          );
          if (dh >= 18) {
            secondary = candidate;
            break;
          }
        }

        resolve({ dominant, secondary });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function paletteFromHue(hue: number): ArtworkPalette {
  return {
    dominant: { h: hue, s: 0.55, l: 0.42 },
    secondary: { h: (hue + 28) % 360, s: 0.5, l: 0.38 },
  };
}
