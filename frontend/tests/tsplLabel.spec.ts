import { describe, expect, it } from "vitest";

import {
	buildTsplJob,
	encodeBarcodeModules,
	packBitmap,
	pickModuleDots,
} from "../src/posapp/utils/tsplLabel";
import { guessSymbologyFromBarcode } from "../src/posapp/composables/pos/items/useBarcodePrintOutput";

const ascii = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("tsplLabel", () => {
	it("encodes bars exactly like JsBarcode (Code 128 start B, 68 modules for f35)", () => {
		const modules = encodeBarcodeModules("f35", "CODE128");
		expect(modules).toHaveLength(68);
		expect(modules.startsWith("11010010000")).toBe(true);
		expect(modules.endsWith("1100011101011")).toBe(true);
	});

	it("picks the widest whole-dot bar that keeps a 10-module quiet zone", () => {
		expect(pickModuleDots(68, 320)).toBe(3); // f35 on a 40 mm label
		expect(pickModuleDots(123, 320)).toBe(2); // 13-digit code
		expect(pickModuleDots(400, 320)).toBe(1);
	});

	it("thresholds to 1-bit with bit 0 = black and pads rows to whole bytes", () => {
		const w = 10;
		const h = 2;
		const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
		const paint = (x: number, y: number, v: number) => rgba.fill(v, (y * w + x) * 4, (y * w + x) * 4 + 3);
		paint(0, 0, 0); // black
		paint(9, 1, 100); // dark grey -> black
		paint(1, 0, 200); // light grey -> white

		const bits = packBitmap(rgba, w, h);
		expect(Array.from(bits)).toEqual([0b01111111, 0xff, 0xff, 0b10111111]);
	});

	it("builds one job with raw bitmap bytes and a copy count per label", () => {
		const bitmap = { widthBytes: 1, heightDots: 2, bits: new Uint8Array([0x00, 0xff]), moduleDots: 3 };
		const job = buildTsplJob(
			[
				{ bitmap, copies: 4 },
				{ bitmap, copies: 0 },
			],
			{ widthMm: 40, heightMm: 25.5 },
			{ gapMm: 2.5, direction: 0 },
		);
		const text = ascii(job);

		expect(text.startsWith("SIZE 40 mm,25.5 mm\r\nGAP 2.5 mm,0 mm\r\nDIRECTION 0\r\n")).toBe(true);
		expect(text.split("CLS\r\nBITMAP 0,0,1,2,0,")).toHaveLength(3);
		expect(text).toContain("PRINT 1,4\r\n");
		expect(text).toContain("PRINT 1,1\r\n"); // never zero copies
		// bitmap bytes are embedded untouched (no text re-encoding of 0x00 / 0xff)
		const at = text.indexOf("BITMAP 0,0,1,2,0,") + "BITMAP 0,0,1,2,0,".length;
		expect(Array.from(job.subarray(at, at + 2))).toEqual([0x00, 0xff]);
	});
});

describe("guessSymbologyFromBarcode", () => {
	it("only guesses ITF for even-length numbers, since ITF can't encode odd lengths", () => {
		expect(guessSymbologyFromBarcode("352")).toBe("CODE128");
		expect(guessSymbologyFromBarcode("3526")).toBe("ITF");
		expect(guessSymbologyFromBarcode("2001931004448")).toBe("EAN13");
		expect(guessSymbologyFromBarcode("f35")).toBe("CODE128");
	});
});
