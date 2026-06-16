// image.js — shared client-side image helper.
// Normalizes any picked photo (including iOS HEIC, which Safari can decode) to a
// downscaled JPEG data URL — keeps uploads small/fast and in a format Claude
// vision accepts. Used by Dining Out (menu/wine-list) and Snap a label.
export function fileToJpegDataUrl(file, maxDim = 2000, quality = 0.88){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}
