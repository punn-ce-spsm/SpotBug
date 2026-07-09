// Code screenshots are mostly flat-color text, so PNG stays small after
// resizing — no need for lossy JPEG compression that would blur text.
const MAX_DIMENSION = 1600;

function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image file.'));
    img.src = src;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

// Downscales large uploads and returns { dataUrl, width, height } where
// width/height are the FINAL (post-resize) pixel dimensions — these are the
// dimensions bug coordinates/tolerance are measured against, on server and client alike.
export async function processImageFile(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  const originalDataUrl = await readFileAsDataUrl(file);
  const img = await loadHtmlImage(originalDataUrl);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);

  if (scale === 1) {
    return { dataUrl: originalDataUrl, width, height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}

export function approxDataUrlBytes(dataUrl) {
  // base64 encodes 3 bytes as 4 chars
  return Math.round((dataUrl.length * 3) / 4);
}
