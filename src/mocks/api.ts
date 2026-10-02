/**
 * Mock API: answers every `/api/*` call the frontend makes, from the in-memory
 * store in `./db`.
 *
 * Each handler mirrors the real route in `src/app/api/` — same response shape,
 * same status codes, same `{ message, errors }` validation errors — so the UI
 * built against it should work unchanged once the backend is reattached. When
 * a screen needs a new endpoint, add a route to `routes` below.
 */

import {
	type MockGroup,
	type MockDefault,
	type MockProposal,
	type MockMember,
	type MockTransaction,
	db,
	explorerUrl,
	fakeHash,
	groupById,
	groupByOnchainId,
	makeGroup,
	me,
	membershipOf,
	money,
	nextId,
	nowIso,
	publicUser,
	serializeGroup,
	serializeMember,
	serializeTransaction,
	stroops,
	transactionAmount,
	transactionKind,
	userByAddress,
	userById,
} from "./db";
import { challengeBalance, currentRecipient, scheduleFor } from "./chain";

/** Simulated network latency, so loading states are visible. */
const LATENCY_MS = 300;

export type MockResponse = { status: number; data: unknown };

type Ctx = {
	params: Record<string, string>;
	query: Record<string, string>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	body: any;
	form?: FormData;
};

type Handler = (ctx: Ctx) => unknown;

class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly errors?: Record<string, string[]>,
	) {
		super(message);
	}
}

/** Lets a handler pick a non-200 status, e.g. 201 on create. */
class WithStatus {
	constructor(
		readonly status: number,
		readonly data: unknown,
	) {}
}
const created = (data: unknown) => new WithStatus(201, data);

const invalid = (errors: Record<string, string[]>) =>
	new HttpError(422, "The given data was invalid.", errors);
const notFound = (what: string) => new HttpError(404, `${what} not found.`);
const forbidden = (message = "This action is unauthorized.") => new HttpError(403, message);

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const DECIMAL = /^\d+(\.\d{1,7})?$/;

function meId(): string {
	return me().id;
}

function findGroup(id: string): MockGroup {
	const group = groupById(id);
	if (!group) throw notFound("Group");
	return group;
}

function assertOrganizer(group: MockGroup): void {
	if (group.organizer_id !== meId()) throw forbidden("Only the organizer can do that.");
}

function viewership(group: MockGroup): "organizer" | "member" | "pending" | "viewer" | "none" {
	if (group.organizer_id === meId()) return "organizer";
	const m = membershipOf(group.id, meId());
	if (m?.status === "approved") return "member";
	if (m?.status === "pending") return "pending";
	if (group.circle_kind === "challenge" || group.group_type === "public") return "viewer";
	return "none";
}

/** `assertVisible` — 404, not 403, so ids can't be probed. */
function assertVisible(group: MockGroup): void {
	if (viewership(group) === "none") throw notFound("Group");
}

function assertApprovedMember(group: MockGroup): void {
	if (membershipOf(group.id, meId())?.status !== "approved") {
		throw forbidden("You are not an approved member of this group.");
	}
}

function assertNotPending(group: MockGroup): void {
	if (viewership(group) === "pending") {
		throw forbidden(
			"Your request to join is still pending. You'll see the circle's activity once the organizer approves you.",
		);
	}
}

const approvedMembers = (groupId: string) =>
	db.members
		.filter((m) => m.group_id === groupId && m.status === "approved")
		.sort((a, b) => (a.payout_position ?? 99) - (b.payout_position ?? 99));

const nextPosition = (groupId: string) =>
	Math.max(0, ...db.members.filter((m) => m.group_id === groupId).map((m) => m.payout_position ?? 0)) + 1;

function paginate<T>(rows: T[], query: Record<string, string>, defaultPerPage = 20) {
	const perPage = Math.max(1, Number(query.per_page ?? defaultPerPage));
	const page = Math.max(1, Number(query.page ?? 1));
	return {
		data: rows.slice((page - 1) * perPage, page * perPage),
		current_page: page,
		per_page: perPage,
		total: rows.length,
		last_page: Math.max(1, Math.ceil(rows.length / perPage)),
	};
}

const newestFirst = <T extends { created_at: string }>(rows: T[]) =>
	[...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));

const myTransactions = () =>
	newestFirst(db.transactions.filter((t) => t.user_id === meId()));

function sumConfirmed(groupId: string, userId?: string, cycle?: number): bigint {
	return db.contributions
		.filter(
			(c) =>
				c.group_id === groupId &&
				c.status === "confirmed" &&
				(userId === undefined || c.user_id === userId) &&
				(cycle === undefined || c.cycle === cycle),
		)
		.reduce((sum, c) => sum + stroops(c.amount), 0n);
}

function percentOf(saved: bigint, target: bigint): number {
	if (target <= 0n) return 0;
	return Math.min(100, Number((saved * 10_000n) / target) / 100);
}

/**
 * What the indexer does after an on-chain action: mirror status, cycle and the
 * member roster from the mock chain into the group's DB rows.
 */
function reconcile(group: MockGroup): void {
	if (!group.onchain_group_id) return;
	const cg = db.chainGroups.get(group.onchain_group_id);
	if (!cg) return;

	const statuses = ["draft", "open", "active", "completed"] as const;
	group.status = statuses[cg.status] ?? "open";
	group.current_cycle = cg.cycle;
	if (cg.status === 2 && !group.next_payout_at) group.next_payout_at = scheduleFor(cg);
	const next = currentRecipient(cg);
	group.next_recipient_id = next ? (userByAddress(next)?.id ?? null) : null;

	cg.members.forEach((addr, index) => {
		const user = userByAddress(addr);
		if (!user) return;
		const status = cg.removed.has(addr) ? "removed" : "approved";
		const existing = membershipOf(group.id, user.id);
		if (existing) {
			existing.status = status;
			existing.payout_position = index + 1;
		} else {
			db.members.push({
				id: nextId(),
				group_id: group.id,
				user_id: user.id,
				status,
				payout_position: index + 1,
				has_received_payout: cg.received.has(addr),
				joined_at: nowIso(),
				created_at: nowIso(),
				updated_at: nowIso(),
			});
		}
	});
}

function groupWithCount(group: MockGroup) {
	const approved = approvedMembers(group.id);
	const paidThisCycle = db.contributions.some(
		(c) =>
			c.group_id === group.id &&
			c.user_id === meId() &&
			c.cycle === group.current_cycle &&
			c.status === "confirmed",
	);

	return {
		...serializeGroup(group),
		members_count: db.members.filter((m) => m.group_id === group.id).length,
		approved_count: approved.length,
		member_avatars: approved.slice(0, 4).map((m) => {
			const u = userById(m.user_id);
			return { name: u?.name ?? "", avatar_url: u?.avatar_url ?? null };
		}),
		you_paid_total: money(sumConfirmed(group.id, meId())),
		you_paid_this_cycle: paidThisCycle,
		total_cycles: approved.length,
		your_aim: money(stroops(group.contribution_amount) * BigInt(approved.length)),
	};
}

function membersWithUsers(groupId: string) {
	return db.members
		.filter((m) => m.group_id === groupId)
		.sort(
			(a, b) =>
				(a.payout_position ?? 999) - (b.payout_position ?? 999) ||
				a.created_at.localeCompare(b.created_at),
		)
		.map((m) => serializeMember(m, true));
}

function notify(
	userId: string,
	type: (typeof db.notifications)[number]["type"],
	title: string,
	body: string,
	href: string | null,
	meta: Record<string, unknown> | null = null,
) {
	db.notifications.unshift({
		id: nextId(),
		user_id: userId,
		type,
		title,
		body,
		href,
		meta,
		read_at: null,
		created_at: nowIso(),
	});
}

function profileDetails() {
	const u = me();
	return {
		id: u.id,
		name: u.name,
		tag_name: u.tag_name,
		email: u.email,
		avatar_url: u.avatar_url,
		stellar_address: u.stellar_address,
		date_of_birth: u.date_of_birth,
		gender: u.gender,
		address: u.address,
		has_password: u.has_password,
		is_google_linked: u.is_google_linked,
		security: {
			twofa_on_suspicious_withdrawal: u.twofa_on_suspicious_withdrawal,
			lock_after_failed_attempts: u.lock_after_failed_attempts,
		},
	};
}

/** Groups you belong to (approved) that are live on the mock chain. */
function myLiveCircles(): MockGroup[] {
	return db.groups.filter(
		(g) => g.onchain_group_id !== null && membershipOf(g.id, meId())?.status === "approved",
	);
}

function claimableFor(group: MockGroup): bigint {
	const addr = me().stellar_address;
	if (!addr || !group.onchain_group_id) return 0n;
	return db.chainGroups.get(group.onchain_group_id)?.claimable.get(addr) ?? 0n;
}

function activityRow(t: MockTransaction) {
	const g = t.group_id ? groupById(t.group_id) : undefined;
	return {
		id: t.id,
		type: t.type,
		kind: transactionKind(t),
		status: t.status,
		group: g ? { id: g.id, name: g.name } : null,
		amount: transactionAmount(t),
		stellar_tx_hash: t.stellar_tx_hash,
		explorer_url: t.explorer_url,
		created_at: t.created_at,
	};
}

const issuedToken = () => `mock-token-${Date.now()}`;

// ---------------------------------------------------------------------------
// governance + recovery (MVP 2) — rules from MVP2-PLAN.md
// ---------------------------------------------------------------------------

/** Voting windows: 72h for governance (decision 4), 48h for recovery (p9 design). */
const VOTING_HOURS = { governance: 72, recovery: 48 } as const;

function openDefault(groupId: string): MockDefault | undefined {
	return db.defaults.find((d) => d.group_id === groupId && d.status === "open");
}

/**
 * Who may vote: approved members, minus anyone with an open default — a member
 * can't vote on their own recovery (decision 2).
 */
function eligibleVoters(groupId: string): string[] {
	const defaulters = new Set(
		db.defaults.filter((d) => d.group_id === groupId && d.status === "open").map((d) => d.user_id),
	);
	return approvedMembers(groupId)
		.map((m) => m.user_id)
		.filter((id) => !defaulters.has(id));
}

/** Approvals a proposal in this group needs: the threshold share of voters. */
function thresholdFor(groupId: string): { threshold: number; eligible: number; pct: number } {
	const eligible = eligibleVoters(groupId).length;
	const pct = db.thresholdPct[groupId] ?? 60;
	return { threshold: Math.max(1, Math.ceil((eligible * pct) / 100)), eligible, pct };
}

/** Active, paused by a vote, or held for recovery. */
function governanceStatus(g: MockGroup): string {
	if (openDefault(g.id)) return "recovery";
	if (db.paused[g.id]) return "paused";
	return g.status;
}

function serializeDefault(d: MockDefault) {
	const g = groupById(d.group_id);
	const u = userById(d.user_id);
	return {
		id: d.id,
		group_id: d.group_id,
		member: { id: d.user_id, name: u?.name ?? "A member", avatar_url: u?.avatar_url ?? null },
		cycle: d.cycle,
		amount: d.amount,
		asset_code: g?.asset_code ?? "USDC",
		deadline: d.deadline,
		recorded_at: d.recorded_at,
		status: d.status,
		proposal_id: d.proposal_id,
		resolved_at: d.resolved_at,
		/** When the cycle this default holds up was due to pay out. */
		payout_due_at: g?.next_payout_at ?? null,
		tx_hash: d.tx_hash,
		explorer_url: d.explorer_url,
	};
}

function serializeProposal(p: MockProposal) {
	const { threshold, eligible } = thresholdFor(p.group_id);
	const approvals = p.votes.filter((v) => v.choice === "approve");
	const defaultRow = p.recovery
		? db.defaults.find((d) => d.id === p.recovery!.default_id)
		: undefined;
	return {
		id: p.id,
		group_id: p.group_id,
		kind: p.kind,
		title: p.title,
		description: p.description,
		action: p.action,
		status: p.status,
		created_by: { id: p.created_by, name: userById(p.created_by)?.name ?? "A member" },
		created_at: p.created_at,
		voting_ends_at: p.voting_ends_at,
		executed_at: p.executed_at,
		approvals: approvals.length,
		rejections: p.votes.length - approvals.length,
		votes_cast: p.votes.length,
		threshold,
		eligible_voters: eligible,
		voters: p.votes.slice(0, 3).map((v) => {
			const u = userById(v.user_id);
			return { name: u?.name ?? "", avatar_url: u?.avatar_url ?? null };
		}),
		my_vote: p.votes.find((v) => v.user_id === meId())?.choice ?? null,
		can_vote: eligibleVoters(p.group_id).includes(meId()),
		recovery:
			p.recovery && defaultRow
				? {
						option: p.recovery.option,
						extension_days: p.recovery.extension_days,
						new_deadline: new Date(
							new Date(defaultRow.deadline).getTime() +
								p.recovery.extension_days * 86_400_000,
						).toISOString(),
						default: serializeDefault(defaultRow),
					}
				: null,
		tx_hash: p.tx_hash,
		explorer_url: p.explorer_url,
	};
}

/** Carry out an approved proposal, as the contract's `execute` will. */
function execute(p: MockProposal): void {
	p.status = "executed";
	p.executed_at = nowIso();
	const hash = fakeHash();
	p.tx_hash = hash;
	p.explorer_url = explorerUrl(hash);

	if (p.action === "pause") db.paused[p.group_id] = true;
	if (p.action === "resume") db.paused[p.group_id] = false;
	if (p.recovery) {
		const d = db.defaults.find((x) => x.id === p.recovery!.default_id);
		if (d) {
			d.status = "resolved";
			d.resolved_at = nowIso();
		}
	}
}

/** A voting proposal whose window has closed is settled on read. */
function settleExpired(groupId: string): void {
	const { threshold } = thresholdFor(groupId);
	for (const p of db.proposals) {
		if (p.group_id !== groupId || p.status !== "voting") continue;
		if (new Date(p.voting_ends_at).getTime() > Date.now()) continue;
		const approvals = p.votes.filter((v) => v.choice === "approve").length;
		if (approvals >= threshold) execute(p);
		else p.status = "expired";
	}
}

type HistoryEvent = {
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
	proposal_id: string | null;
};

/** The group's decision history, derived from proposals and defaults. */
function historyFor(groupId: string): HistoryEvent[] {
	const events: HistoryEvent[] = [];
	const name = (id: string) => userById(id)?.name.split(" ")[0] ?? "A member";
	const g = groupById(groupId);

	for (const p of db.proposals.filter((x) => x.group_id === groupId)) {
		const recovery = p.kind === "recovery";
		events.push({
			id: `${p.id}-created`,
			kind: p.kind,
			type: "proposal_created",
			title: recovery ? "Recovery proposal created" : "Proposal created",
			body: `${name(p.created_by)} proposed: ${p.title}.`,
			created_at: p.created_at,
			explorer_url: null,
			proposal_id: p.id,
		});
		for (const v of p.votes.filter((x) => x.user_id === meId())) {
			events.push({
				id: `${p.id}-vote`,
				kind: p.kind,
				type: "vote_recorded",
				title: "Vote recorded",
				body: `You voted ${v.choice === "approve" ? "For" : "Against"} "${p.title}".`,
				created_at: v.at,
				explorer_url: null,
				proposal_id: p.id,
			});
		}
		const approvals = p.votes.filter((v) => v.choice === "approve").length;
		if (p.status === "executed" && p.executed_at) {
			events.push({
				id: `${p.id}-approved`,
				kind: p.kind,
				type: "proposal_approved",
				title: recovery ? "Recovery proposal approved" : "Proposal approved",
				body: `${approvals} members voted For — the threshold was reached.`,
				created_at: p.executed_at,
				explorer_url: null,
				proposal_id: p.id,
			});
			events.push({
				id: `${p.id}-executed`,
				kind: p.kind,
				type: "proposal_executed",
				title: recovery ? "Recovery action executed" : "Proposal executed",
				body: recovery ? `${p.title}. The cycle resumed.` : `${p.title}.`,
				created_at: new Date(new Date(p.executed_at).getTime() + 60_000).toISOString(),
				explorer_url: p.explorer_url,
				proposal_id: p.id,
			});
		}
		if (p.status === "rejected" || p.status === "expired") {
			events.push({
				id: `${p.id}-closed`,
				kind: p.kind,
				type: "proposal_rejected",
				title: p.status === "rejected" ? "Proposal rejected" : "Proposal expired",
				body: `"${p.title}" didn't reach the approval threshold.`,
				created_at: p.voting_ends_at,
				explorer_url: null,
				proposal_id: p.id,
			});
		}
	}

	for (const d of db.defaults.filter((x) => x.group_id === groupId)) {
		events.push({
			id: `${d.id}-default`,
			kind: "recovery",
			type: "default_recorded",
			title: "Default recorded",
			body: `${name(d.user_id)}'s ${Number(d.amount).toLocaleString()} ${g?.asset_code ?? ""} contribution missed its deadline.`,
			created_at: d.recorded_at,
			explorer_url: d.explorer_url,
			proposal_id: null,
		});
	}

	return events.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

const routes: [string, string, Handler][] = [
	// ---- auth ----------------------------------------------------------------
	["POST", "/api/auth/register/start", () => ({
		message: "If that address can be registered, a code has been sent.",
		expires_in_minutes: 10,
	})],

	// Any 4 digits work, except 0000 — use it to see the error state.
	["POST", "/api/auth/register/verify-otp", ({ body }) => {
		if (!/^\d{4}$/.test(body?.otp ?? "")) throw invalid({ otp: ["The otp must be 4 digits."] });
		if (body.otp === "0000") throw invalid({ otp: ["That code is invalid or has expired."] });
		return { message: "Email verified.", signup_token: "mock-signup-token" };
	}],

	["POST", "/api/auth/register/complete-profile", ({ body }) => {
		const u = me();
		if (body?.name) u.name = body.name;
		if (body?.tag_name) u.tag_name = body.tag_name;
		return created({ user: publicUser(u), token: issuedToken() });
	}],

	// Any credentials work, except the password "wrong" — use it to see the error state.
	["POST", "/api/auth/login", ({ body }) => {
		if (!body?.email || !body?.password) {
			throw invalid({ email: ["The email field is required."] });
		}
		if (body.password === "wrong") {
			throw invalid({ email: ["The provided credentials are incorrect."] });
		}
		return { user: publicUser(me()), token: issuedToken() };
	}],

	["POST", "/api/auth/google/exchange", () => ({ token: issuedToken() })],
	["GET", "/api/auth/me", () => publicUser(me())],
	["POST", "/api/auth/logout", () => ({ message: "Logged out." })],

	// ---- profile -------------------------------------------------------------
	["GET", "/api/profile", () => profileDetails()],

	["PATCH", "/api/profile", ({ body }) => {
		const u = me();
		if (body.tag_name !== undefined) {
			const taken = db.users.find((x) => x.tag_name === body.tag_name && x.id !== u.id);
			if (taken) throw invalid({ tag_name: ["That tag name is already taken."] });
			u.tag_name = body.tag_name;
		}
		for (const key of ["name", "date_of_birth", "gender", "address"] as const) {
			if (body[key] !== undefined) (u as Record<string, unknown>)[key] = body[key];
		}
		u.updated_at = nowIso();
		return {
			id: u.id,
			name: u.name,
			tag_name: u.tag_name,
			email: u.email,
			avatar_url: u.avatar_url,
			stellar_address: u.stellar_address,
			date_of_birth: u.date_of_birth,
			gender: u.gender,
			address: u.address,
		};
	}],

	["POST", "/api/profile/avatar", ({ form }) => {
		const file = form?.get("avatar");
		if (!(file instanceof File)) throw invalid({ avatar: ["The avatar field is required."] });
		me().avatar_url = URL.createObjectURL(file);
		return { avatar_url: me().avatar_url };
	}],

	["POST", "/api/profile/password", ({ body }) => {
		if (!body?.password || body.password.length < 8) {
			throw invalid({ password: ["The password must be at least 8 characters."] });
		}
		if (me().has_password && body.current_password === "wrong") {
			throw invalid({ current_password: ["The current password is incorrect."] });
		}
		me().has_password = true;
		return { message: "Password updated." };
	}],

	["PATCH", "/api/profile/security", ({ body }) => {
		const u = me();
		if (body.twofa_on_suspicious_withdrawal !== undefined) {
			u.twofa_on_suspicious_withdrawal = body.twofa_on_suspicious_withdrawal;
		}
		if (body.lock_after_failed_attempts !== undefined) {
			u.lock_after_failed_attempts = body.lock_after_failed_attempts;
		}
		return {
			twofa_on_suspicious_withdrawal: u.twofa_on_suspicious_withdrawal,
			lock_after_failed_attempts: u.lock_after_failed_attempts,
		};
	}],

	["POST", "/api/profile/wallet/challenge", ({ body }) => {
		if (!STELLAR_ADDRESS.test(body?.stellar_address ?? "")) {
			throw invalid({ stellar_address: ["That is not a valid Stellar public address."] });
		}
		return { unsigned_xdr: `mock-challenge:${body.stellar_address}` };
	}],

	["PATCH", "/api/profile/wallet", ({ body }) => {
		const address: string | null = body?.stellar_address ?? null;
		if (address) {
			const taken = db.users.find((x) => x.stellar_address === address && x.id !== meId());
			if (taken) {
				throw invalid({ stellar_address: ["That wallet is already linked to another account."] });
			}
		}
		me().stellar_address = address;
		return { stellar_address: address, linked: Boolean(address) };
	}],

	// ---- wallet --------------------------------------------------------------
	["GET", "/api/wallet/balance", () => {
		const addr = me().stellar_address;
		if (!addr) return { linked: false, stellar_address: null, amount: null, asset_code: "USDC" };
		return {
			linked: true,
			stellar_address: addr,
			amount: money(stroops((db.walletBalances.USDC ?? 0).toFixed(7))),
			asset_code: "USDC",
		};
	}],

	["GET", "/api/wallet/saji-balance", () => {
		if (!me().stellar_address) return { linked: false, assets: [] };
		const assets = ["XLM", "USDC", "USDT"].map((code) => {
			const wallet = stroops((db.walletBalances[code] ?? 0).toFixed(7));
			const claimables = myLiveCircles()
				.filter((g) => g.asset_code === code)
				.map((g) => ({ group: g, amount: claimableFor(g) }))
				.filter((c) => c.amount > 0n)
				.map(({ group, amount }) => ({
					group_id: group.id,
					onchain_group_id: group.onchain_group_id,
					group_name: group.name,
					asset_code: code,
					amount: money(amount),
				}));
			const claimableTotal = claimables.reduce((s, c) => s + stroops(c.amount), 0n);
			return {
				asset_code: code,
				wallet_amount: money(wallet),
				claimable_total: money(claimableTotal),
				total: money(wallet + claimableTotal),
				claimables,
			};
		});
		return { linked: true, assets };
	}],

	["GET", "/api/wallet/my-circles", () => ({
		stellar_address: me().stellar_address,
		circles: myLiveCircles().map((g) => ({
			group_id: g.id,
			onchain_group_id: g.onchain_group_id,
			group_name: g.name,
			asset_code: g.asset_code,
		})),
	})],

	["GET", "/api/wallet/payout-summary", () => {
		if (!me().stellar_address) return { assets: [] };
		const paid = new Map<string, bigint>();
		const owed = new Map<string, bigint>();
		for (const p of db.payouts.filter((x) => x.recipient_id === meId())) {
			const g = groupById(p.group_id);
			if (!g) continue;
			paid.set(g.asset_code, (paid.get(g.asset_code) ?? 0n) + stroops(p.net_amount));
		}
		for (const g of myLiveCircles()) {
			owed.set(g.asset_code, (owed.get(g.asset_code) ?? 0n) + claimableFor(g));
		}
		return {
			assets: [...paid.entries()].map(([code, total]) => {
				const stillOwed = owed.get(code) ?? 0n;
				return {
					asset_code: code,
					paid_total: money(total),
					released_total: money(total - stillOwed),
					owed: money(stillOwed),
				};
			}),
		};
	}],

	["POST", "/api/wallet/withdraw/log", ({ body }) => {
		const hash: string | null = body?.tx_hash ?? null;
		const t: MockTransaction = {
			id: nextId(),
			group_id: null,
			user_id: meId(),
			type: "payout",
			subject_type: null,
			subject_id: null,
			stellar_tx_hash: hash,
			status: "success",
			explorer_url: hash ? explorerUrl(hash) : null,
			meta: {
				kind: "withdrawal",
				amount: String(body?.amount),
				asset_code: body?.asset_code ?? "USDC",
				amount_source: "client_reported",
			},
			created_at: nowIso(),
			updated_at: nowIso(),
		};
		db.transactions.push(t);
		notify(
			meId(),
			"withdrawal_sent",
			"Withdrawal sent",
			`${body?.amount} ${body?.asset_code ?? "USDC"} is on its way to your destination.`,
			"/transactions",
		);
		return created(serializeTransaction(t));
	}],

	["GET", "/api/wallet/history", ({ query }) =>
		paginate(
			myTransactions().map((t) => ({
				...serializeTransaction(t),
				kind: transactionKind(t),
				amount: transactionAmount(t),
			})),
			query,
		)],

	// ---- withdraw destinations -------------------------------------------------
	["GET", "/api/withdraw-info", () =>
		db.destinations
			.filter((d) => d.user_id === meId())
			.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || b.created_at.localeCompare(a.created_at))],

	["POST", "/api/withdraw-info", ({ body }) => {
		if (!STELLAR_ADDRESS.test(body?.stellar_address ?? "")) {
			throw invalid({ stellar_address: ["That is not a valid Stellar public address."] });
		}
		const mine = db.destinations.filter((d) => d.user_id === meId());
		const makePrimary = Boolean(body.is_primary) || mine.length === 0;
		if (makePrimary) mine.forEach((d) => (d.is_primary = false));
		const destination = {
			id: nextId(),
			user_id: meId(),
			stellar_address: body.stellar_address,
			memo: body.memo ?? null,
			memo_type: body.memo_type ?? "none",
			destination_label: body.destination_label ?? null,
			is_primary: makePrimary,
			created_at: nowIso(),
			updated_at: nowIso(),
		};
		db.destinations.push(destination);
		return created(destination);
	}],

	["PATCH", "/api/withdraw-info/:id", ({ params, body }) => {
		const d = db.destinations.find((x) => x.id === params.id && x.user_id === meId());
		if (!d) throw notFound("Destination");
		if (body.is_primary && !d.is_primary) {
			db.destinations.filter((x) => x.user_id === meId()).forEach((x) => (x.is_primary = false));
		}
		Object.assign(d, {
			...(body.stellar_address !== undefined && { stellar_address: body.stellar_address }),
			...(body.memo !== undefined && { memo: body.memo }),
			...(body.memo_type !== undefined && { memo_type: body.memo_type ?? "none" }),
			...(body.destination_label !== undefined && { destination_label: body.destination_label }),
			is_primary: body.is_primary ?? d.is_primary,
			updated_at: nowIso(),
		});
		return d;
	}],

	["POST", "/api/withdraw-info/:id/primary", ({ params }) => {
		const d = db.destinations.find((x) => x.id === params.id && x.user_id === meId());
		if (!d) throw notFound("Destination");
		db.destinations.filter((x) => x.user_id === meId()).forEach((x) => (x.is_primary = false));
		d.is_primary = true;
		return d;
	}],

	["DELETE", "/api/withdraw-info/:id", ({ params }) => {
		const index = db.destinations.findIndex((x) => x.id === params.id && x.user_id === meId());
		if (index === -1) throw notFound("Destination");
		const [removed] = db.destinations.splice(index, 1);
		if (removed.is_primary) {
			const next = newestFirst(db.destinations.filter((x) => x.user_id === meId()))[0];
			if (next) next.is_primary = true;
		}
		return { message: "Destination removed." };
	}],

	// ---- groups --------------------------------------------------------------
	["GET", "/api/groups", () =>
		newestFirst(
			db.groups.filter(
				(g) => g.organizer_id === meId() || db.members.some((m) => m.group_id === g.id && m.user_id === meId()),
			),
		).map(groupWithCount)],

	["POST", "/api/groups", ({ body }) => {
		const errors: Record<string, string[]> = {};
		if (!body?.name) errors.name = ["The name field is required."];
		if (!DECIMAL.test(String(body?.contribution_amount ?? ""))) {
			errors.contribution_amount = ["Must be a number with at most 7 decimal places"];
		}
		if (Object.keys(errors).length) throw invalid(errors);

		const frequencySeconds: Record<string, number> = {
			hourly: 3_600, six_hourly: 21_600, daily: 86_400, two_daily: 172_800, weekly: 604_800,
			bi_weekly: 1_209_600, monthly: 2_592_000, quarterly: 7_776_000, yearly: 31_536_000,
		};
		const id = nextId();
		const group = makeGroup({
			id,
			name: body.name,
			description: body.description ?? null,
			organizer_id: meId(),
			asset_code: body.asset_code ?? "USDC",
			contribution_amount: money(stroops(body.contribution_amount)),
			target_amount: body.target_amount ? money(stroops(body.target_amount)) : null,
			cycle_length_seconds:
				body.contribution_frequency === "custom"
					? (body.cycle_length_seconds ?? 604_800)
					: (frequencySeconds[body.contribution_frequency] ?? 604_800),
			contribution_frequency: body.contribution_frequency ?? "weekly",
			fee_bps: body.fee_bps ?? 0,
			late_fee_bps: body.late_fee_bps ?? 0,
			grace_period_hours: body.grace_period_hours ?? 0,
			late_penalty: body.late_penalty ?? "deduct_from_balance",
			payout_order: body.payout_order ?? "manual",
			group_type: body.group_type ?? "private",
			auto_approve_join: body.auto_approve_join ?? false,
			hide_balances: body.hide_balances ?? false,
			status: "draft",
			created_at: nowIso(),
			updated_at: nowIso(),
		});
		db.groups.push(group);
		db.members.push({
			id: nextId(),
			group_id: id,
			user_id: meId(),
			status: "approved",
			payout_position: 1,
			has_received_payout: false,
			joined_at: nowIso(),
			created_at: nowIso(),
			updated_at: nowIso(),
		});
		return created({ group: serializeGroup(group) });
	}],

	["GET", "/api/groups/join/:token", ({ params }) => {
		const g = db.groups.find((x) => x.invite_token === params.token);
		if (!g) throw notFound("Invite");
		return {
			id: g.id,
			name: g.name,
			description: g.description,
			photo_url: g.photo_url,
			target_amount: g.target_amount,
			member_count: approvedMembers(g.id).length,
			settings: {
				group_type: g.group_type,
				payout_order: g.payout_order,
				contribution_amount: g.contribution_amount,
				contribution_frequency: g.contribution_frequency,
				fee_bps: g.fee_bps,
				late_fee_bps: g.late_fee_bps,
				grace_period_hours: g.grace_period_hours,
				late_penalty: g.late_penalty,
				auto_approve_join: g.auto_approve_join,
			},
		};
	}],

	["POST", "/api/groups/join/:token", ({ params }) => {
		const g = db.groups.find((x) => x.invite_token === params.token);
		if (!g) throw notFound("Invite");
		const existing = membershipOf(g.id, meId());
		if (existing) return serializeMember(existing);
		const member: MockMember = {
			id: nextId(),
			group_id: g.id,
			user_id: meId(),
			status: g.auto_approve_join ? "approved" : "pending",
			payout_position: g.auto_approve_join ? nextPosition(g.id) : null,
			has_received_payout: false,
			joined_at: g.auto_approve_join ? nowIso() : null,
			created_at: nowIso(),
			updated_at: nowIso(),
		};
		db.members.push(member);
		return created(serializeMember(member));
	}],

	["GET", "/api/groups/:id", ({ params }) => {
		const g = findGroup(params.id);
		assertVisible(g);
		const members = membersWithUsers(g.id);
		return { ...serializeGroup(g), members, members_count: members.length };
	}],

	["PATCH", "/api/groups/:id/onchain", ({ params, body }) => {
		const g = findGroup(params.id);
		assertOrganizer(g);
		if (g.onchain_group_id !== null) {
			return {
				onchain_group_id: g.onchain_group_id,
				status: g.status,
				message: "Group is already live on-chain.",
			};
		}
		const onchainId = String(body?.onchain_group_id);
		const taken = groupByOnchainId(onchainId);
		if (taken) {
			throw new HttpError(422, `On-chain group #${onchainId} is already linked to “${taken.name}”.`);
		}
		const cg = db.chainGroups.get(onchainId);
		if (!cg) throw new HttpError(422, "That on-chain group does not exist.");
		if (!me().stellar_address) {
			throw new HttpError(422, "Link your wallet before connecting this circle to the chain.");
		}
		if (cg.organizer !== me().stellar_address) {
			throw new HttpError(403, "That on-chain group belongs to a different wallet.");
		}
		g.onchain_group_id = onchainId;
		reconcile(g);
		return { onchain_group_id: g.onchain_group_id, status: g.status };
	}],

	["POST", "/api/groups/:id/activate", ({ params }) => {
		const g = findGroup(params.id);
		assertOrganizer(g);
		reconcile(g);
		return { status: g.status, current_cycle: g.current_cycle };
	}],

	["GET", "/api/groups/:id/circle", ({ params }) => {
		const g = findGroup(params.id);
		assertVisible(g);
		assertNotPending(g);
		const view = viewership(g);
		const mask = g.hide_balances && view !== "organizer";

		const approved = approvedMembers(g.id);
		const memberCount = approved.length;
		const rotation = db.members
			.filter((m) => m.group_id === g.id && (m.status === "approved" || m.status === "removed"))
			.sort((a, b) => (a.payout_position ?? 99) - (b.payout_position ?? 99));

		const totalDeposited = sumConfirmed(g.id);
		const userPaid = sumConfirmed(g.id, meId());
		const paidThisCycle = new Set(
			db.contributions
				.filter((c) => c.group_id === g.id && c.status === "confirmed" && c.cycle === g.current_cycle)
				.map((c) => c.user_id),
		);

		const cg = g.onchain_group_id ? db.chainGroups.get(g.onchain_group_id) : undefined;
		const recipientAddr = cg ? currentRecipient(cg) : null;
		const currentRecipientUserId = recipientAddr ? (userByAddress(recipientAddr)?.id ?? null) : null;

		const payers = Math.max(memberCount - 1, 1);
		const userAim = stroops(g.contribution_amount) * BigInt(payers);
		const totalCycles = Math.max(memberCount, 1);
		const completedCycles = Math.min(g.current_cycle, totalCycles);
		const fraction = Math.min(1, paidThisCycle.size / payers);
		const raw = completedCycles >= totalCycles ? totalCycles : completedCycles + fraction;

		return {
			group: {
				id: g.id,
				name: g.name,
				status: g.status,
				asset_code: g.asset_code,
				contribution_amount: g.contribution_amount,
				contribution_frequency: g.contribution_frequency,
				target_amount: g.target_amount,
				contract_address: g.contract_address,
			},
			member_count: memberCount,
			current_cycle: g.current_cycle,
			total_deposited: money(totalDeposited),
			you_paid_this_cycle: paidThisCycle.has(meId()),
			user_progress: {
				paid: money(userPaid),
				aim: money(userAim),
				percent: percentOf(userPaid, userAim),
			},
			circle_progress: {
				cycles_done: completedCycles,
				cycles_total: totalCycles,
				percent: Math.round((raw / totalCycles) * 100 * 100) / 100,
			},
			current_recipient_user_id: currentRecipientUserId,
			payout_rotation: rotation.map((m) => {
				const u = userById(m.user_id);
				return {
					position: m.payout_position,
					user_id: m.user_id,
					name: u?.name ?? null,
					avatar_url: u?.avatar_url ?? null,
					stellar_address: mask && m.user_id !== meId() ? null : (u?.stellar_address ?? null),
					has_received_payout: m.has_received_payout,
					removed: m.status === "removed",
				};
			}),
			cycle_activity: newestFirst(db.transactions.filter((t) => t.group_id === g.id))
				.slice(0, 20)
				.map((t) => {
					const hide = mask && t.user_id !== meId();
					return {
						id: t.id,
						type: t.type,
						status: t.status,
						stellar_tx_hash: hide ? null : t.stellar_tx_hash,
						explorer_url: hide ? null : t.explorer_url,
						created_at: t.created_at,
					};
				}),
		};
	}],

	["GET", "/api/groups/:id/dashboard", ({ params }) => {
		const g = findGroup(params.id);
		assertVisible(g);
		assertNotPending(g);
		const paidOut = db.payouts
			.filter((p) => p.group_id === g.id)
			.reduce((s, p) => s + stroops(p.net_amount) + stroops(p.fee_amount), 0n);
		return {
			group: {
				id: g.id,
				name: g.name,
				status: g.status,
				asset_code: g.asset_code,
				contribution_amount: g.contribution_amount,
				contract_address: g.contract_address,
			},
			member_count: approvedMembers(g.id).length,
			current_cycle: g.current_cycle,
			pool_balance: money(sumConfirmed(g.id) - paidOut),
			next_recipient_id: g.next_recipient_id,
			next_payout_at: g.next_payout_at,
			contribution_progress: {
				confirmed: db.contributions.filter(
					(c) => c.group_id === g.id && c.status === "confirmed" && c.cycle === g.current_cycle,
				).length,
				total_members: approvedMembers(g.id).length,
			},
			recent_activity: newestFirst(db.transactions.filter((t) => t.group_id === g.id)).slice(0, 10),
		};
	}],

	["POST", "/api/groups/:id/photo", ({ params, form }) => {
		const g = findGroup(params.id);
		assertOrganizer(g);
		const file = form?.get("photo");
		if (!(file instanceof File)) throw invalid({ photo: ["The photo field is required."] });
		g.photo_url = URL.createObjectURL(file);
		return { photo_url: g.photo_url };
	}],

	["POST", "/api/groups/:id/members/:memberId/approve", ({ params }) => {
		const g = findGroup(params.id);
		assertOrganizer(g);
		const m = db.members.find((x) => x.id === params.memberId && x.group_id === g.id);
		if (!m) throw notFound("Member");
		Object.assign(m, {
			status: "approved",
			payout_position: nextPosition(g.id),
			joined_at: nowIso(),
			updated_at: nowIso(),
		});
		return { member: serializeMember(m) };
	}],

	["DELETE", "/api/groups/:id/members/:memberId", ({ params }) => {
		const g = findGroup(params.id);
		assertOrganizer(g);
		const index = db.members.findIndex((x) => x.id === params.memberId && x.group_id === g.id);
		if (index === -1) throw notFound("Member");
		if (db.members[index].status !== "pending") {
			throw new HttpError(422, "Only pending requests can be declined.");
		}
		db.members.splice(index, 1);
		return { message: "Request declined." };
	}],

	["POST", "/api/groups/:id/payout-order", ({ params, body }) => {
		const g = findGroup(params.id);
		if (g.circle_kind === "challenge") throw new HttpError(422, "A savings challenge has no payout rotation.");
		assertOrganizer(g);
		if (g.status !== "draft" && g.status !== "open") {
			throw new HttpError(422, "The payout order can only be changed before the cycle starts.");
		}
		const submitted: string[] = (body?.member_ids ?? []).map(String);
		const approved = approvedMembers(g.id).map((m) => m.user_id);
		const isPermutation =
			submitted.length === approved.length &&
			new Set(submitted).size === submitted.length &&
			submitted.every((id) => approved.includes(id));
		if (!isPermutation) throw new HttpError(422, "The order must list each approved member exactly once.");
		submitted.forEach((userId, index) => {
			const m = membershipOf(g.id, userId);
			if (m) m.payout_position = index + 1;
		});
		return { members: membersWithUsers(g.id) };
	}],

	["GET", "/api/groups/:id/invite-link", ({ params }) => {
		const g = findGroup(params.id);
		if (g.organizer_id !== meId()) throw forbidden("Only the organizer can view the invite link.");
		return {
			invite_token: g.invite_token,
			invite_url: `${window.location.origin}/groups/join/${g.invite_token}`,
		};
	}],

	["POST", "/api/groups/:id/invite-link", ({ params }) => {
		const g = findGroup(params.id);
		if (g.organizer_id !== meId()) throw forbidden("Only the organizer can regenerate the invite link.");
		g.invite_token = `invite-${g.id}-${Date.now().toString(36)}`;
		return {
			invite_token: g.invite_token,
			invite_url: `${window.location.origin}/groups/join/${g.invite_token}`,
			message: "Previous links no longer work.",
		};
	}],

	// ---- contributions ---------------------------------------------------------
	["GET", "/api/groups/:id/contributions", ({ params }) => {
		const g = findGroup(params.id);
		assertVisible(g);
		return newestFirst(db.contributions.filter((c) => c.group_id === g.id && c.user_id === meId()));
	}],

	["POST", "/api/groups/:id/contributions", ({ params }) => {
		const g = findGroup(params.id);
		if (g.circle_kind === "challenge") {
			throw new HttpError(422, "This is a savings challenge, not a rotating circle. Use the challenge deposit endpoint.");
		}
		assertApprovedMember(g);
		const existing = db.contributions.find(
			(c) => c.group_id === g.id && c.user_id === meId() && c.cycle === g.current_cycle,
		);
		if (existing) return { contribution: existing };
		const contribution = {
			id: nextId(),
			group_id: g.id,
			user_id: meId(),
			cycle: g.current_cycle,
			amount: g.contribution_amount,
			status: "pending" as const,
			stellar_tx_hash: null,
			confirmed_at: null,
			created_at: nowIso(),
			updated_at: nowIso(),
		};
		db.contributions.push(contribution);
		return created({ contribution });
	}],

	["POST", "/api/groups/:id/contributions/confirm", ({ params }) => {
		const g = findGroup(params.id);
		assertApprovedMember(g);
		reconcile(g);
		return (
			db.contributions.find(
				(c) => c.group_id === g.id && c.user_id === meId() && c.cycle === g.current_cycle,
			) ?? null
		);
	}],

	// ---- governance + recovery (MVP 2) ------------------------------------------
	["GET", "/api/groups/:id/governance", ({ params }) => {
		const g = findGroup(params.id);
		assertVisible(g);
		assertNotPending(g);
		settleExpired(g.id);
		const mine = db.proposals.filter((p) => p.group_id === g.id);
		const open = openDefault(g.id);
		const status = governanceStatus(g);
		const { threshold, eligible, pct } = thresholdFor(g.id);
		return {
			status,
			open_proposals: newestFirst(mine.filter((p) => p.status === "voting")).map(
				serializeProposal,
			),
			proposals_total: mine.length,
			open_default: open ? serializeDefault(open) : null,
			defaults_recorded: db.defaults.filter(
				(d) => d.group_id === g.id && d.cycle === g.current_cycle,
			).length,
			threshold_pct: pct,
			threshold,
			eligible_voters: eligible,
			on_hold: status === "paused" || status === "recovery",
		};
	}],

	["GET", "/api/groups/:id/proposals", ({ params }) => {
		const g = findGroup(params.id);
		assertVisible(g);
		assertNotPending(g);
		settleExpired(g.id);
		return newestFirst(db.proposals.filter((p) => p.group_id === g.id)).map(serializeProposal);
	}],

	["POST", "/api/groups/:id/proposals", ({ params, body }) => {
		const g = findGroup(params.id);
		assertApprovedMember(g);
		const errors: Record<string, string[]> = {};
		if (!["pause", "resume", "payout_schedule"].includes(body?.action)) {
			errors.action = ["Choose what the group should decide."];
		}
		if (!String(body?.title ?? "").trim()) {
			errors.title = ["Describe the proposed action."];
		}
		if (Object.keys(errors).length) throw invalid(errors);
		if (body.action === "pause" && db.paused[g.id]) {
			throw invalid({ action: ["The group is already paused."] });
		}
		if (body.action === "resume" && !db.paused[g.id]) {
			throw invalid({ action: ["The group isn't paused."] });
		}

		const hash = fakeHash();
		const row: MockProposal = {
			id: nextId(),
			group_id: g.id,
			kind: "governance",
			title: String(body.title).trim(),
			description: String(body.description ?? "").trim() || null,
			action: body.action,
			status: "voting",
			created_by: meId(),
			created_at: nowIso(),
			voting_ends_at: new Date(Date.now() + VOTING_HOURS.governance * 3_600_000).toISOString(),
			executed_at: null,
			votes: [],
			recovery: null,
			tx_hash: hash,
			explorer_url: explorerUrl(hash),
		};
		db.proposals.push(row);
		return created(serializeProposal(row));
	}],

	["GET", "/api/groups/:id/proposals/:pid", ({ params }) => {
		const g = findGroup(params.id);
		assertVisible(g);
		assertNotPending(g);
		settleExpired(g.id);
		const p = db.proposals.find((x) => x.id === params.pid && x.group_id === g.id);
		if (!p) throw notFound("Proposal");
		return serializeProposal(p);
	}],

	// Votes are final. Reaching the threshold executes the action straight
	// away, as the contract's permissionless `execute` will (decision 5).
	["POST", "/api/groups/:id/proposals/:pid/vote", ({ params, body }) => {
		const g = findGroup(params.id);
		assertApprovedMember(g);
		settleExpired(g.id);
		const p = db.proposals.find((x) => x.id === params.pid && x.group_id === g.id);
		if (!p) throw notFound("Proposal");
		if (p.status !== "voting") throw new HttpError(422, "Voting on this proposal has closed.");
		if (!eligibleVoters(g.id).includes(meId())) {
			throw new HttpError(403, "You can't vote on this proposal.");
		}
		if (p.votes.some((v) => v.user_id === meId())) {
			throw new HttpError(422, "You've already voted on this proposal.");
		}
		if (body?.choice !== "approve" && body?.choice !== "reject") {
			throw invalid({ choice: ["Vote For or Against."] });
		}
		p.votes.push({ user_id: meId(), choice: body.choice, at: nowIso() });

		if (p.votes.filter((v) => v.choice === "approve").length >= thresholdFor(g.id).threshold) {
			execute(p);
		}
		return serializeProposal(p);
	}],

	["GET", "/api/groups/:id/defaults", ({ params }) => {
		const g = findGroup(params.id);
		assertVisible(g);
		assertNotPending(g);
		return db.defaults
			.filter((d) => d.group_id === g.id)
			.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
			.map(serializeDefault);
	}],

	// Start a recovery vote for an open default.
	["POST", "/api/groups/:id/recovery", ({ params, body }) => {
		const g = findGroup(params.id);
		assertApprovedMember(g);
		const d = db.defaults.find((x) => x.id === String(body?.default_id) && x.group_id === g.id);
		if (!d) throw notFound("Missed contribution");
		if (d.status !== "open") {
			throw new HttpError(422, "This missed contribution is already resolved.");
		}
		const active = db.proposals.find((p) => p.id === d.proposal_id && p.status === "voting");
		if (active) {
			throw new HttpError(422, "A recovery vote is already open for this missed contribution.");
		}
		if (!["extend_deadline", "cover_from_reserve"].includes(body?.option)) {
			throw invalid({ option: ["Choose a recovery option."] });
		}
		const days = Number(body.extension_days ?? 3);
		const who = userById(d.user_id)?.name.split(" ")[0] ?? "the member";

		const hash = fakeHash();
		const row: MockProposal = {
			id: nextId(),
			group_id: g.id,
			kind: "recovery",
			title:
				body.option === "extend_deadline"
					? `Extend ${who}'s deadline by ${days} days`
					: `Cover ${who}'s contribution from reserve`,
			description: String(body.rationale ?? "").trim() || null,
			action: "recovery",
			status: "voting",
			created_by: meId(),
			created_at: nowIso(),
			voting_ends_at: new Date(Date.now() + VOTING_HOURS.recovery * 3_600_000).toISOString(),
			executed_at: null,
			votes: [],
			recovery: { default_id: d.id, option: body.option, extension_days: days },
			tx_hash: hash,
			explorer_url: explorerUrl(hash),
		};
		db.proposals.push(row);
		d.proposal_id = row.id;
		return created(serializeProposal(row));
	}],

	["GET", "/api/groups/:id/history", ({ params, query }) => {
		const g = findGroup(params.id);
		assertVisible(g);
		assertNotPending(g);
		settleExpired(g.id);
		const kind = query.kind === "governance" || query.kind === "recovery" ? query.kind : null;
		return {
			active: newestFirst(
				db.proposals.filter(
					(p) => p.group_id === g.id && p.status === "voting" && (!kind || p.kind === kind),
				),
			).map(serializeProposal),
			events: historyFor(g.id).filter((e) => !kind || e.kind === kind),
		};
	}],

	// ---- challenges ------------------------------------------------------------
	["GET", "/api/challenges", ({ query }) => {
		const q = (query.q ?? "").toLowerCase();
		const rows = newestFirst(
			db.groups.filter(
				(g) =>
					g.circle_kind === "challenge" &&
					(g.status === "open" || g.status === "active") &&
					(!q || g.name.toLowerCase().includes(q)),
			),
		).map((g) => ({ ...serializeGroup(g), member_count: approvedMembers(g.id).length }));
		return paginate(rows, query);
	}],

	["POST", "/api/challenges", ({ body }) => {
		const errors: Record<string, string[]> = {};
		if (!body?.name) errors.name = ["The name field is required."];
		if (!DECIMAL.test(String(body?.savings_target ?? ""))) {
			errors.savings_target = ["Must be a number with at most 7 decimals"];
		}
		if (Object.keys(errors).length) throw invalid(errors);
		const g = makeGroup({
			id: nextId(),
			name: body.name,
			description: body.description ?? null,
			organizer_id: meId(),
			asset_code: body.asset_code ?? "USDC",
			circle_kind: "challenge",
			group_type: "public",
			auto_approve_join: true,
			contribution_frequency: "custom",
			cycle_length_seconds: 86_400,
			savings_target: money(stroops(body.savings_target)),
			challenge_ends_at: body.challenge_ends_at ?? null,
			status: "open",
			created_at: nowIso(),
			updated_at: nowIso(),
		});
		const id = g.id;
		db.groups.push(g);
		db.members.push({
			id: nextId(),
			group_id: id,
			user_id: meId(),
			status: "approved",
			payout_position: null,
			has_received_payout: false,
			joined_at: nowIso(),
			created_at: nowIso(),
			updated_at: nowIso(),
		});
		return created({ ...serializeGroup(g), member_count: 1 });
	}],

	["POST", "/api/challenges/:id/join", ({ params }) => {
		const g = findGroup(params.id);
		if (g.circle_kind !== "challenge") throw notFound("Challenge");
		const existing = membershipOf(g.id, meId());
		if (existing) return serializeMember(existing);
		const m: MockMember = {
			id: nextId(),
			group_id: g.id,
			user_id: meId(),
			status: "approved",
			payout_position: null,
			has_received_payout: false,
			joined_at: nowIso(),
			created_at: nowIso(),
			updated_at: nowIso(),
		};
		db.members.push(m);
		return created(serializeMember(m));
	}],

	["POST", "/api/challenges/:id/leave", ({ params }) => {
		const g = findGroup(params.id);
		if (g.circle_kind !== "challenge") throw notFound("Challenge");
		if (g.organizer_id === meId()) {
			throw new HttpError(422, "The creator cannot leave their own challenge.");
		}
		const index = db.members.findIndex((m) => m.group_id === g.id && m.user_id === meId());
		if (index !== -1) db.members.splice(index, 1);
		return { message: "You left the challenge." };
	}],

	["GET", "/api/challenges/:id/summary", ({ params }) => {
		const g = findGroup(params.id);
		if (g.circle_kind !== "challenge") throw notFound("Challenge");
		const target = stroops(g.savings_target ?? "0");
		const totals = new Map<string, bigint>();
		for (const d of db.deposits.filter((x) => x.group_id === g.id && x.status === "confirmed")) {
			totals.set(d.user_id, (totals.get(d.user_id) ?? 0n) + stroops(d.amount));
		}
		const saved = [...totals.values()];
		return {
			group: {
				id: g.id,
				name: g.name,
				asset_code: g.asset_code,
				savings_target: money(target),
				challenge_ends_at: g.challenge_ends_at,
			},
			member_count: approvedMembers(g.id).length,
			group_saved_total: money(saved.reduce((s, x) => s + x, 0n)),
			members_reached_target: saved.filter((x) => target > 0n && x >= target).length,
			hide_balances: g.hide_balances,
			leaderboard:
				g.hide_balances || totals.size === 0
					? null
					: [...totals.entries()]
							.sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))
							.map(([userId, amount]) => ({
								user_id: userId,
								name: userById(userId)?.name ?? null,
								saved: money(amount),
								percent: percentOf(amount, target),
							})),
		};
	}],

	["GET", "/api/challenges/:id/progress", ({ params }) => {
		const g = findGroup(params.id);
		if (g.circle_kind !== "challenge") throw notFound("Challenge");
		assertApprovedMember(g);
		const saved = db.deposits
			.filter((d) => d.group_id === g.id && d.user_id === meId() && d.status === "confirmed")
			.reduce((s, d) => s + stroops(d.amount), 0n);
		const target = stroops(g.savings_target ?? "0");
		return {
			group_id: g.id,
			saved: money(saved),
			target: money(target),
			percent: percentOf(saved, target),
			reached: target > 0n && saved >= target,
			challenge_ends_at: g.challenge_ends_at,
		};
	}],

	["POST", "/api/challenges/:id/deposit", ({ params, body }) => {
		const g = findGroup(params.id);
		if (g.circle_kind !== "challenge") throw notFound("Challenge");
		assertApprovedMember(g);
		if (db.deposits.some((d) => d.stellar_tx_hash === body?.stellar_tx_hash)) {
			throw invalid({ stellar_tx_hash: ["That transaction has already been recorded."] });
		}
		// Confirm straight away when the mock chain backs it — the real indexer
		// does the same check against the challenge contract's balance_of.
		const confirmedSoFar = db.deposits
			.filter((d) => d.group_id === g.id && d.user_id === meId() && d.status === "confirmed")
			.reduce((s, d) => s + stroops(d.amount), 0n);
		const backed =
			challengeBalance(g.id, me().stellar_address ?? "") >= confirmedSoFar + stroops(body?.amount ?? 0);
		const deposit = {
			id: nextId(),
			group_id: g.id,
			user_id: meId(),
			amount: money(stroops(body?.amount ?? 0)),
			stellar_tx_hash: String(body?.stellar_tx_hash),
			status: backed ? ("confirmed" as const) : ("pending" as const),
			confirmed_at: backed ? nowIso() : null,
			created_at: nowIso(),
			updated_at: nowIso(),
		};
		db.deposits.push(deposit);
		return created(deposit);
	}],

	// ---- transactions + activity -------------------------------------------------
	["GET", "/api/transactions", ({ query }) => {
		const q = (query.q ?? "").toLowerCase();
		const rows = myTransactions()
			.filter((t) => !query.type || t.type === query.type)
			.filter((t) => !query.status || t.status === query.status)
			.filter((t) => !q || (t.group_id && groupById(t.group_id)?.name.toLowerCase().includes(q)))
			.map(serializeTransaction);
		return paginate(rows, query);
	}],

	["GET", "/api/transactions/:id", ({ params }) => {
		const t = db.transactions.find((x) => x.id === params.id && x.user_id === meId());
		if (!t) throw notFound("Transaction");
		const g = t.group_id ? groupById(t.group_id) : undefined;
		return {
			id: t.id,
			type: t.type,
			status: t.status,
			amount: transactionAmount(t),
			group: g ? { id: g.id, name: g.name } : null,
			transaction_no: t.stellar_tx_hash,
			explorer_url: t.explorer_url,
			date_time: t.created_at,
		};
	}],

	["GET", "/api/activity", ({ query }) => {
		const filter = query.filter ?? "all";
		const rows = myTransactions()
			.map(activityRow)
			.filter((row) => {
				if (filter === "contributions") return row.type === "contribution";
				if (filter === "payout") return row.kind === "payout";
				if (filter === "withdrawal") return row.kind === "withdrawal";
				return true;
			});
		return paginate(rows, query);
	}],

	// ---- notifications -------------------------------------------------------------
	["GET", "/api/notifications", ({ query }) => {
		const mine = newestFirst(db.notifications.filter((n) => n.user_id === meId()));
		const rows = query.unread === "true" ? mine.filter((n) => !n.read_at) : mine;
		return {
			...paginate(rows, query),
			unread_count: mine.filter((n) => !n.read_at).length,
		};
	}],

	["POST", "/api/notifications/read", ({ body }) => {
		const ids: string[] = (body?.ids ?? []).map(String);
		let marked = 0;
		for (const n of db.notifications) {
			if (n.user_id !== meId() || n.read_at) continue;
			if (body?.all || ids.includes(n.id)) {
				n.read_at = nowIso();
				marked += 1;
			}
		}
		return {
			marked,
			unread_count: db.notifications.filter((n) => n.user_id === meId() && !n.read_at).length,
		};
	}],

	// Realtime is off in mock mode; the bell falls back to refresh-on-focus.
	["GET", "/api/notifications/realtime-token", () => ({ enabled: false })],

	// ---- home dashboard --------------------------------------------------------------
	["GET", "/api/dashboard", () => {
		const groupIds = db.members
			.filter((m) => m.user_id === meId() && m.status === "approved")
			.map((m) => m.group_id);

		const net = new Map<string, bigint>();
		for (const c of db.contributions.filter((x) => x.user_id === meId() && x.status === "confirmed")) {
			const code = groupById(c.group_id)?.asset_code ?? "USDC";
			net.set(code, (net.get(code) ?? 0n) + stroops(c.amount));
		}
		for (const p of db.payouts.filter((x) => x.recipient_id === meId())) {
			const code = groupById(p.group_id)?.asset_code ?? "USDC";
			net.set(code, (net.get(code) ?? 0n) - stroops(p.net_amount));
		}
		const assets = [...net.entries()]
			.filter(([, amount]) => amount > 0n)
			.sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))
			.map(([code, amount]) => ({ asset_code: code, saved: money(amount) }));
		const headline = assets[0] ?? { asset_code: "USDC", saved: "0.0000000" };

		const live = newestFirst(
			db.groups.filter((g) => groupIds.includes(g.id) && (g.status === "open" || g.status === "active")),
		);
		const paidThisCycle = (g: MockGroup) =>
			db.contributions.some(
				(c) => c.group_id === g.id && c.user_id === meId() && c.cycle === g.current_cycle,
			);
		const due = live
			.filter((g) => g.status === "active" && g.circle_kind === "rotating")
			.sort((a, b) => (a.next_payout_at ?? "").localeCompare(b.next_payout_at ?? ""))
			.find((g) => !paidThisCycle(g));

		return {
			saved_balance: headline.saved,
			asset_code: headline.asset_code,
			assets,
			people_total: new Set(
				db.members
					.filter((m) => groupIds.includes(m.group_id) && m.status === "approved" && m.user_id !== meId())
					.map((m) => m.user_id),
			).size,
			circles: live.slice(0, 5).map((g) => ({
				id: g.id,
				name: g.name,
				status: g.status,
				asset_code: g.asset_code,
				contribution_amount: g.contribution_amount,
				member_count: approvedMembers(g.id).length,
				current_cycle: g.current_cycle,
				contributed_this_cycle: paidThisCycle(g),
			})),
			circles_total: live.length,
			has_more_circles: live.length > 5,
			quick_deposit: due
				? {
						group_id: due.id,
						group_name: due.name,
						amount: due.contribution_amount,
						asset_code: due.asset_code,
						cycle: due.current_cycle,
						due_at: due.next_payout_at,
						contribute_endpoint: `/api/groups/${due.id}/contributions`,
					}
				: null,
		};
	}],
];

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------

const compiled = routes.map(([method, pattern, handler]) => {
	const keys: string[] = [];
	const regex = new RegExp(
		`^${pattern.replace(/:(\w+)/g, (_m, key: string) => {
			keys.push(key);
			return "([^/]+)";
		})}$`,
	);
	return { method, regex, keys, handler };
});

/**
 * Answer one API call. Returns a status + JSON body exactly as the real route
 * would, so `request()` in `src/lib/api` treats it like a network response.
 */
export async function mockRequest(
	method: string,
	path: string,
	options: { query?: Record<string, unknown>; body?: unknown; form?: FormData } = {},
): Promise<MockResponse> {
	await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

	const query = Object.fromEntries(
		Object.entries(options.query ?? {})
			.filter(([, v]) => v !== null && v !== undefined)
			.map(([k, v]) => [k, String(v)]),
	);

	for (const route of compiled) {
		if (route.method !== method) continue;
		const match = route.regex.exec(path);
		if (!match) continue;

		const params = Object.fromEntries(route.keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));

		try {
			// Handlers mutate the store directly; hand the UI a copy so it can
			// never hold a live reference to mock state.
			const result = route.handler({ params, query, body: options.body ?? {}, form: options.form });
			if (result instanceof WithStatus) {
				return { status: result.status, data: structuredClone(result.data) };
			}
			return { status: 200, data: structuredClone(result) };
		} catch (error) {
			if (error instanceof HttpError) {
				return {
					status: error.status,
					data: { message: error.message, ...(error.errors && { errors: error.errors }) },
				};
			}
			console.error("[mocks] handler threw:", error);
			return { status: 500, data: { message: "Server error." } };
		}
	}

	console.warn(`[mocks] no mock for ${method} ${path} — add one in src/mocks/api.ts`);
	return { status: 404, data: { message: `No mock for ${method} ${path}.` } };
}

/** `downloadFile` stand-in: the CSV statement. */
export async function mockDownload(path: string): Promise<Blob> {
	await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
	if (path !== "/api/transactions/statement") {
		throw new Error(`[mocks] no download mock for ${path}`);
	}
	const lines = [
		"Date,Type,Group,Status,Amount,Stellar Tx Hash",
		...myTransactions().map((t) =>
			[
				t.created_at.replace("T", " ").slice(0, 19),
				transactionKind(t),
				t.group_id ? (groupById(t.group_id)?.name ?? "") : "",
				t.status,
				transactionAmount(t) ?? "",
				t.stellar_tx_hash ?? "",
			].join(","),
		),
	];
	return new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv" });
}
