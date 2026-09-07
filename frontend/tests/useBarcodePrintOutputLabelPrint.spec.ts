// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useBarcodePrintOutput } from "../src/posapp/composables/pos/items/useBarcodePrintOutput";

// Captures whatever printLabels() writes into the popup document.
const stubPrintPopup = () => {
	let written = "";
	const printWindow = {
		document: {
			write: (html: string) => {
				written += html;
			},
			close: vi.fn(),
		},
		matchMedia: () => null,
	};
	vi.spyOn(window, "open").mockReturnValue(printWindow as any);
	return () => written;
};

const ITEM = { item_code: "ITEM-1", item_name: "Item One", barcode: "1234567890128", qty: 4 };

describe("useBarcodePrintOutput printLabels page sizing", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.stubGlobal("__", (value: string) => value);
		vi.stubGlobal("frappe", { call: vi.fn(), session: { user: "test@example.com" } });
	});

	it("routes a label format through html2pdf so jsPDF sets the real page box", () => {
		const read = stubPrintPopup();
		const out = useBarcodePrintOutput();
		out.pageFormat.value = "58x40mm";
		out.encodeQtyInBarcode.value = false; // one page per label

		out.printLabels([ITEM]);
		const html = read();

		// Chrome ignores @page{size}, so the DOM must NOT be printed directly.
		expect(html).toContain("html2pdf.bundle.min.js");
		expect(html).toContain("autoPrint()");
		expect(html).not.toContain("window.print()");

		const opt = JSON.parse(/html2pdf\(\)\.set\((\{.*?\})\)\.from/s.exec(html)![1]);
		expect(opt.jsPDF.format).toEqual([58, 40]);
		// 58 >= 40, and jsPDF would silently swap to portrait unless told otherwise.
		expect(opt.jsPDF.orientation).toBe("landscape");
		// getPrintStyles() still sets page-break-after on .label for the A4 path.
		expect(opt.pagebreak.mode).toEqual(["avoid-all"]);
		// 4 labels x 40mm at 96dpi, capped so no blank trailing page is emitted.
		expect(opt.html2canvas.height).toBe(Math.floor(4 * 40 * (96 / 25.4)));
	});

	it("counts one page per encoded label when quantity is embedded", () => {
		const read = stubPrintPopup();
		const out = useBarcodePrintOutput();
		out.pageFormat.value = "58x40mm";
		out.encodeQtyInBarcode.value = true;

		out.printLabels([ITEM]); // qty 4 collapses to a single {barcode}*4 label
		const opt = JSON.parse(/html2pdf\(\)\.set\((\{.*?\})\)\.from/s.exec(read())![1]);

		expect(opt.html2canvas.height).toBe(Math.floor(1 * 40 * (96 / 25.4)));
	});

	it("keeps the native browser print dialog for A4 sheets", () => {
		const read = stubPrintPopup();
		const out = useBarcodePrintOutput();
		out.pageFormat.value = "A4";

		out.printLabels([ITEM]);
		const html = read();

		expect(html).toContain("window.print()");
		expect(html).not.toContain("html2pdf");
	});

	it("uses portrait when the label is taller than it is wide", () => {
		const read = stubPrintPopup();
		const out = useBarcodePrintOutput();
		out.pageFormat.value = "100x150mm";

		out.printLabels([ITEM]);
		const opt = JSON.parse(/html2pdf\(\)\.set\((\{.*?\})\)\.from/s.exec(read())![1]);

		expect(opt.jsPDF.format).toEqual([100, 150]);
		expect(opt.jsPDF.orientation).toBe("portrait");
	});

	it("keeps the AAU label stock sizes selectable", () => {
		const out = useBarcodePrintOutput();
		for (const [value, dims] of [
			["58x40mm", [58, 40]],
			["58x30mm", [58, 30]],
			["62x29mm", [62, 29]],
		] as [string, number[]][]) {
			out.pageFormat.value = value;
			const size = out.parseLabelSize();
			// An unknown preset silently falls back to A4, so this guards the sizes existing.
			expect([size.type, size.width, size.height]).toEqual(["thermal", dims[0], dims[1]]);
		}
	});
});
