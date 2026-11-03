// ---------------------------------------------------------------------------
// A minimal ZIP writer ("store" method: files are put in uncompressed).
//
// Used to bundle the pages of a multi-page image export into ONE download: a
// page that is already a PNG or JPG is compressed, so deflating it again would
// gain nothing, and "store" needs no dependency (the npm registry is not
// reachable from this project's build environment anyway). Browsers also ask
// the user for permission before saving many files in a row; a single ZIP is
// one download.
//
// Format (PKWARE APPNOTE 6.3): for every file a local header + the bytes, then
// a central directory with one record per file, then the end-of-central-
// directory record. File names are UTF-8 (general-purpose flag bit 11).
// Limits of the classic format apply: at most 65535 files, each and the whole
// archive under 4 GiB — createZip() throws instead of writing a broken file.
// ---------------------------------------------------------------------------

export interface ZipEntry {
  /** Path inside the archive, with "/" as separator. */
  name: string;
  data: Uint8Array;
}

const textEncoder = new TextEncoder();

let crcTable: Uint32Array | null = null;
function table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

/** CRC-32 (the checksum ZIP uses) of a byte array. */
export function crc32(bytes: Uint8Array): number {
  const t = table();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date and time words (the only timestamp format ZIP has). */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const MAX_U32 = 0xffffffff;

/**
 * Builds a ZIP archive from the given files, in order. Pass `now` to fix the
 * timestamp (tests); by default it is the current time.
 */
export function createZip(entries: readonly ZipEntry[], now: Date = new Date()): Uint8Array {
  if (entries.length > 0xffff) throw new Error("Terlalu banyak berkas untuk satu ZIP (maksimum 65.535).");
  const stamp = dosDateTime(now);

  const names = entries.map((entry) => textEncoder.encode(entry.name));
  const checksums = entries.map((entry) => crc32(entry.data));

  // Sizes first, so the output is allocated once.
  let localSize = 0;
  let centralSize = 0;
  entries.forEach((entry, i) => {
    localSize += 30 + names[i].length + entry.data.length;
    centralSize += 46 + names[i].length;
  });
  const total = localSize + centralSize + 22;
  if (total > MAX_U32) throw new Error("Hasil ekspor melebihi 4 GB; turunkan resolusi atau ekspor per halaman.");

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let pos = 0;
  const offsets: number[] = [];

  entries.forEach((entry, i) => {
    offsets.push(pos);
    view.setUint32(pos, 0x04034b50, true); // local file header signature
    view.setUint16(pos + 4, 20, true); // version needed to extract
    view.setUint16(pos + 6, 0x0800, true); // flags: UTF-8 file name
    view.setUint16(pos + 8, 0, true); // method 0 = stored
    view.setUint16(pos + 10, stamp.time, true);
    view.setUint16(pos + 12, stamp.date, true);
    view.setUint32(pos + 14, checksums[i], true);
    view.setUint32(pos + 18, entry.data.length, true); // compressed size
    view.setUint32(pos + 22, entry.data.length, true); // uncompressed size
    view.setUint16(pos + 26, names[i].length, true);
    view.setUint16(pos + 28, 0, true); // extra field length
    out.set(names[i], pos + 30);
    out.set(entry.data, pos + 30 + names[i].length);
    pos += 30 + names[i].length + entry.data.length;
  });

  const centralStart = pos;
  entries.forEach((entry, i) => {
    view.setUint32(pos, 0x02014b50, true); // central directory header signature
    view.setUint16(pos + 4, 20, true); // version made by
    view.setUint16(pos + 6, 20, true); // version needed
    view.setUint16(pos + 8, 0x0800, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, stamp.time, true);
    view.setUint16(pos + 14, stamp.date, true);
    view.setUint32(pos + 16, checksums[i], true);
    view.setUint32(pos + 20, entry.data.length, true);
    view.setUint32(pos + 24, entry.data.length, true);
    view.setUint16(pos + 28, names[i].length, true);
    view.setUint16(pos + 30, 0, true); // extra field length
    view.setUint16(pos + 32, 0, true); // comment length
    view.setUint16(pos + 34, 0, true); // disk number start
    view.setUint16(pos + 36, 0, true); // internal attributes
    view.setUint32(pos + 38, 0, true); // external attributes
    view.setUint32(pos + 42, offsets[i], true); // offset of the local header
    out.set(names[i], pos + 46);
    pos += 46 + names[i].length;
  });

  view.setUint32(pos, 0x06054b50, true); // end of central directory
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, entries.length, true);
  view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, pos - centralStart, true); // size of the central directory
  view.setUint32(pos + 16, centralStart, true); // where it starts
  view.setUint16(pos + 20, 0, true); // comment length
  return out;
}

/** The bytes of a `data:` URL (what stage.toDataURL() returns). Throws on anything else. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const match = /^data:[^,]*?(;base64)?,([\s\S]*)$/i.exec(dataUrl);
  if (!match) throw new Error("Bukan data URL.");
  if (match[1]) {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return textEncoder.encode(decodeURIComponent(match[2]));
}
