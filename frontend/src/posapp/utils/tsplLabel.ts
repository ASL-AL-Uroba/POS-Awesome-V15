import JsBarcode from "jsbarcode";

// Raw TSPL label printing for TSC-compatible thermal printers (TSC, Sprt TL series, Xprinter, ...).
//
// Browser printing sends the label through Chrome and the Windows driver, which smooth the
// barcode and then dither the grey edges into jagged bars that scanners can't read. Here the
// label is drawn at the printer's native resolution, converted to pure black/white, and sent
// as a TSPL BITMAP, so every bar is a whole number of printer dots wide.

export const DOTS_PER_MM = 8; // 203 dpi

export interface TsplLabelSize {
  widthMm: number;
  heightMm: number;
}

export interface TsplLabelContent {
  name: string;
  barcode: string;
  price?: string;
  format?: string; // JsBarcode format, e.g. "CODE128", "EAN13"
  ean128?: boolean;
}

export interface TsplRenderOptions {
  /** Moves the whole design down (+) or up (-) on the label, in mm. */
  offsetMm?: number;
  /** Space kept clear at the top/bottom edge, in mm (printers register within ~±1 mm). */
  topPadMm?: number;
  bottomPadMm?: number;
}

export interface TsplBitmap {
  widthBytes: number;
  heightDots: number;
  /** 1 bit per dot, rows top to bottom; bit 0 = black (printed), bit 1 = white. */
  bits: Uint8Array;
  moduleDots: number;
}

export interface TsplJobOptions {
  gapMm?: number;
  /** TSPL DIRECTION: 1 = default for most label printers, 0 = rotated 180°. */
  direction?: 0 | 1;
  density?: number;
  speed?: number;
}

export const mmToDots = (mm: number): number => Math.round(mm * DOTS_PER_MM);

/** Bar/space pattern ("1" = bar) exactly as JsBarcode would encode it. */
export function encodeBarcodeModules(value: string, format = "CODE128", ean128 = false): string {
  const target: { encodings?: { data: string }[] } = {};
  JsBarcode(target, value, { format, ean128 });
  return (target.encodings || []).map((e) => e.data).join("");
}

/** Widest whole-dot bar (max 4) that still leaves a 10-module quiet zone on both sides. */
export function pickModuleDots(moduleCount: number, widthDots: number): number {
  for (let m = 4; m >= 1; m--) {
    if ((moduleCount + 20) * m <= widthDots) return m;
  }
  return 1;
}

/** Threshold RGBA pixels to TSPL bitmap bits (bit 0 = black). */
export function packBitmap(rgba: Uint8ClampedArray, widthDots: number, heightDots: number): Uint8Array {
  const widthBytes = Math.ceil(widthDots / 8);
  const bits = new Uint8Array(widthBytes * heightDots).fill(0xff);
  for (let y = 0; y < heightDots; y++) {
    for (let x = 0; x < widthDots; x++) {
      const i = (y * widthDots + x) * 4;
      const lum = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
      if (lum < 128) bits[y * widthBytes + (x >> 3)]! &= ~(0x80 >> (x & 7));
    }
  }
  return bits;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, sizePx: number, weight: string) {
  let size = sizePx;
  do {
    ctx.font = `${weight} ${size}px Arial, Tahoma, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return;
    size -= 1;
  } while (size > 10);
}

/** Draw one label (name, barcode, price) at native printer resolution. Browser only. */
export function renderTsplLabel(content: TsplLabelContent, size: TsplLabelSize, options: TsplRenderOptions = {}): TsplBitmap {
  const W = mmToDots(size.widthMm);
  const H = mmToDots(size.heightMm);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.translate(0, mmToDots(options.offsetMm ?? 0));

  const sidePad = mmToDots(1);
  const topPad = mmToDots(options.topPadMm ?? 3);
  const bottomPad = mmToDots(options.bottomPadMm ?? 2);
  const nameH = 22;
  const digitsH = 16;
  const priceH = content.price ? 22 : 0;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  fitFont(ctx, content.name, W - 2 * sidePad, nameH, "bold");
  ctx.fillText(content.name, W / 2, topPad); // canvas shapes Arabic/RTL text itself

  const modules = encodeBarcodeModules(content.barcode, content.format, content.ean128);
  const moduleDots = pickModuleDots(modules.length, W);
  const x0 = Math.floor((W - modules.length * moduleDots) / 2);
  const barTop = topPad + nameH + 4;
  const barH = Math.max(mmToDots(6), H - bottomPad - (priceH ? priceH + 4 : 0) - digitsH - 3 - barTop);
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === "1") ctx.fillRect(x0 + i * moduleDots, barTop, moduleDots, barH);
  }
  fitFont(ctx, content.barcode, modules.length * moduleDots, digitsH, "bold");
  ctx.fillText(content.barcode, W / 2, barTop + barH + 3);

  if (content.price) {
    fitFont(ctx, content.price, W - 2 * sidePad, priceH, "bold");
    ctx.textBaseline = "bottom";
    ctx.fillText(content.price, W / 2, H - bottomPad);
  }

  const bits = packBitmap(ctx.getImageData(0, 0, W, H).data, W, H);
  return { widthBytes: Math.ceil(W / 8), heightDots: H, bits, moduleDots };
}

/** One TSPL job printing each label `copies` times. */
export function buildTsplJob(
  labels: { bitmap: TsplBitmap; copies: number }[],
  size: TsplLabelSize,
  options: TsplJobOptions = {},
): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [
    enc.encode(
      [
        `SIZE ${size.widthMm} mm,${size.heightMm} mm`,
        `GAP ${options.gapMm ?? 3} mm,0 mm`,
        `DIRECTION ${options.direction ?? 1}`,
        "REFERENCE 0,0",
        `DENSITY ${options.density ?? 8}`,
        `SPEED ${options.speed ?? 4}`,
        "SET TEAR ON",
        "",
      ].join("\r\n"),
    ),
  ];
  for (const { bitmap, copies } of labels) {
    parts.push(enc.encode(`CLS\r\nBITMAP 0,0,${bitmap.widthBytes},${bitmap.heightDots},0,`));
    parts.push(bitmap.bits);
    parts.push(enc.encode(`\r\nPRINT 1,${Math.max(1, Math.floor(copies) || 1)}\r\n`));
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
