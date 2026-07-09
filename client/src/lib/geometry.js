// Converts a pointer/click event into a fraction (0-1) of the rendered image.
// Assumes the image element is laid out at its natural aspect ratio (width:
// 100%, height: auto) so its bounding rect IS the visible image with no
// object-fit letterboxing to account for.
export function eventToImageFraction(event, imgEl) {
  const rect = imgEl.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}
