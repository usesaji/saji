/**
 * The in-memory "backend" for mock mode: seed data plus the on-chain state the
 * fake contract clients read and write.
 *
 * Shapes mirror the REAL wire format, not the TypeScript types in
 * `src/lib/api`: ids are STRINGS (the server serialises BigInt ids that way),
 * money is a decimal STRING, field names are snake_case. UI built against these
 * mocks should therefore behave the same against the real API.
 *
 * State lives in module memory: it survives client-side navigation and resets
 * on a full page reload, so a reload is always a clean slate.
 */

import { fromStroops, toStroopsOrZero } from "@/lib/stroops";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** ISO timestamp `days` from now (negative = in the past). */
export function daysFromNow(days: number): string {
	return new Date(Date.now() + days * DAY_MS).toISOString();
}

export function nowIso(): string {
	return new Date().toISOString();
}

let idCounter = 1000;

/** A fresh string id, unique across every table. */
export function nextId(): string {
	idCounter += 1;
	return String(idCounter);
}

/** Decimal string → stroops. */
export function stroops(amount: string | number): bigint {
	return toStroopsOrZero(amount);
}

/** Stroops → the 7-dp decimal string the server sends ("12.5000000"). */
export function money(value: bigint): string {
	const [whole, frac = ""] = fromStroops(value).split(".");
	return `${whole}.${frac.padEnd(7, "0")}`;
}

let hashCounter = 0;

/** A fake 64-hex-char transaction hash. */
export function fakeHash(): string {
	hashCounter += 1;
	const seed = `${Date.now().toString(16)}${hashCounter.toString(16)}`;
	return seed.padStart(64, "a").slice(-64);
}

export function explorerUrl(hash: string): string {
	return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

/** A well-formed (but fake) G… address, deterministic per label. */
function address(label: string): string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	let out = "G";
	let state = 7;
	for (let i = 0; out.length < 56; i++) {
		state = (state * 31 + label.charCodeAt(i % label.length)) % 1_000_003;
		out += alphabet[state % alphabet.length];
	}
	return out;
}

// ---------------------------------------------------------------------------
// record types (snake_case, as served)
// ---------------------------------------------------------------------------

export type MockUser = {
	id: string;
	name: string;
	tag_name: string | null;
	email: string;
	email_verified_at: string | null;
	avatar_url: string | null;
	stellar_address: string | null;
	date_of_birth: string | null;
	gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
	address: string | null;
	has_password: boolean;
	is_google_linked: boolean;
	twofa_on_suspicious_withdrawal: boolean;
	lock_after_failed_attempts: number;
	created_at: string;
	updated_at: string;
};

export type MockGroup = {
	id: string;
	name: string;
	description: string | null;
	photo_url: string | null;
	organizer_id: string;
	onchain_group_id: string | null;
	contract_address: string | null;
	asset_code: string;
	asset_issuer: string | null;
	contribution_amount: string;
	target_amount: string | null;
	cycle_length_seconds: number;
	contribution_frequency: string;
	fee_bps: number;
	late_fee_bps: number;
	grace_period_hours: number;
	late_penalty: "deduct_from_balance" | "remove_member";
	payout_order: "random" | "manual" | "vote" | "custom";
	group_type: "public" | "private";
	auto_approve_join: boolean;
	hide_balances: boolean;
	invite_token: string;
	status: "draft" | "open" | "active" | "completed" | "cancelled";
	circle_kind: "rotating" | "challenge";
	savings_target: string | null;
	challenge_ends_at: string | null;
	current_cycle: number;
	next_recipient_id: string | null;
	next_payout_at: string | null;
	created_at: string;
	updated_at: string;
};

export type MockMember = {
	id: string;
	group_id: string;
	user_id: string;
	status: "pending" | "approved" | "removed";
	payout_position: number | null;
	has_received_payout: boolean;
	joined_at: string | null;
	created_at: string;
	updated_at: string;
};

export type MockContribution = {
	id: string;
	group_id: string;
	user_id: string;
	cycle: number;
	amount: string;
	status: "pending" | "submitted" | "confirmed" | "failed";
	stellar_tx_hash: string | null;
	confirmed_at: string | null;
	created_at: string;
	updated_at: string;
};

export type MockPayout = {
	id: string;
	group_id: string;
	recipient_id: string;
	cycle: number;
	gross_amount: string;
	fee_amount: string;
	net_amount: string;
	stellar_tx_hash: string;
	created_at: string;
};

export type MockDeposit = {
	id: string;
	group_id: string;
	user_id: string;
	amount: string;
	stellar_tx_hash: string;
	status: "pending" | "confirmed" | "failed";
	confirmed_at: string | null;
	created_at: string;
	updated_at: string;
};

export type MockTransaction = {
	id: string;
	group_id: string | null;
	user_id: string | null;
	type: "create_group" | "join" | "contribution" | "payout" | "other";
	subject_type: string | null;
	subject_id: string | null;
	stellar_tx_hash: string | null;
	status: "pending" | "success" | "failed";
	explorer_url: string | null;
	meta: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
};

export type MockNotification = {
	id: string;
	user_id: string;
	type:
		| "join_requested"
		| "join_approved"
		| "contribution_confirmed"
		| "payout_received"
		| "withdrawal_sent"
		| "circle_completed";
	title: string;
	body: string;
	href: string | null;
	meta: Record<string, unknown> | null;
	read_at: string | null;
	created_at: string;
};

export type MockDestination = {
	id: string;
	user_id: string;
	stellar_address: string;
	memo: string | null;
	memo_type: "text" | "id" | "none";
	destination_label: string | null;
	is_primary: boolean;
	created_at: string;
	updated_at: string;
};

export type RecoveryOption = "extend_deadline" | "cover_from_reserve";

/** A governance or recovery proposal (MVP 2). Votes are kept per member. */
export type MockProposal = {
	id: string;
	group_id: string;
	kind: "governance" | "recovery";
	title: string;
	description: string | null;
	action: "pause" | "resume" | "payout_schedule" | "recovery";
	status: "voting" | "approved" | "rejected" | "executed" | "expired";
	created_by: string;
	created_at: string;
	voting_ends_at: string;
	executed_at: string | null;
	votes: { user_id: string; choice: "approve" | "reject"; at: string }[];
	/** Recovery proposals only: which default, and how to resolve it. */
	recovery: { default_id: string; option: RecoveryOption; extension_days: number } | null;
	tx_hash: string | null;
	explorer_url: string | null;
};

/** A missed contribution recorded on-chain (MVP 2). */
export type MockDefault = {
	id: string;
	group_id: string;
	user_id: string;
	cycle: number;
	amount: string;
	deadline: string;
	recorded_at: string;
	status: "open" | "resolved";
	/** The recovery proposal currently deciding it, if any. */
	proposal_id: string | null;
	resolved_at: string | null;
	tx_hash: string;
	explorer_url: string;
};

/** One rotating circle as the savings contract sees it. */
export type ChainGroup = {
	onchain_id: string;
	organizer: string;
	token: string;
	amount: bigint;
	cycle_length: number;
	fee_bps: number;
	late_fee_bps: number;
	grace_period: number;
	payout_order: number;
	late_penalty: number;
	/** Rotation order. */
	members: string[];
	/** 0 Draft, 1 Open, 2 Active, 3 Completed. */
	status: number;
	cycle: number;
	pool: bigint;
	/** `${cycle}:${address}` */
	contributed: Set<string>;
	received: Set<string>;
	removed: Set<string>;
	claimable: Map<string, bigint>;
	late_fees: Map<string, bigint>;
	/** Unix SECONDS. */
	deposits_open_at: number;
};

// ---------------------------------------------------------------------------
// seed
// ---------------------------------------------------------------------------

/** Your account in mock mode. */
export const ME_ID = "1";

const now = nowIso();

function user(
	id: string,
	name: string,
	tag: string,
	extra: Partial<MockUser> = {},
): MockUser {
	return {
		id,
		name,
		tag_name: tag,
		email: `${tag}@example.com`,
		email_verified_at: daysFromNow(-60),
		avatar_url: null,
		stellar_address: address(tag),
		date_of_birth: null,
		gender: null,
		address: null,
		has_password: true,
		is_google_linked: false,
		twofa_on_suspicious_withdrawal: false,
		lock_after_failed_attempts: 5,
		created_at: daysFromNow(-60),
		updated_at: daysFromNow(-60),
		...extra,
	};
}

const users: MockUser[] = [
	user(ME_ID, "Ada Okafor", "ada", {
		avatar_url: null,
		date_of_birth: "1994-03-12",
		gender: "female",
		address: "12 Admiralty Way, Lekki, Lagos",
	}),
	user("2", "Bayo Adeyemi", "bayo"),
	user("3", "Chioma Nwosu", "chioma"),
	user("4", "Dami Bello", "dami"),
	user("5", "Efe Ighalo", "efe"),
	user("6", "Funmi Ade", "funmi"),
	user("7", "Gbenga Ola", "gbenga"),
];

const addressOf = (userId: string) =>
	users.find((u) => u.id === userId)?.stellar_address ?? "";

/** Token contract ids per asset — any stable string works for the mock chain. */
export const MOCK_SAC: Record<string, string> = {
	USDC: "CCOY5JSTYMV4WN6W7WZS7JRMZXHSHKGEZQ5PCHEEAZLFQIVVFFHWCX7V",
	USDT: "CCM5YODOEZSDQNYO466BEH232DC2YYHCWULB6HA7PLEOKAOJIJP5GO2N",
	XLM: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
};

/** A group row with the server's column defaults filled in. */
export function makeGroup(
	fields: Partial<MockGroup> &
		Pick<MockGroup, "id" | "name" | "organizer_id" | "status">,
): MockGroup {
	return {
		description: null,
		photo_url: null,
		onchain_group_id: null,
		contract_address: null,
		asset_code: "USDC",
		asset_issuer: null,
		contribution_amount: "0.0000000",
		target_amount: null,
		cycle_length_seconds: 604_800,
		contribution_frequency: "weekly",
		fee_bps: 0,
		late_fee_bps: 0,
		grace_period_hours: 0,
		late_penalty: "deduct_from_balance",
		payout_order: "manual",
		group_type: "private",
		auto_approve_join: false,
		hide_balances: false,
		invite_token: `invite-${fields.id}`,
		circle_kind: "rotating",
		savings_target: null,
		challenge_ends_at: null,
		current_cycle: 0,
		next_recipient_id: null,
		next_payout_at: null,
		created_at: daysFromNow(-30),
		updated_at: daysFromNow(-1),
		...fields,
	};
}

const groups: MockGroup[] = [
	// You organize this one; it's mid-rotation and you have an unclaimed payout.
	makeGroup({
		id: "10",
		name: "Family Ajo",
		description: "Weekly family savings — everyone gets a turn.",
		photo_url: "/images/group-placeholder.png",
		organizer_id: ME_ID,
		onchain_group_id: "101",
		contribution_amount: "50.0000000",
		target_amount: "200.0000000",
		fee_bps: 100,
		late_fee_bps: 200,
		grace_period_hours: 24,
		invite_token: "family-ajo",
		status: "active",
		current_cycle: 1,
		next_recipient_id: "2",
		next_payout_at: daysFromNow(3),
		created_at: daysFromNow(-12),
	}),
	// Someone else organizes; privacy is on; you've paid this cycle.
	makeGroup({
		id: "11",
		name: "Office Esusu",
		description: "Monthly esusu for the design team.",
		organizer_id: "2",
		onchain_group_id: "102",
		asset_code: "USDT",
		contribution_amount: "100.0000000",
		cycle_length_seconds: 2_592_000,
		contribution_frequency: "monthly",
		grace_period_hours: 48,
		late_penalty: "remove_member",
		payout_order: "random",
		hide_balances: true,
		invite_token: "office-esusu",
		status: "active",
		current_cycle: 0,
		next_recipient_id: "2",
		next_payout_at: daysFromNow(20),
		created_at: daysFromNow(-16),
	}),
	// Draft: created in the app but not yet on-chain — exercises the setup flow.
	makeGroup({
		id: "12",
		name: "Rent Circle",
		description: "Bi-weekly circle to cover rent.",
		organizer_id: ME_ID,
		asset_code: "XLM",
		contribution_amount: "200.0000000",
		cycle_length_seconds: 1_209_600,
		contribution_frequency: "bi_weekly",
		invite_token: "rent-circle",
		status: "draft",
		created_at: daysFromNow(-2),
	}),
	// Finished rotation.
	makeGroup({
		id: "13",
		name: "Holiday Fund",
		organizer_id: "3",
		onchain_group_id: "103",
		contribution_amount: "20.0000000",
		cycle_length_seconds: 86_400,
		contribution_frequency: "daily",
		invite_token: "holiday-fund",
		status: "completed",
		current_cycle: 3,
		created_at: daysFromNow(-40),
	}),
	// Public savings challenges.
	makeGroup({
		id: "20",
		name: "30-Day Emergency Fund",
		description: "Build a 500 USDC cushion in a month.",
		organizer_id: "4",
		circle_kind: "challenge",
		group_type: "public",
		auto_approve_join: true,
		contribution_frequency: "custom",
		cycle_length_seconds: 86_400,
		savings_target: "500.0000000",
		challenge_ends_at: daysFromNow(20),
		status: "open",
		created_at: daysFromNow(-10),
	}),
	makeGroup({
		id: "21",
		name: "Back-to-School Savings",
		description: "School fees, sorted before September.",
		organizer_id: "5",
		circle_kind: "challenge",
		group_type: "public",
		auto_approve_join: true,
		asset_code: "USDT",
		contribution_frequency: "custom",
		cycle_length_seconds: 86_400,
		savings_target: "300.0000000",
		challenge_ends_at: daysFromNow(45),
		status: "open",
		created_at: daysFromNow(-5),
	}),
	makeGroup({
		id: "22",
		name: "Car Down Payment",
		organizer_id: "2",
		circle_kind: "challenge",
		group_type: "public",
		auto_approve_join: true,
		hide_balances: true,
		contribution_frequency: "custom",
		cycle_length_seconds: 86_400,
		savings_target: "2000.0000000",
		status: "active",
		created_at: daysFromNow(-25),
	}),
];

function member(
	groupId: string,
	userId: string,
	position: number | null,
	extra: Partial<MockMember> = {},
): MockMember {
	return {
		id: nextId(),
		group_id: groupId,
		user_id: userId,
		status: "approved",
		payout_position: position,
		has_received_payout: false,
		joined_at: daysFromNow(-10),
		created_at: daysFromNow(-10),
		updated_at: daysFromNow(-10),
		...extra,
	};
}

const members: MockMember[] = [
	member("10", ME_ID, 1, { has_received_payout: true }),
	member("10", "2", 2),
	member("10", "3", 3),
	member("10", "4", 4),
	member("10", "6", null, { status: "pending", joined_at: null }),

	member("11", "2", 1),
	member("11", ME_ID, 2),
	member("11", "5", 3),
	member("11", "7", 4),

	member("12", ME_ID, 1),
	member("12", "7", null, { status: "pending", joined_at: null }),

	member("13", "3", 1, { has_received_payout: true }),
	member("13", ME_ID, 2, { has_received_payout: true }),
	member("13", "4", 3, { has_received_payout: true }),

	member("20", "4", null),
	member("20", ME_ID, null),
	member("20", "5", null),

	member("21", "5", null),
	member("21", "2", null),

	member("22", "2", null),
	member("22", "3", null),
];

function contribution(
	groupId: string,
	userId: string,
	cycle: number,
	amount: string,
	daysAgo: number,
): MockContribution {
	return {
		id: nextId(),
		group_id: groupId,
		user_id: userId,
		cycle,
		amount,
		status: "confirmed",
		stellar_tx_hash: null,
		confirmed_at: daysFromNow(-daysAgo),
		created_at: daysFromNow(-daysAgo),
		updated_at: daysFromNow(-daysAgo),
	};
}

const contributions: MockContribution[] = [
	contribution("10", "2", 0, "50.0000000", 6),
	contribution("10", "3", 0, "50.0000000", 6),
	contribution("10", "4", 0, "50.0000000", 5),
	contribution("10", "3", 1, "50.0000000", 1),

	contribution("11", ME_ID, 0, "100.0000000", 2),
	contribution("11", "5", 0, "100.0000000", 3),

	contribution("13", ME_ID, 0, "20.0000000", 39),
	contribution("13", "4", 0, "20.0000000", 39),
	contribution("13", "3", 1, "20.0000000", 38),
	contribution("13", "4", 1, "20.0000000", 38),
	contribution("13", "3", 2, "20.0000000", 37),
	contribution("13", ME_ID, 2, "20.0000000", 37),
];

const payouts: MockPayout[] = [
	{
		id: nextId(),
		group_id: "10",
		recipient_id: ME_ID,
		cycle: 0,
		gross_amount: "150.0000000",
		fee_amount: "1.5000000",
		net_amount: "148.5000000",
		stellar_tx_hash: fakeHash(),
		created_at: daysFromNow(-5),
	},
	{
		id: nextId(),
		group_id: "13",
		recipient_id: ME_ID,
		cycle: 1,
		gross_amount: "40.0000000",
		fee_amount: "0.0000000",
		net_amount: "40.0000000",
		stellar_tx_hash: fakeHash(),
		created_at: daysFromNow(-38),
	},
];

function deposit(
	groupId: string,
	userId: string,
	amount: string,
	daysAgo: number,
): MockDeposit {
	return {
		id: nextId(),
		group_id: groupId,
		user_id: userId,
		amount,
		stellar_tx_hash: fakeHash(),
		status: "confirmed",
		confirmed_at: daysFromNow(-daysAgo),
		created_at: daysFromNow(-daysAgo),
		updated_at: daysFromNow(-daysAgo),
	};
}

const deposits: MockDeposit[] = [
	deposit("20", ME_ID, "70.0000000", 8),
	deposit("20", ME_ID, "50.0000000", 3),
	deposit("20", "4", "300.0000000", 7),
	deposit("20", "5", "80.0000000", 2),
	deposit("21", "5", "150.0000000", 4),
	deposit("22", "2", "900.0000000", 20),
	deposit("22", "3", "450.0000000", 12),
];

function tx(fields: Partial<MockTransaction> & Pick<MockTransaction, "type">): MockTransaction {
	const hash = fields.stellar_tx_hash === undefined ? fakeHash() : fields.stellar_tx_hash;
	const created = fields.created_at ?? now;
	return {
		id: nextId(),
		group_id: null,
		user_id: ME_ID,
		subject_type: null,
		subject_id: null,
		status: "success",
		meta: null,
		...fields,
		stellar_tx_hash: hash,
		explorer_url: hash ? explorerUrl(hash) : null,
		created_at: created,
		updated_at: created,
	};
}

const transactions: MockTransaction[] = [
	tx({ type: "create_group", group_id: "10", created_at: daysFromNow(-12) }),
	...contributions.map((c) =>
		tx({
			type: "contribution",
			group_id: c.group_id,
			user_id: c.user_id,
			subject_type: "Contribution",
			subject_id: c.id,
			stellar_tx_hash: null,
			created_at: c.created_at,
		}),
	),
	...payouts.map((p) =>
		tx({
			type: "payout",
			group_id: p.group_id,
			user_id: p.recipient_id,
			subject_type: "Payout",
			subject_id: p.id,
			stellar_tx_hash: p.stellar_tx_hash,
			created_at: p.created_at,
		}),
	),
	tx({
		type: "payout",
		created_at: daysFromNow(-37),
		meta: {
			kind: "withdrawal",
			amount: "40.0000000",
			asset_code: "USDC",
			amount_source: "client_reported",
		},
	}),
];

const notifications: MockNotification[] = [
	{
		id: nextId(),
		user_id: ME_ID,
		type: "join_requested",
		title: "Funmi Ade wants to join Family Ajo",
		body: 'Funmi Ade asked to join "Family Ajo". Approve or decline them from the group\'s requests page.',
		href: "/groups/10/requests",
		meta: { group_id: "10", group_name: "Family Ajo" },
		read_at: null,
		created_at: daysFromNow(-1),
	},
	{
		id: nextId(),
		user_id: ME_ID,
		type: "payout_received",
		title: "Your circle payout is ready",
		body: "It's your turn — 148.5 is waiting for you. It stays safely escrowed until you withdraw it, so there's no rush.",
		href: "/wallet/withdraw",
		meta: { group_id: "10", amount: "148.5000000", cycle: 0 },
		read_at: null,
		created_at: daysFromNow(-5),
	},
	{
		id: nextId(),
		user_id: ME_ID,
		type: "contribution_confirmed",
		title: "Contribution confirmed — Office Esusu",
		body: 'Your 100 USDT contribution to "Office Esusu" is confirmed on-chain.',
		href: "/groups/11/circle",
		meta: { group_id: "11", group_name: "Office Esusu", amount: "100.0000000", asset_code: "USDT", cycle: 0 },
		read_at: daysFromNow(-2),
		created_at: daysFromNow(-2),
	},
	{
		id: nextId(),
		user_id: ME_ID,
		type: "join_approved",
		title: "You're in — Office Esusu",
		body: 'Your request to join "Office Esusu" was approved.',
		href: "/groups/11",
		meta: { group_id: "11", group_name: "Office Esusu" },
		read_at: daysFromNow(-15),
		created_at: daysFromNow(-15),
	},
];

const destinations: MockDestination[] = [
	{
		id: nextId(),
		user_id: ME_ID,
		stellar_address: address("ada-lobstr"),
		memo: null,
		memo_type: "none",
		destination_label: "My LOBSTR wallet",
		is_primary: true,
		created_at: daysFromNow(-20),
		updated_at: daysFromNow(-20),
	},
	{
		id: nextId(),
		user_id: ME_ID,
		stellar_address: address("binance-hot"),
		memo: "104829331",
		memo_type: "id",
		destination_label: "Binance",
		is_primary: false,
		created_at: daysFromNow(-9),
		updated_at: daysFromNow(-9),
	},
];

// --- on-chain state, derived from the DB seed so the two always agree ---

const PAYOUT_ORDER_ORDINAL = { manual: 0, random: 1, vote: 2, custom: 3 };
const STATUS_ORDINAL = { draft: 0, open: 1, active: 2, completed: 3, cancelled: 3 };

function chainFromGroup(g: MockGroup): ChainGroup {
	const roster = members
		.filter((m) => m.group_id === g.id && m.status === "approved")
		.sort((a, b) => (a.payout_position ?? 0) - (b.payout_position ?? 0));

	const contributed = new Set(
		contributions
			.filter((c) => c.group_id === g.id && c.status === "confirmed")
			.map((c) => `${c.cycle}:${addressOf(c.user_id)}`),
	);

	const pool = contributions
		.filter((c) => c.group_id === g.id && c.status === "confirmed" && c.cycle === g.current_cycle)
		.reduce((sum, c) => sum + stroops(c.amount), 0n);

	return {
		onchain_id: g.onchain_group_id!,
		organizer: addressOf(g.organizer_id),
		token: MOCK_SAC[g.asset_code] ?? MOCK_SAC.USDC,
		amount: stroops(g.contribution_amount),
		cycle_length: g.cycle_length_seconds,
		fee_bps: g.fee_bps,
		late_fee_bps: g.late_fee_bps,
		grace_period: g.grace_period_hours * 3600,
		payout_order: PAYOUT_ORDER_ORDINAL[g.payout_order],
		late_penalty: g.late_penalty === "remove_member" ? 1 : 0,
		members: roster.map((m) => addressOf(m.user_id)),
		status: STATUS_ORDINAL[g.status],
		cycle: g.current_cycle,
		pool: g.status === "completed" ? 0n : pool,
		contributed,
		received: new Set(
			roster.filter((m) => m.has_received_payout).map((m) => addressOf(m.user_id)),
		),
		removed: new Set(),
		claimable: new Map(),
		late_fees: new Map(),
		deposits_open_at: Math.floor((Date.now() - 4 * DAY_MS) / 1000),
	};
}

const chainGroups = new Map<string, ChainGroup>(
	groups
		.filter((g) => g.onchain_group_id !== null)
		.map((g) => [g.onchain_group_id!, chainFromGroup(g)]),
);

// Your Family Ajo payout (cycle 0) has not been claimed yet.
chainGroups.get("101")!.claimable.set(addressOf(ME_ID), stroops("148.5"));

/** Challenge-contract balances, keyed `${challengeId}:${address}`. */
const challengeBalances = new Map<string, bigint>();
const challengeTokens = new Map<string, string>();
for (const d of deposits) {
	const key = `${d.group_id}:${addressOf(d.user_id)}`;
	challengeBalances.set(key, (challengeBalances.get(key) ?? 0n) + stroops(d.amount));
	const asset = groups.find((g) => g.id === d.group_id)?.asset_code ?? "USDC";
	challengeTokens.set(key, MOCK_SAC[asset]);
}

// --- governance (MVP 2) ---

function proposal(
	fields: Omit<
		MockProposal,
		"id" | "explorer_url" | "tx_hash" | "kind" | "recovery" | "executed_at" | "votes"
	> &
		Partial<Pick<MockProposal, "kind" | "recovery" | "executed_at">> & {
			votes: { user_id: string; choice: "approve" | "reject" }[];
		},
): MockProposal {
	const hash = fakeHash();
	return {
		id: nextId(),
		kind: "governance",
		recovery: null,
		executed_at: null,
		tx_hash: hash,
		explorer_url: explorerUrl(hash),
		...fields,
		// Votes land a few hours after the proposal, in order.
		votes: fields.votes.map((v, i) => ({
			...v,
			at: new Date(new Date(fields.created_at).getTime() + (i + 1) * 3_600_000).toISOString(),
		})),
	};
}

function missed(fields: Omit<MockDefault, "id" | "tx_hash" | "explorer_url">): MockDefault {
	const hash = fakeHash();
	return { id: nextId(), tx_hash: hash, explorer_url: explorerUrl(hash), ...fields };
}

// Office Esusu: Gbenga missed yesterday's deadline — the recovery flow starts here.
// Family Ajo: Dami missed one last week, and the group voted an extension.
const defaults: MockDefault[] = [
	missed({
		group_id: "11",
		user_id: "7",
		cycle: 0,
		amount: "100.0000000",
		deadline: daysFromNow(-1),
		recorded_at: daysFromNow(-0.9),
		status: "open",
		proposal_id: null,
		resolved_at: null,
	}),
	missed({
		group_id: "10",
		user_id: "4",
		cycle: 0,
		amount: "50.0000000",
		deadline: daysFromNow(-9),
		recorded_at: daysFromNow(-8.9),
		status: "resolved",
		proposal_id: null,
		resolved_at: daysFromNow(-7),
	}),
];

const proposals: MockProposal[] = [
	proposal({
		group_id: "10",
		title: "Pause Family Ajo for one cycle",
		description: "Several of us travel in December. Pausing keeps anyone from missing a payment.",
		action: "pause",
		status: "voting",
		created_by: "3",
		created_at: daysFromNow(-1),
		voting_ends_at: daysFromNow(3),
		votes: [
			{ user_id: "3", choice: "approve" },
			{ user_id: "2", choice: "approve" },
		],
	}),
	proposal({
		group_id: "10",
		title: "Move December payout to Jan 5",
		description: "Paying out after the holidays gives the recipient more time to plan.",
		action: "payout_schedule",
		status: "voting",
		created_by: ME_ID,
		created_at: daysFromNow(-2),
		voting_ends_at: daysFromNow(5),
		votes: [{ user_id: ME_ID, choice: "approve" }],
	}),
	proposal({
		group_id: "10",
		title: "Resume Family Ajo contributions",
		description: null,
		action: "resume",
		status: "executed",
		executed_at: daysFromNow(-19),
		created_by: "2",
		created_at: daysFromNow(-22),
		voting_ends_at: daysFromNow(-19),
		votes: ["1", "2", "3", "4"].map((user_id) => ({ user_id, choice: "approve" as const })),
	}),
	proposal({
		group_id: "10",
		title: "Pause group for August",
		description: null,
		action: "pause",
		status: "rejected",
		created_by: "4",
		created_at: daysFromNow(-63),
		voting_ends_at: daysFromNow(-60),
		votes: [
			{ user_id: "4", choice: "approve" },
			{ user_id: "2", choice: "reject" },
			{ user_id: "3", choice: "reject" },
		],
	}),
];

// The executed recovery for Dami's missed contribution in Family Ajo.
const familyRecovery = proposal({
	group_id: "10",
	kind: "recovery",
	title: "Extend Dami's deadline by 3 days",
	description: "Dami's salary came in late. A short extension keeps the payout plan intact.",
	action: "recovery",
	status: "executed",
	created_by: "3",
	created_at: daysFromNow(-8.5),
	voting_ends_at: daysFromNow(-6.5),
	executed_at: daysFromNow(-7),
	recovery: { default_id: defaults[1].id, option: "extend_deadline", extension_days: 3 },
	votes: [
		{ user_id: "3", choice: "approve" },
		{ user_id: ME_ID, choice: "approve" },
		{ user_id: "2", choice: "approve" },
	],
});
proposals.push(familyRecovery);
defaults[1].proposal_id = familyRecovery.id;

export const db = {
	users,
	groups,
	members,
	contributions,
	payouts,
	deposits,
	transactions,
	notifications,
	destinations,
	chainGroups,
	proposals,
	/** Approval threshold per group, as a percentage of eligible voters. */
	thresholdPct: { "10": 75, "11": 60 } as Record<string, number>,
	/** Missed contributions recorded on-chain, per group (MVP 2). */
	defaultsRecorded: {} as Record<string, number>,
	/** Groups a governance vote has paused (MVP 2). */
	paused: {} as Record<string, boolean>,
	defaults,
	challengeBalances,
	challengeTokens,
	/** Next on-chain group id `create_group` will hand out. */
	nextOnchainId: 200,
	/** What the connected wallet holds, per asset code. */
	walletBalances: { XLM: 245.5, USDC: 312.4, USDT: 80 } as Record<string, number>,
	/** Mock wallet starts connected; `disconnectWallet` flips it. */
	walletConnected: true,
	/** The address the mock wallet extension "holds" — yours. */
	walletAddress: addressOf(ME_ID),
};

// ---------------------------------------------------------------------------
// lookups + serializers (mirror src/server/serializers.ts)
// ---------------------------------------------------------------------------

export function me(): MockUser {
	return users.find((u) => u.id === ME_ID)!;
}

export function userById(id: string): MockUser | undefined {
	return users.find((u) => u.id === id);
}

export function userByAddress(addr: string): MockUser | undefined {
	return users.find((u) => u.stellar_address === addr);
}

export function groupById(id: string): MockGroup | undefined {
	return groups.find((g) => g.id === id);
}

export function groupByOnchainId(onchainId: string): MockGroup | undefined {
	return groups.find((g) => g.onchain_group_id === onchainId);
}

export function membershipOf(groupId: string, userId: string): MockMember | undefined {
	return members.find((m) => m.group_id === groupId && m.user_id === userId);
}

export function publicUser(u: MockUser) {
	return {
		id: u.id,
		name: u.name,
		tag_name: u.tag_name,
		email: u.email,
		email_verified_at: u.email_verified_at,
		avatar_url: u.avatar_url,
		stellar_address: u.stellar_address,
		date_of_birth: u.date_of_birth,
		gender: u.gender,
		address: u.address,
		twofa_on_suspicious_withdrawal: u.twofa_on_suspicious_withdrawal,
		lock_after_failed_attempts: u.lock_after_failed_attempts,
		created_at: u.created_at,
		updated_at: u.updated_at,
	};
}

export function publicUserRef(u: MockUser) {
	return {
		id: u.id,
		name: u.name,
		tag_name: u.tag_name,
		avatar_url: u.avatar_url,
		stellar_address: u.stellar_address,
	};
}

/** `serializeGroup` — note `invite_token` is deliberately omitted, as on the server. */
export function serializeGroup(g: MockGroup) {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { invite_token, ...rest } = g;
	return rest;
}

export function serializeMember(m: MockMember, withUser = false) {
	const u = withUser ? userById(m.user_id) : undefined;
	return { ...m, ...(u && { user: publicUserRef(u) }) };
}

export function serializeTransaction(t: MockTransaction) {
	const g = t.group_id ? groupById(t.group_id) : undefined;
	return { ...t, group: g ? { id: g.id, name: g.name } : null };
}

/** What a transaction IS for a human: a withdrawal is stored as "payout". */
export function transactionKind(t: MockTransaction): string {
	return t.meta?.kind === "withdrawal" ? "withdrawal" : t.type;
}

/** The money figure for a transaction row, resolved from its subject. */
export function transactionAmount(t: MockTransaction): string | null {
	if (t.subject_type === "Contribution") {
		return contributions.find((c) => c.id === t.subject_id)?.amount ?? null;
	}
	if (t.subject_type === "Payout") {
		return payouts.find((p) => p.id === t.subject_id)?.net_amount ?? null;
	}
	if (t.meta?.kind === "withdrawal" && typeof t.meta.amount === "string") {
		return t.meta.amount;
	}
	return null;
}
