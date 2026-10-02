"use client";

import { useCallback } from "react";
import { useApi } from "../../lib/hooks/useApi";
import { governance as governanceApi, groups as groupsApi } from "../../lib/api";
import { GOVERNANCE_ENABLED } from "../../config/features";

/** The group record (name, asset, organizer) behind a governance screen. */
export function useGroup(groupId: string) {
	const fetcher = useCallback(() => groupsApi.show(Number(groupId)), [groupId]);
	return useApi(fetcher, [groupId]);
}

/** The group's governance summary; `null` while governance is switched off. */
export function useGovernance(groupId: string) {
	const fetcher = useCallback(
		() => (GOVERNANCE_ENABLED ? governanceApi.summary(Number(groupId)) : Promise.resolve(null)),
		[groupId],
	);
	return useApi(fetcher, [groupId]);
}

export function useProposal(groupId: string, proposalId: string) {
	const fetcher = useCallback(
		() => governanceApi.proposal(Number(groupId), Number(proposalId)),
		[groupId, proposalId],
	);
	return useApi(fetcher, [groupId, proposalId]);
}
