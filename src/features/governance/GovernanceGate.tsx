"use client";

import { useParams } from "next/navigation";
import { HiOutlineSparkles } from "react-icons/hi2";
import PageHeader from "@/components/dashboard/PageHeader";
import { GOVERNANCE_ENABLED } from "@/config/features";
import { pageRoutes } from "@/config/routes";
import { Hero, PrimaryAction } from "./ui";

/**
 * Wraps the governance routes (proposals, recovery, history). While governance
 * is switched off they render a "coming soon" state instead of calling
 * endpoints the backend doesn't have yet.
 */
export default function GovernanceGate({ children }: { children: React.ReactNode }) {
	const { groupId } = useParams<{ groupId: string }>();
	if (GOVERNANCE_ENABLED) return children;

	const circleHref = pageRoutes.dashboardRoutes.CIRCLE(groupId);
	return (
		<div className="w-full space-y-6 pb-10">
			<PageHeader title="Group Decisions" back backHref={circleHref} />
			<Hero tone="lilac" Icon={HiOutlineSparkles} title="Coming soon">
				Proposals, voting and missed-contribution recovery are on their way. Your group keeps
				saving as usual in the meantime.
			</Hero>
			<div className="md:flex md:justify-center">
				<PrimaryAction href={circleHref}>Back to group</PrimaryAction>
			</div>
		</div>
	);
}
