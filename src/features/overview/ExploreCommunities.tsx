"use client";

import Link from "next/link";
import { FiPlus } from "react-icons/fi";
import { IoHelpCircle, IoNavigateCircle, IoWallet } from "react-icons/io5";
import { pageRoutes } from "../../config/routes";
import SectionHeader from "../../components/dashboard/SectionHeader";

const TILES = [
	{
		label: "Start New Group",
		icon: <FiPlus className="text-3xl" />,
		href: pageRoutes.dashboardRoutes.NEW_GROUP,
	},
	{
		label: "Browse Pool",
		icon: <IoNavigateCircle className="text-3xl" />,
		href: pageRoutes.dashboardRoutes.GROUPS,
	},
	{
		label: "Savings History",
		icon: <IoWallet className="text-2xl" />,
		href: pageRoutes.dashboardRoutes.ACTIVITY,
	},
	{
		label: "How it works",
		icon: <IoHelpCircle className="text-3xl" />,
		href: pageRoutes.landingPage,
	},
];

/** "Explore Communities" — quick action tiles at the bottom of the dashboard. */
export default function ExploreCommunities() {
	return (
		<section>
			<SectionHeader title="Explore Communities" />
			<div className="mt-4 grid grid-cols-2 gap-3 md:mt-6 md:grid-cols-4 md:gap-4">
				{TILES.map(({ label, icon, href }) => (
					<Link
						key={label}
						href={href}
						className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-neutral-light-active px-3 py-7 text-center transition-colors hover:border-primary hover:bg-primary-light/40 md:py-9"
					>
						<span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-primary">
							{icon}
						</span>
						<span className="text-sm md:text-base">{label}</span>
					</Link>
				))}
			</div>
		</section>
	);
}
