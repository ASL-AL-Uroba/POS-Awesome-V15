import { ref, watch } from "vue";
import type { Ref } from "vue";

import { parseBooleanSetting } from "../../../utils/stock";

export type ItemsViewMode = "card" | "list";

type PosProfileLike = Record<string, any> | null | undefined;

type UseItemsSelectorViewModeArgs = {
	posProfile: Ref<PosProfileLike>;
};

// The selector renders an empty object until the profile resolves, so an
// unnamed-but-populated profile still counts as a distinct profile identity.
const UNNAMED_PROFILE_KEY = "__unnamed_pos_profile__";

export const resolveDefaultItemsView = (
	posProfile: PosProfileLike,
): ItemsViewMode =>
	parseBooleanSetting(posProfile?.posa_default_card_view) ? "card" : "list";

export const resolvePosProfileKey = (
	posProfile: PosProfileLike,
): string | null => {
	if (!posProfile || typeof posProfile !== "object") {
		return null;
	}
	const name = posProfile.name;
	if (typeof name === "string" && name.trim()) {
		return name.trim();
	}
	return Object.keys(posProfile).length ? UNNAMED_PROFILE_KEY : null;
};

/**
 * useItemsSelectorViewMode
 *
 * Owns the card/list toggle for the items screen. The POS Profile supplies the
 * default only: it is applied once per profile, as soon as that profile
 * resolves, so a manual toolbar toggle is never clobbered by a later reactive
 * refresh of the same profile.
 */
export function useItemsSelectorViewMode({
	posProfile,
}: UseItemsSelectorViewModeArgs) {
	const items_view = ref<ItemsViewMode>("list");
	let appliedProfileKey: string | null = null;

	watch(
		() => resolvePosProfileKey(posProfile.value),
		(profileKey) => {
			if (!profileKey || profileKey === appliedProfileKey) {
				return;
			}
			appliedProfileKey = profileKey;
			items_view.value = resolveDefaultItemsView(posProfile.value);
		},
		{ immediate: true },
	);

	return {
		items_view,
	};
}
