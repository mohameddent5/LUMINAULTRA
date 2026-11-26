/** Minimal single-page PDF writer: one JPEG image filling an A4 page. No dependencies. */
export function jpegToPdf(jpeg: Uint8Array, wPx: number, hPx: number, title: string): Blob {
  const W = 595;
  const H = 842;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === "string" ? enc.encode(b) : b;
    parts.push(u);
    len += u.length;
  };
  const obj = (n: number, body: string | Uint8Array[]) => {
    offsets[n] = len;
    push(`${n} 0 obj\n`);
    if (typeof body === "string") push(body);
    else body.forEach(push);
    push("\nendobj\n");
  };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [
    enc.encode(`<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    enc.encode("\nendstream"),
  ]);
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const safe = title.replace(/[^\x20-\x7e]/g, "").replace(/[()\\]/g, "");
  obj(6, `<< /Title (${safe}) /Producer (Lumina Ultra Smile Studio) >>`);
  const xref = len;
  let x = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) x += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(x);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(len);
  let p = 0;
  for (const b of parts) {
    out.set(b, p);
    p += b.length;
  }
  return new Blob([out], { type: "application/pdf" });
}
