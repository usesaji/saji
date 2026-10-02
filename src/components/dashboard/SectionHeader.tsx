import Link from "next/link";
import React from "react";
import { IoIosArrowRoundForward } from "react-icons/io";

/** Section title with the "View All →" link used across the dashboard pages. */
export default function SectionHeader({
	title,
	href,
	action,
	as: Heading = "h3",
}: {
	title: React.ReactNode;
	href?: string;
	/** Replaces the View All link, e.g. a search icon or filter controls. */
	action?: React.ReactNode;
	as?: "h2" | "h3";
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<Heading className="text-lg md:text-[26px]">{title}</Heading>
			{action ??
				(href && (
					<Link
						href={href}
						className="flex shrink-0 items-center gap-1 text-xs md:text-xl md:text-primary"
					>
						View All <IoIosArrowRoundForward className="text-xl md:text-3xl" />
					</Link>
				))}
		</div>
	);
}
