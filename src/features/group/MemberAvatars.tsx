/* eslint-disable @next/next/no-img-element */
import React from "react";

/**
 * Stacked member avatars with a REAL overflow count.
 *
 * Replaces a single static PNG (`/images/review-user-imgs.png`) that had four
 * stock faces and "+12" burnt into the pixels. It was rendered for every group
 * regardless of size, so a two-person circle showed four strangers and "+12"
 * directly above the words "2 Members".
 *
 * Falls back to an initial when a member has no avatar — never to a stock face,
 * which would misrepresent who is in the circle.
 */
export default function MemberAvatars({
	members,
	total,
	size = "md",
	borderClassName = "border-white",
	overflowClassName = "bg-neutral-900 text-white",
}: {
	members: { name: string; avatar_url: string | null }[];
	/** Full member count, which is usually larger than `members.length`. */
	total: number;
	size?: "sm" | "md" | "lg";
	/** Ring around each face, so the stack reads on any background. */
	borderClassName?: string;
	/** Colours of the "+N" bubble. */
	overflowClassName?: string;
}) {
	const box = {
		sm: "h-4 w-4 text-[7px]",
		md: "h-8.5 w-8.5 text-xs",
		lg: "h-9 w-9 text-xs md:h-12 md:w-12 md:text-sm",
	}[size];

	// The payload carries a few members for the stack; the count is authoritative
	// for the total. Never derive one from the other — that mismatch is the bug
	// this component exists to fix.
	const overflow = Math.max(0, total - members.length);

	if (members.length === 0) return null;

	return (
		<div className="flex items-center">
			{members.map((member, index) => (
				<div
					key={`${member.name}-${index}`}
					className={`${box} -ml-2 first:ml-0 shrink-0 overflow-hidden rounded-full border ${borderClassName} bg-[#efeaff]`}
					title={member.name}
				>
					{member.avatar_url ? (
						<img
							src={member.avatar_url}
							alt=""
							className="h-full w-full object-cover"
						/>
					) : (
						<span className="flex h-full w-full items-center justify-center font-medium text-primary">
							{member.name.trim().charAt(0).toUpperCase() || "?"}
						</span>
					)}
				</div>
			))}

			{overflow > 0 && (
				<div
					className={`${box} -ml-2 shrink-0 rounded-full border ${borderClassName} ${overflowClassName}`}
				>
					<span className="flex h-full w-full items-center justify-center font-medium">
						+{overflow}
					</span>
				</div>
			)}
		</div>
	);
}
