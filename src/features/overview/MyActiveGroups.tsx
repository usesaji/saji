"use client";

import Link from "next/link";
import { IoIosArrowRoundForward } from "react-icons/io";
import { pageRoutes } from "../../config/routes";
import type { Group } from "../../lib/api";
import SectionHeader from "../../components/dashboard/SectionHeader";
import { CircleCard, CircleRow } from "../group/CircleCards";

/** Desktop shows a 2-column grid of cards; mobile a shorter list. */
const DESKTOP_LIMIT = 4;
const MOBILE_LIMIT = 3;

/**
 * "My Active Groups" (desktop) / "Your Circles" (mobile): the circles the user
 * is an approved member of that are open or running.
 *
 * Fed from `GET /api/groups` rows rather than the dashboard's `circles`, which
 * carry no member faces, progress or due date — everything these cards show.
 */
export default function MyActiveGroups({
	groups,
	loading,
	error,
}: {
	groups: Group[];
	loading: boolean;
	error: string | null;
}) {
	return (
		<section>
			<SectionHeader
				title={
					<>
						<span className="md:hidden">Your Circles</span>
						<span className="max-md:hidden">
							My Active Groups{groups.length > 0 ? ` (${groups.length})` : ""}
						</span>
					</>
				}
				href={pageRoutes.dashboardRoutes.GROUPS}
			/>

			{loading ? (
				<div className="mt-4 grid gap-3 md:mt-6 md:grid-cols-2 md:gap-4">
					{[0, 1].map((i) => (
						<div
							key={i}
							className="h-24 animate-pulse rounded-xl bg-[#f8f8f8] md:h-80 md:rounded-[20px]"
						/>
					))}
				</div>
			) : error ? (
				<p className="mt-4 text-sm text-error-500">{error}</p>
			) : groups.length === 0 ? (
				<div className="mt-4 rounded-xl bg-[#f8f8f8] px-5 py-6 text-sm md:mt-6 md:rounded-[20px]">
					<p>You&apos;re not in any active groups yet.</p>
					<Link
						href={pageRoutes.dashboardRoutes.NEW_GROUP}
						className="mt-2 inline-flex items-center text-primary"
					>
						Start a group <IoIosArrowRoundForward className="text-xl" />
					</Link>
				</div>
			) : (
				<>
					<div className="mt-4 space-y-3 md:hidden">
						{groups.slice(0, MOBILE_LIMIT).map((group, index) => (
							<CircleRow key={group.id} group={group} index={index} />
						))}
					</div>

					<div className="mt-6 grid grid-cols-2 gap-4 max-md:hidden">
						{groups.slice(0, DESKTOP_LIMIT).map((group) => (
							<CircleCard key={group.id} group={group} />
						))}
					</div>
				</>
			)}
		</section>
	);
}
