// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const sent: { data: string | Uint8Array; printer?: string }[] = [];
const qz = vi.hoisted(() => ({ connected: { value: true } }));
vi.mock("../src/posapp/services/qzTray", () => ({
	sendRawToQz: vi.fn(async (data: string | Uint8Array, printer?: string) => {
		sent.push({ data, printer });
	}),
	printHtmlViaQz: vi.fn(),
	qzConnected: qz.connected,
	setSelectedQzPrinter: vi.fn(),
}));

// jsdom has no canvas: record what would be drawn, keep the real TSPL job builder.
const rendered: any[] = [];
vi.mock("../src/posapp/utils/tsplLabel", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/posapp/utils/tsplLabel")>();
	return {
		...actual,
		renderTsplLabel: vi.fn((content: any, size: any, options: any) => {
			rendered.push({ content, size, options });
			return { widthBytes: 40, heightDots: 204, bits: new Uint8Array(40 * 204).fill(0xff), moduleDots: 3 };
		}),
	};
});

import { useBarcodePrintOutput, type PrinterProfile } from "../src/posapp/composables/pos/items/useBarcodePrintOutput";
import { sendRawToQz } from "../src/posapp/services/qzTray";

const PROFILE: PrinterProfile = {
	name: "Label TL5X",
	printer_name: "TL5X Printer",
	printer_type: "TSPL",
	dpi: 203,
	default_label_width: 40,
	default_label_height: 25.5,
	label_gap: 3,
	vertical_offset: -0.5,
	rotate_180: 1,
};

const ascii = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

describe("useBarcodePrintOutput TSPL output", () => {
	beforeEach(() => {
		sent.length = 0;
		rendered.length = 0;
		qz.connected.value = true;
		setActivePinia(createPinia());
		vi.stubGlobal("__", (value: string) => value);
		vi.stubGlobal("frappe", { call: vi.fn(), session: { user: "test@example.com" } });
	});

	it("uses the TSPL printer profile: label size, gap, offset, rotation and printer", async () => {
		const out = useBarcodePrintOutput();
		out.applyPrinterProfile(PROFILE);
		out.encodeQtyInBarcode.value = false;
		expect(out.outputFormat.value).toBe("tspl");

		await out.printLabelsRaw([{ item_code: "F35", item_name: "F35", barcode: "f35", price: 35000, qty: 3 }], "TL5X Printer");

		expect(rendered[0].size).toEqual({ widthMm: 40, heightMm: 25.5 });
		expect(rendered[0].options).toEqual({ offsetMm: -0.5 });
		expect(rendered[0].content).toMatchObject({ name: "F35", barcode: "f35", format: "CODE128" });

		expect(sent).toHaveLength(1);
		expect(sent[0]!.printer).toBe("TL5X Printer");
		const text = ascii(sent[0]!.data as Uint8Array);
		expect(text).toContain("SIZE 40 mm,25.5 mm\r\nGAP 3 mm,0 mm\r\nDIRECTION 0\r\n");
		expect(text).toContain("PRINT 1,3\r\n");
	});

	it("prints one CODE128 label carrying {barcode}*{qty} when quantity is embedded", async () => {
		const out = useBarcodePrintOutput();
		out.applyPrinterProfile(PROFILE);
		out.encodeQtyInBarcode.value = true;

		await out.printLabelsRaw([{ item_code: "C35", item_name: "C35", barcode: "352", price: 1, qty: 4 }]);

		expect(rendered[0].content).toMatchObject({ barcode: "352*4", format: "CODE128" });
		expect(ascii(sent[0]!.data as Uint8Array)).toContain("PRINT 1,1\r\n");
	});

	it("puts every item in one job", async () => {
		const out = useBarcodePrintOutput();
		out.applyPrinterProfile(PROFILE);
		out.encodeQtyInBarcode.value = false;

		await out.printLabelsRaw([
			{ item_code: "A", item_name: "A", barcode: "f35", qty: 1 },
			{ item_code: "B", item_name: "B", barcode: "2001931004448", qty: 2 },
		]);

		expect(sent).toHaveLength(1);
		const text = ascii(sent[0]!.data as Uint8Array);
		expect(text.split("CLS\r\nBITMAP")).toHaveLength(3);
		expect(rendered[1].content.format).toBe("EAN13");
	});

	it("enables the Thermal button for raw formats without a prior QZ connection", () => {
		qz.connected.value = false; // e.g. after a page reload; sendRawToQz connects on click
		const out = useBarcodePrintOutput();
		expect(out.qzThermalAvailable.value).toBe(false); // html still needs a live connection

		const raw = useBarcodePrintOutput();
		raw.applyPrinterProfile(PROFILE);
		expect(raw.qzThermalAvailable.value).toBe(true);
	});

	it("shows the QZ error instead of falling back to browser print for TSPL", async () => {
		vi.mocked(sendRawToQz).mockRejectedValueOnce(new Error("QZ Tray is not available."));
		const open = vi.spyOn(window, "open").mockReturnValue(null);
		const out = useBarcodePrintOutput();
		out.applyPrinterProfile(PROFILE);

		await out.printLabelsRawWithFailover([{ item_code: "F35", item_name: "F35", barcode: "f35", qty: 1 }]);

		expect(open).not.toHaveBeenCalled();
		open.mockRestore();
	});
});
