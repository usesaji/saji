/**
 * Thin client for the Saji API — now the Next.js route handlers in
 * `src/app/api`, previously a separate Laravel server.
 *
 * Uses bearer-token auth: on register/login the API returns a token which we
 * persist in localStorage and attach to subsequent requests. The scheme is
 * unchanged from Sanctum, so this file did not need rewriting — see
 * `src/server/auth.ts`. This is the single place the frontend talks to the API.
 *
 * Organized by domain:
 *   auth · profile · wallet · withdrawInfo · fiatDeposit · groups ·
 *   contributions · challenges · transactions · activity · dashboard
 */

import { USE_MOCKS } from "@/mocks/enabled";

// Empty string = same-origin, the default now that the API lives in this app as
// route handlers under `src/app/api`. Set this only when the API is deployed
// separately.
//
// The fallback is deliberately "" and not a localhost URL: an unset var on a
// fresh clone or a deploy where it was never configured would otherwise point
// the browser at a dead host, and every call fails at the fetch layer as
// "Could not reach the server" — which looks like an outage, not a missing
// environment variable.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const TOKEN_KEY = "saji_token";

/**
 * Mock mode starts signed in, so frontend work doesn't begin at the login
 * screen. Logging out sets this flag so the signed-out screens stay reachable
 * until the next login. See `src/mocks/README.md`.
 */
const MOCK_SIGNED_OUT_KEY = "saji_mock_signed_out";

// ---- shared types ----

export type User = {
	id: number;
	name: string;
	tag_name: string | null;
	email: string;
	stellar_address: string | null;
};

export type AuthResponse = {
	user: User;
	token: string;
};

/** Laravel's length-aware paginator envelope. */
export type Paginated<T> = {
	current_page: number;
	data: T[];
	first_page_url: string | null;
	from: number | null;
	last_page: number;
	last_page_url: string | null;
	next_page_url: string | null;
	path: string;
	per_page: number;
	prev_page_url: string | null;
	to: number | null;
	total: number;
};

export type GroupRef = { id: number; name: string };

/** A backend error with the (possibly field-keyed) validation messages. */
export class ApiError extends Error {
	status: number;
	errors?: Record<string, string[]>;

	constructor(message: string, status: number, errors?: Record<string, string[]>) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.errors = errors;
	}
}

// ---- token storage (browser only) ----

export function getToken(): string | null {
	if (typeof window === "undefined") return null;
	const token = window.localStorage.getItem(TOKEN_KEY);
	if (!token && USE_MOCKS && !window.localStorage.getItem(MOCK_SIGNED_OUT_KEY)) {
		return "mock-token";
	}
	return token;
}

export function setToken(token: string): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(TOKEN_KEY, token);
	window.localStorage.removeItem(MOCK_SIGNED_OUT_KEY);
}

export function clearToken(): void {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(TOKEN_KEY);
	if (USE_MOCKS) window.localStorage.setItem(MOCK_SIGNED_OUT_KEY, "1");
}

// ---- core request ----

type RequestOptions = {
	method?: string;
	/** JSON body — serialized and sent with a JSON content-type. */
	body?: unknown;
	/** FormData body — sent as-is (multipart), no JSON content-type. */
	form?: FormData;
	auth?: boolean;
	/** Appended as a query string. Null/undefined values are dropped. */
	query?: Record<string, string | number | boolean | null | undefined>;
};

function buildQuery(query?: RequestOptions["query"]): string {
	if (!query) return "";
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value !== null && value !== undefined) params.set(key, String(value));
	}
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const { method = "GET", body, form, auth = false, query } = options;

	// Backend detached: answer from the in-memory mock store instead. Same
	// status/body handling below, so errors surface as the same ApiError.
	// The env check is inlined (not USE_MOCKS) wherever it guards an import():
	// the build replaces it with a literal, so the mock modules are dropped
	// from production bundles entirely rather than shipped as unused chunks.
	if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
		const { mockRequest } = await import("@/mocks/api");
		const { status, data } = await mockRequest(method, path, { query, body, form });
		return handleResponse<T>(status, data);
	}

	const headers: Record<string, string> = { Accept: "application/json" };
	// FormData sets its own multipart boundary — don't set Content-Type for it.
	if (body !== undefined) headers["Content-Type"] = "application/json";
	if (auth) {
		const token = getToken();
		if (token) headers["Authorization"] = `Bearer ${token}`;
	}

	let res: Response;
	try {
		res = await fetch(`${API_URL}${path}${buildQuery(query)}`, {
			method,
			headers,
			body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
		});
	} catch {
		// Network-level failure (backend down, CORS blocked, offline).
		throw new ApiError("Could not reach the server. Is the backend running?", 0);
	}

	// 204 No Content etc. A non-JSON body (an HTML error page from a missing
	// route or a crashed function) becomes null, so handleResponse reports the
	// status instead of this throwing a SyntaxError.
	const text = await res.text();
	let data: unknown = null;
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = null;
		}
	}

	return handleResponse<T>(res.status, data);
}

/** Turn a status + parsed JSON body into the result, or throw an ApiError. */
function handleResponse<T>(status: number, data: unknown): T {
	if (status < 200 || status >= 300) {
		const body = data as { message?: string; errors?: Record<string, string[]> } | null;
		throw new ApiError(body?.message ?? `Request failed (${status})`, status, body?.errors);
	}

	return data as T;
}

/** Field-level validation errors, flattened to one message per field. */
export function fieldErrors(err: unknown): Record<string, string> {
	if (!(err instanceof ApiError) || !err.errors) return {};
	return Object.fromEntries(
		Object.entries(err.errors).map(([key, messages]) => [key, messages[0]]),
	);
}

/**
 * Resolve a stored image path to a loadable URL.
 *
 * The backend stores uploaded images as `/storage/...` paths (served off the
 * API origin), while external images (e.g. Google avatars) are already absolute.
 * Returns `fallback` when there's nothing stored, so callers get a placeholder
 * for users/groups that haven't uploaded a picture yet.
 */
export function assetUrl(
	path: string | null | undefined,
	fallback = "",
): string {
	if (!path) return fallback;
	// Already absolute — including blob:/data: URLs from a local file preview.
	if (/^(https?:|blob:|data:)/i.test(path)) return path;
	return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Download a binary response (e.g. statement PDF/CSV) with auth. */
export async function downloadFile(
	path: string,
	query?: RequestOptions["query"],
): Promise<Blob> {
	if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
		const { mockDownload } = await import("@/mocks/api");
		return mockDownload(path);
	}

	const headers: Record<string, string> = {};
	const token = getToken();
	if (token) headers["Authorization"] = `Bearer ${token}`;

	const res = await fetch(`${API_URL}${path}${buildQuery(query)}`, { headers });
	if (!res.ok) throw new ApiError(`Download failed (${res.status})`, res.status);
	return res.blob();
}

// ================================================================
// auth
// ================================================================

export const auth = {
	/** Step 1 of signup: mail a 4-digit code to the address. */
	startRegistration(input: { email: string }): Promise<{
		message: string;
		expires_in_minutes: number;
	}> {
		return request("/api/auth/register/start", { method: "POST", body: input });
	},

	/** Step 2: exchange a correct code for a short-lived signup token. */
	verifyOtp(input: { email: string; otp: string }): Promise<{
		message: string;
		signup_token: string;
	}> {
		return request("/api/auth/register/verify-otp", { method: "POST", body: input });
	},

	/** Step 3: exchange the signup token + profile for a real account. */
	completeProfile(input: {
		signup_token: string;
		name: string;
		tag_name: string;
		password: string;
		password_confirmation: string;
	}): Promise<AuthResponse> {
		return request<AuthResponse>("/api/auth/register/complete-profile", {
			method: "POST",
			body: input,
		});
	},

	login(input: { email: string; password: string }): Promise<AuthResponse> {
		return request<AuthResponse>("/api/auth/login", { method: "POST", body: input });
	},

	/** Full-page URL that kicks off the Google server-side OAuth flow. */
	googleRedirectUrl(): string {
		// Mock mode skips Google and lands straight on the callback page, which
		// exchanges the code through the (mocked) API as usual.
		if (USE_MOCKS) return "/auth/google/callback?code=mock";
		return `${API_URL}/api/auth/google/redirect`;
	},

	/**
	 * Trade the single-use code on the Google-callback landing URL for the
	 * real bearer token. Keeps the long-lived token out of the URL entirely —
	 * see `/api/auth/google/exchange`.
	 */
	exchangeGoogleCode(code: string): Promise<{ token: string }> {
		return request<{ token: string }>("/api/auth/google/exchange", {
			method: "POST",
			body: { code },
		});
	},

	me(): Promise<User> {
		return request<User>("/api/auth/me", { auth: true });
	},

	logout(): Promise<{ message: string }> {
		return request<{ message: string }>("/api/auth/logout", {
			method: "POST",
			auth: true,
		});
	},
};

// ================================================================
// profile
// ================================================================

export type ProfileDetails = {
	id: number;
	name: string;
	tag_name: string | null;
	email: string;
	avatar_url: string | null;
	stellar_address: string | null;
	date_of_birth: string | null;
	gender: string | null;
	address: string | null;
	has_password: boolean;
	is_google_linked: boolean;
	security: {
		twofa_on_suspicious_withdrawal: boolean;
		lock_after_failed_attempts: number;
	};
};

export const profile = {
	show(): Promise<ProfileDetails> {
		return request<ProfileDetails>("/api/profile", { auth: true });
	},

	update(input: {
		name?: string;
		tag_name?: string;
		date_of_birth?: string | null;
		gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
		address?: string | null;
	}): Promise<User> {
		return request<User>("/api/profile", { method: "PATCH", body: input, auth: true });
	},

	uploadAvatar(file: File): Promise<{ avatar_url: string }> {
		const form = new FormData();
		form.append("avatar", file);
		return request("/api/profile/avatar", { method: "POST", form, auth: true });
	},

	changePassword(input: {
		password: string;
		password_confirmation: string;
		current_password?: string;
	}): Promise<{ message: string }> {
		return request("/api/profile/password", { method: "POST", body: input, auth: true });
	},

	updateSecurity(input: {
		twofa_on_suspicious_withdrawal?: boolean;
		lock_after_failed_attempts?: number;
	}): Promise<{
		twofa_on_suspicious_withdrawal: boolean;
		lock_after_failed_attempts: number;
	}> {
		return request("/api/profile/security", {
			method: "PATCH",
			body: input,
			auth: true,
		});
	},

	/**
	 * Request a signable proof-of-control challenge for `stellar_address`.
	 * Sign the returned XDR with that wallet, then pass it to `linkWallet`.
	 */
	walletChallenge(stellar_address: string): Promise<{ unsigned_xdr: string }> {
		return request("/api/profile/wallet/challenge", {
			method: "POST",
			body: { stellar_address },
			auth: true,
		});
	},

	/**
	 * Link/unlink the user's Stellar wallet (public address only). Linking a
	 * non-null address requires `signed_xdr` — the challenge from
	 * `walletChallenge`, signed by that same wallet. Unlinking (null) needs
	 * no proof.
	 */
	linkWallet(
		stellar_address: string | null,
		signed_xdr?: string,
	): Promise<{
		stellar_address: string | null;
		linked: boolean;
	}> {
		return request("/api/profile/wallet", {
			method: "PATCH",
			body: { stellar_address, signed_xdr },
			auth: true,
		});
	},
};

// ================================================================
// wallet
// ================================================================

export type WalletBalance = {
	linked: boolean;
	stellar_address: string | null;
	amount: string | null;
	asset_code: string;
};

/** A single circle the user has a claimable payout in. */
export type ClaimableEntry = {
	group_id: number;
	onchain_group_id: number;
	group_name: string;
	asset_code: string;
	amount: string;
};

/** One asset's withdrawable balance (wallet + claimable circle payouts). */
export type AssetBalance = {
	asset_code: string;
	wallet_amount: string | null;
	claimable_total: string;
	total: string | null;
	claimables: ClaimableEntry[];
};

/** "Saji balance": withdrawable money broken down per asset (XLM/USDC/USDT). */
export type SajiBalance = {
	linked: boolean;
	assets: AssetBalance[];
};

export const wallet = {
	balance(): Promise<WalletBalance> {
		return request<WalletBalance>("/api/wallet/balance", { auth: true });
	},

	/** Total withdrawable = claimable circle payouts + wallet, + per-circle list. */
	sajiBalance(): Promise<SajiBalance> {
		return request<SajiBalance>("/api/wallet/saji-balance", { auth: true });
	},

	/**
	 * The user's live circles (DB only, no RPC). The frontend reads each
	 * circle's claimable payout directly from chain — the backend's RPC read is
	 * blocked from the serve worker (DNS wall), so this avoids relying on it.
	 */
	myCircles(): Promise<{
		stellar_address: string | null;
		circles: {
			group_id: number;
			onchain_group_id: number;
			group_name: string;
			asset_code: string;
		}[];
	}> {
		return request("/api/wallet/my-circles", { auth: true });
	},

	/**
	 * Per-asset: what Saji has actually paid this user, split by WHERE it is now.
	 * Used to cap the "in your wallet" figure so the withdraw screen never offers
	 * to send funds Saji didn't pay. Pure DB + a contract read per circle.
	 *
	 * `owed` and `released_total` are opposites — see the route's header before
	 * using either.
	 */
	payoutSummary(): Promise<{
		assets: {
			asset_code: string;
			paid_total: string;
			/**
			 * Claimed OUT of escrow — so it has reached the user's wallet, unless
			 * they have since sent it elsewhere. Bound this against the live
			 * wallet balance; it is not proof the funds are still there.
			 */
			released_total: string;
			/** Still UNCLAIMED in the contract's escrow. */
			owed: string;
		}[];
	}> {
		return request("/api/wallet/payout-summary", { auth: true });
	},

	/**
	 * Log a withdrawal that was built + submitted CLIENT-SIDE (via Horizon),
	 * so it appears in history. The backend records the real on-chain hash.
	 */
	logWithdrawal(input: {
		/** Omitted when the contract call itself settled the transfer (a payout
		 *  claimed straight to the destination has no separate payment hash). */
		tx_hash?: string;
		amount: string | number;
		asset_code: string;
	}): Promise<Transaction> {
		return request<Transaction>("/api/wallet/withdraw/log", {
			method: "POST",
			body: input,
			auth: true,
		});
	},

	history(input?: {
		per_page?: number;
		page?: number;
	}): Promise<
		Paginated<
			Transaction & {
				/**
				 * Direction of the money. `type` reads "payout" for BOTH an incoming
				 * circle payout and an outgoing withdrawal, so label from this.
				 */
				kind: Transaction["type"] | "withdrawal";
				/** Decimal string, or null when the row has no resolvable amount. */
				amount: string | null;
			}
		>
	> {
		return request("/api/wallet/history", { auth: true, query: input });
	},
};

// ================================================================
// withdraw destinations
// ================================================================

export type WithdrawDestination = {
	id: number;
	user_id: number;
	stellar_address: string;
	memo: string | null;
	memo_type: "text" | "id" | "none";
	destination_label: string | null;
	is_primary: boolean;
};

type WithdrawDestinationInput = {
	stellar_address: string;
	memo?: string | null;
	memo_type?: "text" | "id" | "none";
	destination_label?: string | null;
	is_primary?: boolean;
};

export const withdrawInfo = {
	index(): Promise<WithdrawDestination[]> {
		return request<WithdrawDestination[]>("/api/withdraw-info", { auth: true });
	},

	store(input: WithdrawDestinationInput): Promise<WithdrawDestination> {
		return request("/api/withdraw-info", { method: "POST", body: input, auth: true });
	},

	update(id: number, input: WithdrawDestinationInput): Promise<WithdrawDestination> {
		return request(`/api/withdraw-info/${id}`, {
			method: "PATCH",
			body: input,
			auth: true,
		});
	},

	setPrimary(id: number): Promise<WithdrawDestination> {
		return request(`/api/withdraw-info/${id}/primary`, { method: "POST", auth: true });
	},

	destroy(id: number): Promise<{ message: string }> {
		return request(`/api/withdraw-info/${id}`, { method: "DELETE", auth: true });
	},
};

// ================================================================
// groups (rotating circles)
// ================================================================

export type Group = {
	id: number;
	name: string;
	description: string | null;
	photo_url: string | null;
	organizer_id: number;
	status: string;
	asset_code: string;
	contribution_amount: string;
	target_amount: string | null;
	contribution_frequency: string;
	current_cycle: number;
	/** When the current cycle is due to settle, or null if not scheduled. */
	next_payout_at?: string | null;
	// On-chain group id (null until the group is created on the contract).
	onchain_group_id?: number | null;
	// Group rules/settings (present on show()/index() payloads).
	group_type?: string;
	payout_order?: string;
	late_penalty?: string;
	// On-chain create params (present on show()) — needed to (re)create the group
	// on the contract if it wasn't linked at creation time.
	fee_bps?: number;
	late_fee_bps?: number;
	grace_period_hours?: number;
	cycle_length_seconds?: number;
	members_count?: number;
	member_count?: number;
	// Real per-cycle progress, present on index(). The card used to hardcode a
	// zero here, so every group rendered "$0 / $0" with an empty bar.
	/** Approved members only — pending requesters neither pay in nor receive. */
	approved_count?: number;
	/** The viewer's cumulative confirmed contributions, decimal string. */
	you_paid_total?: string;
	/** Whether the viewer has settled the current cycle. */
	you_paid_this_cycle?: boolean;
	/** Cycles in a full rotation — one turn per approved member. */
	total_cycles?: number;
	/** Commitment over the whole rotation: contribution × total_cycles. */
	your_aim?: string;
	/** A few real members for the avatar stack (max 4). */
	member_avatars?: { name: string; avatar_url: string | null }[];
	// Challenge (public circle) fields — present on /challenges items.
	circle_kind?: string;
	savings_target?: string | null;
	challenge_ends_at?: string | null;
	// Present on show(): members with their linked user (id/name/address).
	members?: {
		id: number;
		user_id: number;
		status: "pending" | "approved" | "removed";
		payout_position?: number | null;
		/** When the membership row was created — for a request, when they asked. */
		created_at?: string;
		user?: {
			id: number;
			name: string;
			stellar_address: string | null;
			avatar_url?: string | null;
		} | null;
	}[];
};

/** `GET /api/groups/{id}/dashboard` — the group's health snapshot. */
export type GroupDashboard = {
	group: {
		id: number;
		name: string;
		status: string;
		asset_code: string;
		contribution_amount: string;
		contract_address: string | null;
	};
	member_count: number;
	current_cycle: number;
	pool_balance: string;
	next_recipient_id: number | null;
	next_payout_at: string | null;
	/** Confirmed contributions this cycle, out of the approved members. */
	contribution_progress: { confirmed: number; total_members: number };
};

export type GroupMember = {
	id: number;
	group_id: number;
	user_id: number;
	status: "pending" | "approved";
	payout_position: number | null;
};

/** Public-safe group preview shown behind an invite link. */
export type GroupJoinPreview = {
	id: number;
	name: string;
	description: string | null;
	photo_url: string | null;
	target_amount: string | null;
	member_count: number;
	settings: {
		group_type: string;
		payout_order: string;
		contribution_amount: string;
		contribution_frequency: string;
		fee_bps: number;
		late_fee_bps: number;
		grace_period_hours: number;
		late_penalty: string;
		auto_approve_join: boolean;
	};
};

/** The Circle/Group page payload (real totals, progress, payout rotation). */
export type GroupCircle = {
	group: {
		id: number;
		name: string;
		status: string;
		asset_code: string;
		contribution_amount: string;
		contribution_frequency: string;
		target_amount: string | null;
		contract_address: string | null;
	};
	member_count: number;
	current_cycle: number;
	total_deposited: string;
	you_paid_this_cycle: boolean;
	user_progress: { paid: string; aim: string; percent: number };
	circle_progress: { cycles_done: number; cycles_total: number; percent: number };
	/** Server-resolved from the contract; null when the RPC was unavailable. */
	current_recipient_user_id: number | null;
	payout_rotation: {
		position: number;
		user_id: number;
		name: string | null;
		/**
		 * Null for OTHER members when the circle has `hide_balances` on — an
		 * address exposes that person's whole external wallet, not just their
		 * circle activity. Use `current_recipient_user_id` to label the rotation.
		 */
		stellar_address: string | null;
		avatar_url?: string | null;
		has_received_payout: boolean;
		removed?: boolean;
	}[];
	cycle_activity: {
		id: number;
		type: string;
		status: string;
		stellar_tx_hash: string | null;
		explorer_url: string | null;
		created_at: string;
	}[];
};

export type CreateGroupInput = {
	name: string;
	description?: string | null;
	photo_url?: string | null;
	asset_code?: string;
	contribution_amount: string | number;
	target_amount?: string | number | null;
	contribution_frequency: "daily" | "weekly" | "bi_weekly" | "monthly" | "custom";
	cycle_length_seconds?: number;
	fee_bps?: number;
	late_fee_bps?: number;
	grace_period_hours?: number;
	late_penalty?: "deduct_from_balance" | "remove_member";
	payout_order?: "random" | "manual" | "vote" | "custom";
	group_type?: "public" | "private";
	auto_approve_join?: boolean;
	hide_balances?: boolean;
};

export const groups = {
	index(): Promise<Group[]> {
		return request<Group[]>("/api/groups", { auth: true });
	},

	store(input: CreateGroupInput): Promise<{ group: Group }> {
		return request("/api/groups", { method: "POST", body: input, auth: true });
	},

	/**
	 * Record the on-chain group id after creating the group directly via the
	 * contract bindings (client-side signing). Links it to the DB row + marks live.
	 */
	recordOnchain(
		id: number,
		input: { onchain_group_id: number; tx_hash?: string },
	): Promise<{ onchain_group_id: number; status: string }> {
		return request(`/api/groups/${id}/onchain`, {
			method: "PATCH",
			body: input,
			auth: true,
		});
	},

	/** Mark the group active after the cycle is started on-chain (status sync). */
	activate(id: number): Promise<{ status: string; current_cycle: number }> {
		return request(`/api/groups/${id}/activate`, { method: "POST", auth: true });
	},

	show(id: number): Promise<Group> {
		return request<Group>(`/api/groups/${id}`, { auth: true });
	},

	circle(id: number): Promise<GroupCircle> {
		return request<GroupCircle>(`/api/groups/${id}/circle`, { auth: true });
	},

	/** Public-safe preview of a group behind an invite token. */
	joinPreviewTyped(token: string): Promise<GroupJoinPreview> {
		return request<GroupJoinPreview>(`/api/groups/join/${token}`, { auth: true });
	},

	uploadPhoto(id: number, file: File): Promise<{ photo_url: string }> {
		const form = new FormData();
		form.append("photo", file);
		return request(`/api/groups/${id}/photo`, { method: "POST", form, auth: true });
	},

	approve(groupId: number, memberId: number): Promise<{ member: GroupMember }> {
		return request(`/api/groups/${groupId}/members/${memberId}/approve`, {
			method: "POST",
			auth: true,
		});
	},

	/** Organizer declines a pending join request. */
	decline(groupId: number, memberId: number): Promise<{ message: string }> {
		return request(`/api/groups/${groupId}/members/${memberId}`, {
			method: "DELETE",
			auth: true,
		});
	},

	setPayoutOrder(id: number, memberIds: number[]): Promise<{ members: GroupMember[] }> {
		return request(`/api/groups/${id}/payout-order`, {
			method: "POST",
			body: { member_ids: memberIds },
			auth: true,
		});
	},

	inviteLink(id: number): Promise<{ invite_token: string; invite_url: string | null }> {
		return request(`/api/groups/${id}/invite-link`, { auth: true });
	},

	/** Preview a group by its invite token (public-safe fields). */
	joinPreview(token: string): Promise<unknown> {
		return request(`/api/groups/join/${token}`, { auth: true });
	},

	/** Join via invite token. */
	joinByToken(token: string): Promise<GroupMember> {
		return request<GroupMember>(`/api/groups/join/${token}`, {
			method: "POST",
			auth: true,
		});
	},

	/** Per-group dashboard (health snapshot). */
	dashboard(id: number): Promise<GroupDashboard> {
		return request(`/api/groups/${id}/dashboard`, { auth: true });
	},
};

// ================================================================
// contributions
// ================================================================

export type Contribution = {
	id: number;
	group_id: number;
	user_id: number;
	cycle: number;
	amount: string;
	status: "pending" | "confirmed";
};

export const contributions = {
	index(groupId: number): Promise<Contribution[]> {
		return request<Contribution[]>(`/api/groups/${groupId}/contributions`, { auth: true });
	},

	/**
	 * Record the intent to contribute for the current cycle.
	 *
	 * This does NOT move money and does NOT mark the contribution paid — the
	 * member's wallet signs `contribute` on-chain via the contract bindings, and
	 * the indexer flips the row to `confirmed` after reading the contract.
	 */
	store(groupId: number): Promise<{ contribution: Contribution }> {
		return request(`/api/groups/${groupId}/contributions`, {
			method: "POST",
			auth: true,
		});
	},

	/** Confirm an on-chain-settled contribution (flips pending → confirmed). */
	confirm(groupId: number, tx_hash?: string): Promise<Contribution> {
		return request<Contribution>(
			`/api/groups/${groupId}/contributions/confirm`,
			{ method: "POST", body: { tx_hash }, auth: true },
		);
	},
};

// ================================================================
// challenges (public savings circles)
// ================================================================

export const challenges = {
	index(input?: { q?: string; per_page?: number }): Promise<Paginated<Group>> {
		return request("/api/challenges", { auth: true, query: input });
	},

	store(input: {
		name: string;
		description?: string | null;
		photo_url?: string | null;
		asset_code?: string;
		savings_target: string | number;
		challenge_ends_at?: string | null;
	}): Promise<Group> {
		return request<Group>("/api/challenges", { method: "POST", body: input, auth: true });
	},

	join(groupId: number): Promise<GroupMember> {
		return request<GroupMember>(`/api/challenges/${groupId}/join`, {
			method: "POST",
			auth: true,
		});
	},

	leave(groupId: number): Promise<{ message: string }> {
		return request(`/api/challenges/${groupId}/leave`, { method: "POST", auth: true });
	},

	summary(groupId: number): Promise<{
		group: {
			id: number;
			name: string;
			asset_code: string;
			savings_target: string;
			challenge_ends_at: string | null;
		};
		member_count: number;
		group_saved_total: string;
		members_reached_target: number;
		hide_balances: boolean;
		leaderboard:
			| { user_id: number; name: string | null; saved: string; percent: number }[]
			| null;
	}> {
		return request(`/api/challenges/${groupId}/summary`, { auth: true });
	},

	myProgress(groupId: number): Promise<{
		group_id: number;
		saved: string;
		target: string;
		percent: number;
		reached: boolean;
		challenge_ends_at: string | null;
	}> {
		return request(`/api/challenges/${groupId}/progress`, { auth: true });
	},

	/** Record a save toward the target (backed by an on-chain tx hash). */
	deposit(groupId: number, input: { amount: string | number; stellar_tx_hash: string }): Promise<unknown> {
		return request(`/api/challenges/${groupId}/deposit`, {
			method: "POST",
			body: input,
			auth: true,
		});
	},
};

// ================================================================
// transactions
// ================================================================

export type Transaction = {
	id: number;
	user_id: number;
	group_id: number | null;
	type: "create_group" | "join" | "contribution" | "payout" | "other";
	status: "pending" | "success" | "failed";
	stellar_tx_hash: string | null;
	explorer_url: string | null;
	created_at: string;
	group?: GroupRef | null;
};

export const transactions = {
	index(input?: {
		type?: Transaction["type"];
		status?: Transaction["status"];
		q?: string;
		per_page?: number;
	}): Promise<Paginated<Transaction>> {
		return request("/api/transactions", { auth: true, query: input });
	},

	show(id: number): Promise<{
		id: number;
		type: Transaction["type"];
		status: Transaction["status"];
		amount: string | null;
		group: GroupRef | null;
		transaction_no: string | null;
		explorer_url: string | null;
		date_time: string;
	}> {
		return request(`/api/transactions/${id}`, { auth: true });
	},

	/** Download a statement (PDF or CSV) as a Blob. */
	statement(input?: {
		file_type?: "pdf" | "csv";
		start_date?: string;
		end_date?: string;
	}): Promise<Blob> {
		return downloadFile("/api/transactions/statement", input);
	},
};

// ================================================================
// activity feed
// ================================================================

export type ActivityRow = {
	id: number;
	type: Transaction["type"];
	/**
	 * Direction of the money. `type` is `"payout"` for BOTH an incoming circle
	 * payout and an outgoing withdrawal, so label from this instead: it is
	 * `"withdrawal"` for money leaving, otherwise the same value as `type`.
	 */
	kind: Transaction["type"] | "withdrawal";
	status: Transaction["status"];
	group: GroupRef | null;
	amount: string | null;
	stellar_tx_hash: string | null;
	explorer_url: string | null;
	created_at: string;
};

export const activity = {
	index(input?: {
		filter?: "all" | "contributions" | "payout" | "withdrawal";
		per_page?: number;
		page?: number;
	}): Promise<Paginated<ActivityRow>> {
		return request("/api/activity", { auth: true, query: input });
	},
};

// ================================================================
// notifications
// ================================================================

export type NotificationType =
	| "join_requested"
	| "join_approved"
	| "contribution_confirmed"
	| "payout_received"
	| "withdrawal_sent"
	| "circle_completed";

export type NotificationRow = {
	id: number;
	type: NotificationType;
	title: string;
	body: string;
	/** Relative in-app path to open, or null. */
	href: string | null;
	meta: Record<string, unknown> | null;
	/** Null while unread. */
	read_at: string | null;
	created_at: string;
};

export const notifications = {
	index(input?: {
		unread?: boolean;
		per_page?: number;
		page?: number;
	}): Promise<Paginated<NotificationRow> & { unread_count: number }> {
		return request("/api/notifications", {
			auth: true,
			query: input && {
				...input,
				// Query values serialise as strings; the route parses "true"/"false".
				unread: input.unread === undefined ? undefined : String(input.unread),
			},
		});
	},

	/** Mark specific notifications read, or all of them. */
	markRead(
		input: { ids: number[] } | { all: true },
	): Promise<{ marked: number; unread_count: number }> {
		return request("/api/notifications/read", {
			method: "POST",
			body: input,
			auth: true,
		});
	},

	/**
	 * Short-lived Supabase JWT for the Realtime subscription.
	 *
	 * `enabled: false` means Realtime is not configured — callers must treat
	 * that as "fall back to refreshing on focus", not as an error.
	 */
	realtimeToken(): Promise<
		| { enabled: false }
		| { enabled: true; token: string; user_id: string; expires_in: number }
	> {
		return request("/api/notifications/realtime-token", { auth: true });
	},
};

// ================================================================
// governance (MVP 2 — proposals, votes, defaults)
// ================================================================
//
// Shape agreed in MVP2-PLAN.md. The mock layer serves it today; the real
// routes land with the governance contract. Until then these 404 against the
// real backend, and the screens that use them hide their governance parts.

export type ProposalStatus = "voting" | "approved" | "rejected" | "executed" | "expired";

export type ProposalAction = "pause" | "resume" | "payout_schedule" | "recovery";

/** A missed contribution recorded on-chain. */
export type MissedContribution = {
	id: number;
	group_id: number;
	member: { id: number; name: string; avatar_url: string | null };
	/** 0-based cycle index. */
	cycle: number;
	amount: string;
	asset_code: string;
	deadline: string;
	recorded_at: string;
	status: "open" | "resolved";
	/** The recovery proposal deciding it, if one has been raised. */
	proposal_id: number | null;
	resolved_at: string | null;
	/** When the held-up cycle was due to pay out. */
	payout_due_at: string | null;
	tx_hash: string;
	explorer_url: string;
};

export type RecoveryOption = "extend_deadline" | "cover_from_reserve";

export type Proposal = {
	id: number;
	group_id: number;
	kind: "governance" | "recovery";
	title: string;
	description: string | null;
	action: ProposalAction;
	status: ProposalStatus;
	created_by: { id: number; name: string };
	created_at: string;
	voting_ends_at: string;
	executed_at: string | null;
	approvals: number;
	rejections: number;
	/** Approvals needed to pass. */
	threshold: number;
	/** Members entitled to vote. */
	eligible_voters: number;
	/** Members who have voted either way. */
	votes_cast: number;
	/** A few voters' faces for the avatar stack. */
	voters: { name: string; avatar_url: string | null }[];
	my_vote: "approve" | "reject" | null;
	/** False for a member with an open default — they can't vote on their own recovery. */
	can_vote: boolean;
	/** Recovery proposals only. */
	recovery: {
		option: RecoveryOption;
		extension_days: number;
		new_deadline: string;
		default: MissedContribution;
	} | null;
	/** The on-chain transaction that created (and later settled) the proposal. */
	tx_hash: string | null;
	explorer_url: string | null;
};

export type GovernanceSummary = {
	/** The group's governance state: running, paused by a vote, or held for recovery. */
	status: "active" | "paused" | "recovery" | string;
	/** Proposals still open for votes, newest first. */
	open_proposals: Proposal[];
	/** Every proposal ever raised in the group. */
	proposals_total: number;
	/** Missed contributions recorded on-chain this cycle. */
	defaults_recorded: number;
	/** The unresolved missed contribution holding the cycle, if any. */
	open_default: MissedContribution | null;
	/** Approval threshold, as a percentage of eligible voters. */
	threshold_pct: number;
	/** Approvals a proposal needs right now. */
	threshold: number;
	eligible_voters: number;
	/** Paused or in recovery: contributions and payouts are on hold. */
	on_hold: boolean;
};

export type GovernanceEvent = {
	id: string;
	kind: "governance" | "recovery";
	type:
		| "proposal_created"
		| "vote_recorded"
		| "proposal_approved"
		| "proposal_executed"
		| "proposal_rejected"
		| "default_recorded";
	title: string;
	body: string;
	created_at: string;
	explorer_url: string | null;
	proposal_id: number | null;
};

export const governance = {
	summary(groupId: number): Promise<GovernanceSummary> {
		return request(`/api/groups/${groupId}/governance`, { auth: true });
	},

	proposals(groupId: number): Promise<Proposal[]> {
		return request(`/api/groups/${groupId}/proposals`, { auth: true });
	},

	proposal(groupId: number, proposalId: number): Promise<Proposal> {
		return request(`/api/groups/${groupId}/proposals/${proposalId}`, { auth: true });
	},

	create(
		groupId: number,
		input: { action: Exclude<ProposalAction, "recovery">; title: string; description?: string | null },
	): Promise<Proposal> {
		return request(`/api/groups/${groupId}/proposals`, {
			method: "POST",
			body: input,
			auth: true,
		});
	},

	defaults(groupId: number): Promise<MissedContribution[]> {
		return request(`/api/groups/${groupId}/defaults`, { auth: true });
	},

	/** Open a recovery vote for a missed contribution. */
	startRecovery(
		groupId: number,
		input: {
			default_id: number;
			option: RecoveryOption;
			extension_days?: number;
			rationale?: string | null;
		},
	): Promise<Proposal> {
		return request(`/api/groups/${groupId}/recovery`, {
			method: "POST",
			body: input,
			auth: true,
		});
	},

	history(
		groupId: number,
		kind?: "governance" | "recovery",
	): Promise<{ active: Proposal[]; events: GovernanceEvent[] }> {
		return request(`/api/groups/${groupId}/history`, { auth: true, query: { kind } });
	},

	/** Cast a vote. Final — a member votes once per proposal. */
	vote(groupId: number, proposalId: number, choice: "approve" | "reject"): Promise<Proposal> {
		return request(`/api/groups/${groupId}/proposals/${proposalId}/vote`, {
			method: "POST",
			body: { choice },
			auth: true,
		});
	},
};

// ================================================================
// user home dashboard
// ================================================================

export type DashboardCircle = {
	id: number;
	name: string;
	status: string;
	asset_code: string;
	contribution_amount: string;
	member_count: number;
	current_cycle: number;
	contributed_this_cycle: boolean;
};

export type QuickDeposit = {
	group_id: number;
	group_name: string;
	amount: string;
	asset_code: string;
	cycle: number;
	due_at: string | null;
	contribute_endpoint: string;
};

/** One asset's worth of money still in play across the user's circles. */
export type SavedAsset = {
	asset_code: string;
	saved: string;
};

export type DashboardData = {
	/**
	 * The LARGEST single asset's saved figure — a real amount in a real
	 * currency, never a cross-currency sum. A circle saves in exactly one token,
	 * so a user in several circles can hold several currencies; use `assets` for
	 * the full picture and treat this only as the headline.
	 */
	saved_balance: string;
	/** The asset `saved_balance` is denominated in. */
	asset_code: string;
	/** Every asset with money in play, largest first. Empty when nothing saved. */
	assets: SavedAsset[];
	/** Distinct OTHER people the user saves with, across all their circles. */
	people_total: number;
	circles: DashboardCircle[];
	circles_total: number;
	has_more_circles: boolean;
	quick_deposit: QuickDeposit | null;
};

export const dashboard = {
	show(): Promise<DashboardData> {
		return request<DashboardData>("/api/dashboard", { auth: true });
	},
};
