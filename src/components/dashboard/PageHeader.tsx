"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { HiArrowLongLeft } from "react-icons/hi2";

/**
 * The top of a dashboard page: optional back arrow, title, subtitle, and
 * actions on the right — the type scale the Overview and Groups designs use.
 */
export default function PageHeader({
	title,
	subtitle,
	back = false,
	backHref,
	actions,
}: {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	/** Show a back arrow (browser history, or `backHref` when given). */
	back?: boolean;
	backHref?: string;
	actions?: React.ReactNode;
}) {
	const router = useRouter();
	const arrow = <HiArrowLongLeft className="text-2xl" />;

	return (
		<div className="flex items-start justify-between gap-4">
			<div className="flex min-w-0 items-start gap-3">
				{back &&
					(backHref ? (
						<Link href={backHref} aria-label="Back" className="mt-1.5 shrink-0 md:mt-2.5">
							{arrow}
						</Link>
					) : (
						<button
							type="button"
							onClick={() => router.back()}
							aria-label="Back"
							className="mt-1.5 shrink-0 md:mt-2.5"
						>
							{arrow}
						</button>
					))}
				<div className="min-w-0">
					<h2 className="truncate text-[26px] font-light md:text-[34px] md:font-normal">
						{title}
					</h2>
					{subtitle && <p className="mt-1 text-xs font-light md:text-sm">{subtitle}</p>}
				</div>
			</div>
			{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
		</div>
	);
}
