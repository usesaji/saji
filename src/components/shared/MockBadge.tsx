import { USE_MOCKS } from "@/mocks/enabled";

/**
 * A small pinned label while the backend is detached, so mock data is never
 * mistaken for real data — on screen or in a screenshot. Renders nothing when
 * `NEXT_PUBLIC_USE_MOCKS` is off.
 */
export default function MockBadge() {
	if (!USE_MOCKS) return null;

	return (
		<div
			className="pointer-events-none fixed left-1/2 top-1 z-[9999] -translate-x-1/2 rounded-full bg-amber-400/90 px-3 py-1 text-xs font-semibold text-black shadow"
			title="NEXT_PUBLIC_USE_MOCKS=true — see src/mocks/README.md"
		>
			Mock data
		</div>
	);
}
