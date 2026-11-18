// Minimal dependency-free .xlsx reader (first worksheet → rows of strings).
// Uses the browser's DecompressionStream to unzip and DOMParser to read the sheet XML.

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf);
  const out = new Map<string, Uint8Array>();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('فایل اکسل معتبر نیست (فقط ‎.xlsx پشتیبانی می‌شود).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extra + comment;
    if (!/^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml)$/.test(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = new Uint8Array(buf, start, size);
    if (method === 0) out.set(name, raw);
    else {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
    }
  }
  return out;
}

const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(file: File): Promise<string[][]> {
  const files = await unzip(await file.arrayBuffer());
  const dec = new TextDecoder();
  const xml = (name: string) => { const b = files.get(name); return b ? new DOMParser().parseFromString(dec.decode(b), 'application/xml') : null; };
  const shared: string[] = [];
  const ss = xml('xl/sharedStrings.xml');
  ss?.querySelectorAll('si').forEach((si) => shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('')));
  // Resolve the first sheet in workbook order.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = xml('xl/workbook.xml'), rels = xml('xl/_rels/workbook.xml.rels');
  const first = wb?.getElementsByTagName('sheet')[0];
  const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const target = rid && Array.from(rels?.getElementsByTagName('Relationship') ?? []).find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target');
  if (target) sheetPath = 'xl/' + target.replace(/^\/?xl\//, '').replace(/^\//, '');
  const sheet = xml(sheetPath);
  if (!sheet) throw new Error('برگهٔ اول فایل اکسل خوانده نشد.');
  const rows: string[][] = [];
  for (const row of Array.from(sheet.getElementsByTagName('row'))) {
    const vals: string[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const val = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? Array.from(c.getElementsByTagName('t')).map((x) => x.textContent).join('') : v;
      vals[colIndex(c.getAttribute('r') ?? 'A')] = val.trim();
    }
    rows.push(Array.from(vals, (x) => x ?? ''));
  }
  return rows.filter((r) => r.some(Boolean));
}

// Persian digits → Latin, Arabic ي/ك → Persian.
export const clean = (s: string) => (s ?? '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
