// Bug coordinates and tolerance radius are stored as fractions of the ORIGINAL
// image's natural width/height, not raw pixels or screen fractions. This keeps
// the tolerance a true circle in the source image regardless of what size the
// image was captured/uploaded at or how it's displayed on a student's phone.
// Radius is stored as a fraction of image width; we convert both axes to a
// common pixel space (using the image's real width/height) before comparing,
// so the check is a true circle even when the image isn't square.
export function isTapInsideBug(tapXFrac, tapYFrac, bug, imgWidth, imgHeight) {
  const dx = (tapXFrac - bug.x) * imgWidth;
  const dy = (tapYFrac - bug.y) * imgHeight;
  const rPixel = bug.r * imgWidth;
  return Math.sqrt(dx * dx + dy * dy) <= rPixel;
}
