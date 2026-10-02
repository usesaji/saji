/**
 * Mock Stellar layer: stands in for the savings + challenge contracts and the
 * browser wallet.
 *
 * Contract calls enforce the same rules and throw the same `Error(Contract, #N)`
 * codes as the real contracts, so the UI's error handling (which matches on
 * those codes) is exercised. Writes also do what the backend indexer would do
 * afterwards — confirm the contribution row, settle a fully funded cycle — so
 * the screens update without a reconcile step.
 */

import {
	type ChainGroup,
	MOCK_SAC,
	daysFromNow,
	db,
	explorerUrl,
	fakeHash,
	groupByOnchainId,
	me,
	membershipOf,
	money,
	nextId,
	nowIso,
	stroops,
	userByAddress,
} from "./db";

const SIGN_DELAY_MS = 700;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Same message shape the RPC produces, so `/#5\b/`-style checks match. */
function contractError(code: number): Error {
	return new Error(`HostError: Error(Contract, #${code})`);
}

/** A bindings `Result` — the hooks call `.unwrap()` on it. */
function ok<T>(value: T) {
	return { unwrap: () => value, isOk: () => true, isErr: () => false };
}

/** A read: `.result` is available immediately, like a simulated call. */
function read<T>(result: T) {
	return {
		result,
		signAndSend: async () => ({ result, sendTransactionResponse: { hash: fakeHash() } }),
	};
}

/** A write: nothing happens until the wallet "signs" and it is "submitted". */
function write<T>(apply: () => T) {
	return {
		result: undefined,
		signAndSend: async () => {
			await delay(SIGN_DELAY_MS);
			const value = apply();
			return { result: ok(value), sendTransactionResponse: { hash: fakeHash() } };
		},
	};
}

function chainGroup(groupId: unknown): ChainGroup {
	const cg = db.chainGroups.get(String(groupId));
	if (!cg) throw contractError(1); // GroupNotFound
	return cg;
}

function currentRecipient(cg: ChainGroup): string | null {
	return cg.members.find((m) => !cg.removed.has(m) && !cg.received.has(m)) ?? null;
}

function requireSigner(publicKey: string, expected: string): void {
	if (publicKey !== expected) {
		throw new Error("HostError: Error(Auth, InvalidAction) — wrong wallet signed");
	}
}

function assetOf(cg: ChainGroup): string {
	return Object.entries(MOCK_SAC).find(([, sac]) => sac === cg.token)?.[0] ?? "USDC";
}

/** Move the mock wallet's balance when the connected wallet pays or receives. */
function adjustWallet(addr: string, asset: string, delta: bigint): void {
	if (addr !== db.walletAddress) return;
	const current = db.walletBalances[asset] ?? 0;
	db.walletBalances[asset] = Number(money(stroops(current.toFixed(7)) + delta));
}

// ---------------------------------------------------------------------------
// DB sync — what the indexer would do after each on-chain change
// ---------------------------------------------------------------------------

function recordContribution(cg: ChainGroup, memberAddr: string): void {
	const group = groupByOnchainId(cg.onchain_id);
	const user = userByAddress(memberAddr);
	if (!group || !user) return;

	const existing = db.contributions.find(
		(c) => c.group_id === group.id && c.user_id === user.id && c.cycle === cg.cycle,
	);
	const contribution = existing ?? {
		id: nextId(),
		group_id: group.id,
		user_id: user.id,
		cycle: cg.cycle,
		amount: group.contribution_amount,
		status: "pending" as const,
		stellar_tx_hash: null,
		confirmed_at: null,
		created_at: nowIso(),
		updated_at: nowIso(),
	};
	contribution.status = "confirmed";
	contribution.confirmed_at = nowIso();
	contribution.updated_at = nowIso();
	if (!existing) db.contributions.push(contribution);

	db.transactions.push({
		id: nextId(),
		group_id: group.id,
		user_id: user.id,
		type: "contribution",
		subject_type: "Contribution",
		subject_id: contribution.id,
		stellar_tx_hash: null,
		status: "success",
		explorer_url: null,
		meta: null,
		created_at: nowIso(),
		updated_at: nowIso(),
	});

	if (user.id === me().id) {
		db.notifications.unshift({
			id: nextId(),
			user_id: user.id,
			type: "contribution_confirmed",
			title: `Contribution confirmed — ${group.name}`,
			body: `Your ${group.contribution_amount} ${group.asset_code} contribution to "${group.name}" is confirmed on-chain.`,
			href: `/groups/${group.id}/circle`,
			meta: { group_id: group.id, group_name: group.name, cycle: cg.cycle },
			read_at: null,
			created_at: nowIso(),
		});
	}
}

/** Pay the cycle out if every active, non-recipient member has paid. */
function settleIfComplete(cg: ChainGroup): void {
	if (cg.status !== 2) return;
	const recipient = currentRecipient(cg);
	if (!recipient) return;

	const allPaid = cg.members.every(
		(m) => m === recipient || cg.removed.has(m) || cg.contributed.has(`${cg.cycle}:${m}`),
	);
	if (!allPaid) return;

	const gross = cg.pool;
	const fee = (gross * BigInt(cg.fee_bps)) / 10_000n;
	const net = gross - fee;
	const settledCycle = cg.cycle;

	cg.claimable.set(recipient, (cg.claimable.get(recipient) ?? 0n) + net);
	cg.received.add(recipient);
	cg.pool = 0n;
	cg.cycle += 1;
	cg.deposits_open_at = Math.max(
		cg.deposits_open_at + cg.cycle_length,
		Math.floor(Date.now() / 1000),
	);
	const finished = currentRecipient(cg) === null;
	if (finished) cg.status = 3;

	const group = groupByOnchainId(cg.onchain_id);
	const user = userByAddress(recipient);
	if (!group || !user) return;

	const hash = fakeHash();
	const payout = {
		id: nextId(),
		group_id: group.id,
		recipient_id: user.id,
		cycle: settledCycle,
		gross_amount: money(gross),
		fee_amount: money(fee),
		net_amount: money(net),
		stellar_tx_hash: hash,
		created_at: nowIso(),
	};
	db.payouts.push(payout);
	db.transactions.push({
		id: nextId(),
		group_id: group.id,
		user_id: user.id,
		type: "payout",
		subject_type: "Payout",
		subject_id: payout.id,
		stellar_tx_hash: hash,
		status: "success",
		explorer_url: explorerUrl(hash),
		meta: null,
		created_at: nowIso(),
		updated_at: nowIso(),
	});

	const membership = membershipOf(group.id, user.id);
	if (membership) membership.has_received_payout = true;

	group.current_cycle = cg.cycle;
	group.status = finished ? "completed" : "active";
	const next = currentRecipient(cg);
	group.next_recipient_id = next ? (userByAddress(next)?.id ?? null) : null;
	group.next_payout_at = finished
		? null
		: new Date((cg.deposits_open_at + cg.cycle_length) * 1000).toISOString();
	group.updated_at = nowIso();

	if (user.id === me().id) {
		db.notifications.unshift({
			id: nextId(),
			user_id: user.id,
			type: "payout_received",
			title: "Your circle payout is ready",
			body: `It's your turn — ${money(net)} is waiting for you. It stays safely escrowed until you withdraw it, so there's no rush.`,
			href: "/wallet/withdraw",
			meta: { group_id: group.id, payout_id: payout.id, amount: money(net), cycle: settledCycle },
			read_at: null,
			created_at: nowIso(),
		});
	}
}

// ---------------------------------------------------------------------------
// savings contract
// ---------------------------------------------------------------------------

type Args = Record<string, unknown>;

const MIN_CYCLE = 3_600;
const MAX_CYCLE = 120 * 86_400;
const MAX_FEE_BPS = 1_000;

function savings(method: string, publicKey: string, args: Args) {
	switch (method) {
		// ---- writes ----
		case "create_group":
			return write(() => {
				const amount = BigInt(args.amount as bigint);
				const cycleLength = Number(args.cycle_length);
				if (amount <= 0n) throw contractError(4); // InvalidAmount
				if (cycleLength < MIN_CYCLE || cycleLength > MAX_CYCLE) throw contractError(11);
				if (Number(args.fee_bps) > MAX_FEE_BPS || Number(args.late_fee_bps) > MAX_FEE_BPS) {
					throw contractError(3); // InvalidFee
				}

				const id = String(db.nextOnchainId++);
				db.chainGroups.set(id, {
					onchain_id: id,
					organizer: String(args.organizer),
					token: String(args.token),
					amount,
					cycle_length: cycleLength,
					fee_bps: Number(args.fee_bps),
					late_fee_bps: Number(args.late_fee_bps),
					grace_period: Number(args.grace_period),
					payout_order: Number(args.payout_order),
					late_penalty: Number(args.late_penalty),
					members: [String(args.organizer)],
					status: 0,
					cycle: 0,
					pool: 0n,
					contributed: new Set(),
					received: new Set(),
					removed: new Set(),
					claimable: new Map(),
					late_fees: new Map(),
					deposits_open_at: 0,
				});
				return BigInt(id);
			});

		case "join_group":
			return write(() => {
				const cg = chainGroup(args.group_id);
				requireSigner(publicKey, cg.organizer);
				if (cg.status > 1) throw contractError(5); // WrongStatus
				const memberAddr = String(args.member);
				if (cg.members.includes(memberAddr)) throw contractError(6); // AlreadyMember
				cg.members.push(memberAddr);
				cg.status = 1;
			});

		case "set_payout_order":
			return write(() => {
				const cg = chainGroup(args.group_id);
				requireSigner(publicKey, cg.organizer);
				if (cg.status > 1) throw contractError(5);
				if (cg.payout_order !== 0) throw contractError(13); // OrderNotManual
				const order = (args.order as string[]) ?? [];
				const isPermutation =
					order.length === cg.members.length &&
					new Set(order).size === order.length &&
					order.every((a) => cg.members.includes(a));
				if (!isPermutation) throw contractError(12); // InvalidOrder
				cg.members = [...order];
			});

		case "start_cycle":
			return write(() => {
				const cg = chainGroup(args.group_id);
				requireSigner(publicKey, cg.organizer);
				if (cg.status > 1) throw contractError(5);
				if (cg.members.length < 2) throw contractError(10); // TooFewMembers
				cg.status = 2;
				cg.cycle = 0;
				cg.deposits_open_at = Math.floor(Date.now() / 1000);
			});

		case "contribute":
			return write(() => {
				const cg = chainGroup(args.group_id);
				const memberAddr = String(args.member);
				requireSigner(publicKey, memberAddr);
				if (cg.status !== 2) throw contractError(5);
				if (!cg.members.includes(memberAddr) || cg.removed.has(memberAddr)) {
					throw contractError(7); // NotMember
				}
				if (Date.now() / 1000 < cg.deposits_open_at) throw contractError(19); // CycleNotOpen
				if (currentRecipient(cg) === memberAddr) throw contractError(20); // RecipientExempt
				const key = `${cg.cycle}:${memberAddr}`;
				if (cg.contributed.has(key)) throw contractError(8); // AlreadyContributed

				const owed = cg.late_fees.get(memberAddr) ?? 0n;
				cg.late_fees.delete(memberAddr);
				cg.contributed.add(key);
				cg.pool += cg.amount + owed;
				adjustWallet(memberAddr, assetOf(cg), -(cg.amount + owed));

				recordContribution(cg, memberAddr);
				settleIfComplete(cg);
			});

		case "resolve_default":
			return write(() => {
				const cg = chainGroup(args.group_id);
				const memberAddr = String(args.member);
				if (cg.status !== 2) throw contractError(5);
				if (!cg.members.includes(memberAddr)) throw contractError(7);
				if (cg.removed.has(memberAddr)) throw contractError(14); // NotDefaultable
				if (cg.contributed.has(`${cg.cycle}:${memberAddr}`)) throw contractError(14);
				if (currentRecipient(cg) === memberAddr) throw contractError(14);
				const deadline = cg.deposits_open_at + cg.cycle_length + cg.grace_period;
				if (Date.now() / 1000 < deadline) throw contractError(14);

				const group = groupByOnchainId(cg.onchain_id);
				if (cg.late_penalty === 1) {
					cg.removed.add(memberAddr);
					cg.received.add(memberAddr);
					const user = userByAddress(memberAddr);
					const membership = group && user ? membershipOf(group.id, user.id) : undefined;
					if (membership) membership.status = "removed";
				} else {
					const fee = (cg.amount * BigInt(cg.late_fee_bps)) / 10_000n;
					cg.late_fees.set(memberAddr, (cg.late_fees.get(memberAddr) ?? 0n) + fee);
				}
				settleIfComplete(cg);
			});

		case "claim_payout":
			return write(() => {
				const cg = chainGroup(args.group_id);
				const memberAddr = String(args.member);
				requireSigner(publicKey, memberAddr);
				const amount = cg.claimable.get(memberAddr) ?? 0n;
				if (amount <= 0n) throw contractError(16); // NothingToClaim
				cg.claimable.delete(memberAddr);
				adjustWallet(String(args.to ?? memberAddr), assetOf(cg), amount);
				return amount;
			});

		// ---- reads ----
		case "get_group": {
			const cg = chainGroup(args.group_id);
			return read(
				ok({
					organizer: cg.organizer,
					token: cg.token,
					amount: cg.amount,
					cycle_length: BigInt(cg.cycle_length),
					fee_bps: cg.fee_bps,
					late_fee_bps: cg.late_fee_bps,
					grace_period: BigInt(cg.grace_period),
					payout_order: cg.payout_order,
					late_penalty: cg.late_penalty,
					member_count: cg.members.length,
					status: cg.status,
				}),
			);
		}
		case "get_members":
			return read([...(db.chainGroups.get(String(args.group_id))?.members ?? [])]);
		case "get_cycle":
			return read(db.chainGroups.get(String(args.group_id))?.cycle ?? 0);
		case "get_pool":
			return read(db.chainGroups.get(String(args.group_id))?.pool ?? 0n);
		case "deposits_open_at":
			return read(BigInt(db.chainGroups.get(String(args.group_id))?.deposits_open_at ?? 0));
		case "has_contributed":
			return read(
				db.chainGroups
					.get(String(args.group_id))
					?.contributed.has(`${Number(args.cycle)}:${String(args.member)}`) ?? false,
			);
		case "is_removed":
			return read(
				db.chainGroups.get(String(args.group_id))?.removed.has(String(args.member)) ?? false,
			);
		case "claimable_of":
			return read(
				db.chainGroups.get(String(args.group_id))?.claimable.get(String(args.member)) ?? 0n,
			);
		case "late_fee_of":
			return read(
				db.chainGroups.get(String(args.group_id))?.late_fees.get(String(args.member)) ?? 0n,
			);
		case "amount_due": {
			const cg = chainGroup(args.group_id);
			return read(ok(cg.amount + (cg.late_fees.get(String(args.member)) ?? 0n)));
		}
		case "next_recipient": {
			const recipient = currentRecipient(chainGroup(args.group_id));
			if (!recipient) throw contractError(1);
			return read(ok(recipient));
		}
	}

	throw new Error(`[mocks] savings contract method "${method}" is not mocked yet — add it in src/mocks/chain.ts`);
}

// ---------------------------------------------------------------------------
// challenge contract
// ---------------------------------------------------------------------------

function challenge(method: string, publicKey: string, args: Args) {
	const key = `${String(args.challenge_id)}:${String(args.member)}`;
	const assetFor = (token: string) =>
		Object.entries(MOCK_SAC).find(([, sac]) => sac === token)?.[0] ?? "USDC";

	switch (method) {
		case "deposit":
			return write(() => {
				requireSigner(publicKey, String(args.member));
				const amount = BigInt(args.amount as bigint);
				if (amount <= 0n) throw contractError(1); // InvalidAmount
				const token = String(args.token);
				const locked = db.challengeTokens.get(key);
				if (locked && locked !== token) throw contractError(3); // WrongToken
				db.challengeTokens.set(key, token);
				db.challengeBalances.set(key, (db.challengeBalances.get(key) ?? 0n) + amount);
				adjustWallet(String(args.member), assetFor(token), -amount);
			});

		case "withdraw":
			return write(() => {
				requireSigner(publicKey, String(args.member));
				const amount = BigInt(args.amount as bigint);
				if (amount <= 0n) throw contractError(1);
				const balance = db.challengeBalances.get(key) ?? 0n;
				if (balance < amount) throw contractError(2); // InsufficientBalance
				db.challengeBalances.set(key, balance - amount);
				adjustWallet(
					String(args.to ?? args.member),
					assetFor(db.challengeTokens.get(key) ?? MOCK_SAC.USDC),
					amount,
				);
				return balance - amount;
			});

		case "balance_of":
			return read(db.challengeBalances.get(key) ?? 0n);
		case "token_of":
			return read(db.challengeTokens.get(key));
	}

	throw new Error(`[mocks] challenge contract method "${method}" is not mocked yet — add it in src/mocks/chain.ts`);
}

/** Entry point for the Proxy clients built in `./enabled`. */
export function callContract(
	contract: "savings" | "challenge",
	method: string,
	publicKey: string,
	args: Args,
) {
	return contract === "savings"
		? savings(method, publicKey, args)
		: challenge(method, publicKey, args);
}

// ---------------------------------------------------------------------------
// wallet (stands in for Stellar Wallets Kit + Horizon reads)
// ---------------------------------------------------------------------------

export const wallet = {
	async connect(): Promise<string> {
		await delay(400);
		db.walletConnected = true;
		return db.walletAddress;
	},

	async currentAddress(): Promise<string | null> {
		return db.walletConnected ? db.walletAddress : null;
	},

	async disconnect(): Promise<void> {
		db.walletConnected = false;
	},

	/** "Signing" hands the XDR straight back. */
	async sign(unsignedXdr: string): Promise<string> {
		await delay(300);
		return unsignedXdr;
	},

	async balances(address: string): Promise<Record<string, number>> {
		return address === db.walletAddress ? { ...db.walletBalances } : {};
	},

	async hasTrustline(): Promise<boolean> {
		return true;
	},

	async addTrustline(): Promise<void> {
		await delay(SIGN_DELAY_MS);
	},
};

/** Exposed for the API mock: a challenge's deposits are "confirmed" against this. */
export function challengeBalance(challengeId: string, addr: string): bigint {
	return db.challengeBalances.get(`${challengeId}:${addr}`) ?? 0n;
}

/** Exposed for the API mock (`next_payout_at` defaults for freshly started circles). */
export function scheduleFor(cg: ChainGroup): string {
	return cg.deposits_open_at
		? new Date((cg.deposits_open_at + cg.cycle_length) * 1000).toISOString()
		: daysFromNow(7);
}

export { currentRecipient };
