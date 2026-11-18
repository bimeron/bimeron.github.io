// Wraps a PNG into a single-image ICO file. Browsers ask for /favicon.ico even when the page
// declares a PNG icon, and every current browser accepts PNG data inside ICO.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param {Buffer} png
 * @returns {Buffer}
 */
export function pngToIco(png) {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG file');
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width > 256 || height > 256) throw new Error(`Icon is too large: ${width}x${height}`);

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const entry = Buffer.alloc(16);
  entry.writeUInt8(width === 256 ? 0 : width, 0);
  entry.writeUInt8(height === 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2); // palette size
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
}
