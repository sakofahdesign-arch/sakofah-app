export const OFFSITE_PHOTO_MAX_WIDTH = 960;
export const OFFSITE_PHOTO_QUALITY = 0.68;

export function fitImageDimensions(srcW: number, srcH: number, maxWidth = OFFSITE_PHOTO_MAX_WIDTH) {
  if (!srcW || !srcH) return { width: maxWidth, height: Math.round(maxWidth * 0.75) };
  if (srcW <= maxWidth) return { width: srcW, height: srcH };
  return { width: maxWidth, height: Math.round((srcH / srcW) * maxWidth) };
}
