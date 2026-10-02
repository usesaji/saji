"use client";

import React, { useEffect, useRef, useState } from "react";
import { FiCheck } from "react-icons/fi";
import { HiOutlineAdjustmentsHorizontal } from "react-icons/hi2";
import type { Group } from "../../lib/api";

export type GroupFilterValue = "all" | "active" | "forming" | "completed" | "challenges";

const OPTIONS: { value: GroupFilterValue; label: string }[] = [
	{ value: "all", label: "All groups" },
	{ value: "active", label: "Active" },
	{ value: "forming", label: "Forming" },
	{ value: "completed", label: "Completed" },
	{ value: "challenges", label: "Challenges" },
];

/** Does a group belong under the chosen filter? Decided from its own status. */
export function matchesFilter(group: Group, filter: GroupFilterValue): boolean {
	const challenge = group.circle_kind === "challenge";
	switch (filter) {
		case "active":
			return !challenge && group.status === "active";
		case "forming":
			// Created but the rotation hasn't started — still taking members.
			return !challenge && (group.status === "draft" || group.status === "open");
		case "completed":
			return group.status === "completed" || group.status === "cancelled";
		case "challenges":
			return challenge;
		default:
			return true;
	}
}

/** The "Filter" pill and its menu. */
export default function GroupFilter({
	value,
	onChange,
}: {
	value: GroupFilterValue;
	onChange: (value: GroupFilterValue) => void;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	// Close on an outside click or Escape.
	useEffect(() => {
		if (!open) return;
		const onPointer = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		document.addEventListener("pointerdown", onPointer);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onPointer);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const active = OPTIONS.find((o) => o.value === value);

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-haspopup="menu"
				aria-expanded={open}
				className={`flex items-center gap-2 rounded-full border border-dashed px-4 py-2 text-sm transition md:px-5 md:text-lg ${
					value === "all"
						? "border-neutral-light-active"
						: "border-primary bg-primary-light text-primary"
				}`}
			>
				<HiOutlineAdjustmentsHorizontal className="text-lg md:text-xl" />
				{value === "all" ? "Filter" : active?.label}
			</button>

			{open && (
				<div
					role="menu"
					className="absolute right-0 top-full z-20 mt-2 w-44 rounded-2xl border border-neutral-light bg-white p-1.5 shadow-lg"
				>
					{OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							role="menuitemradio"
							aria-checked={option.value === value}
							onClick={() => {
								onChange(option.value);
								setOpen(false);
							}}
							className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-[#f4f4f4]"
						>
							{option.label}
							{option.value === value && <FiCheck className="text-primary" />}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
