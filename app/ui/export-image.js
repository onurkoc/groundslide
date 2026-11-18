// PNG of the graphic export (SPEC_ETAPPE2 8.4): the standalone SVG is drawn through an image onto a canvas, white ground,
// edge length in pixels = scale times the size of the SVG (the sketch on the screen), so the lines stay sharp.

/** svgText: the SVG; width, height: its size in pixels; scale: factor. Returns a promise of the PNG Blob. */
export function svgToPngBlob(svgText, width, height, scale) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas: no PNG'))), 'image/png');
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('the SVG could not be loaded as an image'));
    };
    image.src = url;
  });
}
