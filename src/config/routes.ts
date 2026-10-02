export const pageRoutes = {
	landingPage: "/",

	authRoutes: {
		LOGIN: "/auth/login",
		REGISTER: "/auth/register",
		CREATE_PROFILE: "/auth/register/create-profile",
		OTP: (email: string) => `/auth/register/verify-otp?email=${email}`,
	},

	dashboardRoutes: {
		OVERVIEW: "/overview",
		GROUPS: "/groups",
		NEW_GROUP: "/groups/create",
		GROUP: (id: string) => `/groups/${id}`,
		CIRCLE: (id: string | number) => `/groups/${id}/circle`,
		GROUP_REQUESTS: (id: string | number) => `/groups/${id}/requests`,
		PAYOUT_ORDER: (id: string | number) => `/groups/${id}/payout-order`,
		GROUP_COMPLETE: (id: string | number) => `/groups/${id}/complete`,
		JOIN_GROUP: (token: string) => `/groups/join/${token}`,
		PROPOSALS: (id: string | number) => `/groups/${id}/proposals`,
		NEW_PROPOSAL: (id: string | number) => `/groups/${id}/proposals/new`,
		PROPOSAL: (id: string | number, proposalId: string | number) =>
			`/groups/${id}/proposals/${proposalId}`,
		VOTE: (id: string | number, proposalId: string | number) =>
			`/groups/${id}/proposals/${proposalId}/vote`,
		RECOVERY: (id: string | number) => `/groups/${id}/recovery`,
		RECOVERY_OPTIONS: (id: string | number) => `/groups/${id}/recovery/options`,
		RECOVERY_PROPOSE: (id: string | number, option: string) =>
			`/groups/${id}/recovery/propose?option=${option}`,
		GROUP_HISTORY: (id: string | number) => `/groups/${id}/history`,

		ACTIVITY: "/activity",
		NOTIFICATIONS: "/activity",
		SEARCH: (q: string) => `/search?q=${encodeURIComponent(q)}`,
		WALLET: "/wallet",
		WITHDRAW: "/wallet/withdraw",
		TRANSACTION: (id: string | number) => `/transactions/${id}`,
		WALLET_WITHDRAW: "/wallet/withdraw",

		ME: "/profile",

		// Profile sub-pages
		PROFILE_EDIT: "/profile/edit",
		PROFILE_SECURITY: "/profile/security",
		WITHDRAW_INFO: "/profile/withdraw-info",
		PROFILE_PERSONAL_INFO: "/profile/personal-info",
		PROFILE_PASSWORD_SECURITY: "/profile/password-security",
		PROFILE_STATEMENT: "/profile/statement",
	},
};
