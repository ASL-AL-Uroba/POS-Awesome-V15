import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";

import { useItemsSelectorViewMode } from "../src/posapp/composables/pos/items/useItemsSelectorViewMode";

describe("useItemsSelectorViewMode", () => {
	it("stays on list view until the POS profile resolves", async () => {
		const posProfile = ref<Record<string, any>>({});
		const { items_view } = useItemsSelectorViewMode({ posProfile });

		expect(items_view.value).toBe("list");

		posProfile.value = { name: "POS-1", posa_default_card_view: 1 };
		await nextTick();

		expect(items_view.value).toBe("card");
	});

	it("opens in card view when the profile is already available", () => {
		const posProfile = ref<Record<string, any>>({
			name: "POS-1",
			posa_default_card_view: 1,
		});
		const { items_view } = useItemsSelectorViewMode({ posProfile });

		expect(items_view.value).toBe("card");
	});

	it("opens in list view when the profile setting is unchecked or missing", () => {
		expect(
			useItemsSelectorViewMode({
				posProfile: ref({ name: "POS-1", posa_default_card_view: 0 }),
			}).items_view.value,
		).toBe("list");

		expect(
			useItemsSelectorViewMode({ posProfile: ref({ name: "POS-1" }) })
				.items_view.value,
		).toBe("list");
	});

	it("parses checkbox values the way the other profile settings do", () => {
		expect(
			useItemsSelectorViewMode({
				posProfile: ref({ name: "POS-1", posa_default_card_view: "1" }),
			}).items_view.value,
		).toBe("card");

		expect(
			useItemsSelectorViewMode({
				posProfile: ref({ name: "POS-1", posa_default_card_view: "0" }),
			}).items_view.value,
		).toBe("list");
	});

	it("keeps a manual toggle when the same profile is refreshed", async () => {
		const posProfile = ref<Record<string, any>>({
			name: "POS-1",
			posa_default_card_view: 1,
		});
		const { items_view } = useItemsSelectorViewMode({ posProfile });

		expect(items_view.value).toBe("card");

		items_view.value = "list";
		posProfile.value = { name: "POS-1", posa_default_card_view: 1 };
		await nextTick();

		expect(items_view.value).toBe("list");
	});

	it("applies the per-profile default when the profile changes", async () => {
		const posProfile = ref<Record<string, any>>({
			name: "POS-1",
			posa_default_card_view: 1,
		});
		const { items_view } = useItemsSelectorViewMode({ posProfile });

		expect(items_view.value).toBe("card");

		posProfile.value = { name: "POS-2", posa_default_card_view: 0 };
		await nextTick();
		expect(items_view.value).toBe("list");

		posProfile.value = { name: "POS-3", posa_default_card_view: 1 };
		await nextTick();
		expect(items_view.value).toBe("card");
	});
});
