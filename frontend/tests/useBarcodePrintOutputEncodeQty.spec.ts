import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useBarcodePrintOutput } from "../src/posapp/composables/pos/items/useBarcodePrintOutput";

// Extracts every jsbarcode-value / jsbarcode-format pair from generated label HTML.
const readBarcodes = (html: string) =>
	Array.from(html.matchAll(/jsbarcode-format="([^"]*)"\s+jsbarcode-value="([^"]*)"/g)).map(
		([, format, value]) => ({ format, value }),
	);

describe("useBarcodePrintOutput quantity-embedded barcodes", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.stubGlobal("__", (value: string) => value);
		vi.stubGlobal("frappe", { call: vi.fn(), session: { user: "test@example.com" } });
	});

	it("prints one CODE128 label carrying {barcode}*{qty} when encoding is enabled", () => {
		const out = useBarcodePrintOutput();
		out.encodeQtyInBarcode.value = true;
		out.pageFormat.value = "58x40mm";

		// 13 digits => guessSymbologyFromBarcode() would pick EAN13, which cannot encode "*".
		const html = out.generatePrintContent([
			{ item_code: "ITEM-1", item_name: "Item One", barcode: "1234567890128", qty: 5 },
		]);

		const barcodes = readBarcodes(html);
		expect(barcodes).toHaveLength(1);
		expect(barcodes[0].value).toBe("1234567890128*5");
		// Must NOT stay EAN13 — "*" is not in the EAN13 charset and JsBarcode would throw.
		expect(barcodes[0].format).toBe("CODE128");
	});

	it("prints qty separate labels in the item's own symbology when encoding is disabled", () => {
		const out = useBarcodePrintOutput();
		out.encodeQtyInBarcode.value = false;
		out.pageFormat.value = "58x40mm";

		const html = out.generatePrintContent([
			{ item_code: "ITEM-1", item_name: "Item One", barcode: "1234567890128", qty: 3 },
		]);

		const barcodes = readBarcodes(html);
		expect(barcodes).toHaveLength(3);
		expect(barcodes.every((b) => b.value === "1234567890128")).toBe(true);
		expect(barcodes.every((b) => b.format === "EAN13")).toBe(true);
	});

	it("leaves a qty of 1 untouched so single labels keep their native symbology", () => {
		const out = useBarcodePrintOutput();
		out.encodeQtyInBarcode.value = true;
		out.pageFormat.value = "58x40mm";

		const html = out.generatePrintContent([
			{ item_code: "ITEM-1", item_name: "Item One", barcode: "1234567890128", qty: 1 },
		]);

		const barcodes = readBarcodes(html);
		expect(barcodes).toHaveLength(1);
		expect(barcodes[0].value).toBe("1234567890128");
		expect(barcodes[0].format).toBe("EAN13");
	});

	it("sizes the barcode from the encoded value, not the raw barcode", () => {
		const out = useBarcodePrintOutput();
		out.pageFormat.value = "58x40mm";
		const item = { item_code: "ITEM-1", item_name: "Item One", barcode: "1234567890128", qty: 12 };

		out.encodeQtyInBarcode.value = true;
		const encoded = out.generatePrintContent([item]);
		out.encodeQtyInBarcode.value = false;
		const plain = out.generatePrintContent([item]);

		const widthOf = (html: string) => Number(/jsbarcode-width="([^"]*)"/.exec(html)?.[1]);
		// "1234567890128*12" is longer than "1234567890128", so the module width must shrink
		// to keep the symbol inside the label.
		expect(widthOf(encoded)).toBeLessThanOrEqual(widthOf(plain));
	});
});
