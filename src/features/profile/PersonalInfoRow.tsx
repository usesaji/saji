import React from "react";
import { HiOutlinePencil, HiOutlinePlus } from "react-icons/hi2";

interface PersonalInfoRowProps {
	label: string;
	value: string | null;
	/** Omit for a read-only row. */
	onEdit?: () => void;
}

export default function PersonalInfoRow({ label, value, onEdit }: PersonalInfoRowProps) {
	const isSet = Boolean(value);

	return (
		<div className="flex items-center justify-between gap-4 py-3.5">
			<div className="min-w-0">
				<p className="text-[11px] font-light">{label}</p>
				<p
					className={`mt-0.5 truncate text-sm md:text-base ${
						isSet ? "text-neutral-dark" : "text-neutral-light-active"
					}`}
				>
					{value || "Not set"}
				</p>
			</div>
			{onEdit && (
				<button
					type="button"
					onClick={onEdit}
					className="flex shrink-0 items-center gap-1 text-sm text-primary hover:text-primary-hover"
				>
					{isSet ? (
						<>
							Edit <HiOutlinePencil className="text-xs" />
						</>
					) : (
						<>
							Add <HiOutlinePlus className="text-xs" />
						</>
					)}
				</button>
			)}
		</div>
	);
}
