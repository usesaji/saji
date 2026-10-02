# MVP 2 plan: governance, defaults and recovery

This plan comes from the "SAJI MVP 2 – Project Brief" and is checked against what the codebase does today.

## What the brief asks for

Two features, both running on-chain through Soroban:

1. **Group governance.** Members create proposals and vote on them. When an approval threshold is reached, the approved action runs automatically.
   - At launch there are three actions: pause the group, resume it, and make permitted changes to the future payout schedule.
2. **Defaults and recovery.** When a contribution deadline passes unpaid, the default is recorded on-chain and the cycle enters a recovery state. Members then vote on a recovery action. The approved action runs and the cycle resumes.
   - Flow: missed contribution → default detected → recovery state → recovery proposal → vote → approval → execution → cycle resumes.

There are 12 screens to design. Everything must be verifiable on Stellar Testnet, and users should never need to know what Soroban is.

## What exists today

| The brief needs | What's in the code now |
| --- | --- |
| Contribution deadlines | ✅ `CycleStart` + `cycle_length` + `grace_period` in the contract |
| Default records on-chain | ⚠️ Partial. `resolve_default` exists, but it acts **per member, on request**. It records a removal (`Defaulted`) or a late fee, not a default event the group can act on. |
| Automatic detection | ❌ Nothing detects a missed deadline. Someone (the organizer, or anyone after 7 days) has to call `resolve_default`. |
| Recovery state | ❌ No such status. The cycle keeps running, which the brief explicitly rules out ("should not simply continue"). |
| Pause / resume | ❌ No pause flag. Every action ignores time pauses. |
| Proposals, votes, thresholds | ❌ None. The "Vote" payout order is a label that does nothing (ISSUES.md M17). |
| Payout schedule changes | ⚠️ `set_payout_order` exists, but only **before** the cycle starts, and only by the organizer. |
| Backend mirror | ✅ The indexer pattern (poll the chain → mirror to the DB → notify) extends naturally to proposals and defaults. |
| Upgrading the contract | ❌ **No upgrade function.** This work needs a **new contract deployment**, and existing groups stay on the old contract (see Decision 8). |

## Decisions needed before building

The brief doesn't settle these, and the contract can't be built until they are. The **suggestion** column is my proposed answer.

| # | Question | Suggestion |
| --- | --- | --- |
| 1 | **Approval threshold** — a percentage or a count? Set when? | A percentage of *active* members (for example 60%), chosen at group creation and changeable only by a proposal. |
| 2 | **Who can vote?** | Every active (not removed) member gets one vote. A member who has defaulted can't vote on their own recovery. |
| 3 | **Who can propose?** | Any active member. At most **one open proposal per group** at a time, to keep it simple and prevent spam. |
| 4 | **Voting window** | A fixed period (for example 72 hours). A proposal not approved in time expires as **Rejected**. |
| 5 | **Execution** | Permissionless `execute`: anyone can call it once the threshold is met, and the backend's service account calls it automatically (like `trigger_payout` today). |
| 6 | **Pause meaning** | No contributions or payouts while paused, but **claims still work**. The deadline clock stops: resume pushes the cycle start forward by the paused time, so nobody is late because of a pause. |
| 7 | **Recovery actions** | Not specified in the brief, so this needs your call. Candidates are listed under Decision 7 detail below. |
| 8 | **Existing groups** | Governance applies to groups created on the new contract only. Old groups finish on the old contract. Alternatively, add an upgrade function now so this never repeats. |
| 9 | **Vote privacy** | Show the tally to everyone. Show who voted how only when `hide_balances` is off. |
| 10 | **Organizer's role** | `resolve_default` gives the organizer its own power over defaults. Under governance it should be retired, since detection plus a group vote replaces it. |

**Decision 7 detail, recovery action candidates:**
- **Extend the deadline** by N days for the missing member.
- **Charge the late fee and continue.** This is today's `DeductFromBalance`.
- **Remove the member** and refund their unrotated contributions. This is today's `RemoveMember`.
- **Move the member to the end** of the rotation, if they haven't been paid yet.
- **Pay out the short pot**, so the cycle settles without the missing contribution.

**"Permitted payout-schedule changes"** — suggested scope:
- Reorder or swap **members who haven't been paid yet**.
- Delay the next cycle by N days.
- Never change amounts, and never touch anyone who has already been paid.

## Build plan

### Phase 0: Lock the rules (before code)

- Answer Decisions 1–10.
- From your answers I'll write a short contract spec: states, transitions, and who can call what. This becomes the testable source of truth.

### Phase 1: Contract (`contract/contracts/savings`)

Extend the savings contract rather than add a separate governance contract. Governance has to change savings state (pause, reorder, remove), and inside one contract that happens atomically, with no cross-contract trust to secure.

1. **New statuses.** `Status` gains `Paused` and `Recovery`.
   - The backend maps statuses **by ordinal**, so `indexer.ts` `STATUS_MAP` and `onchain/route.ts` `statusFromChain` must be updated together.
2. **Group config.** Add the approval threshold (bps of active members) and the voting window.
3. **Proposals.**
   - `create_proposal(group, proposer, action, description)` → id.
   - `vote(group, id, member, approve)`.
   - `execute(group, id)` is permissionless once passed.
   - Expiry happens implicitly when the window closes.
   - Read functions: `get_proposal`, `get_votes`, `active_proposal`.
4. **Actions** (an enum): `Pause`, `Resume`, `ReorderUnpaid(order)`, `DelayCycle(seconds)`, plus the recovery actions chosen in Decision 7.
5. **Default detection.**
   - `detect_defaults(group)` is permissionless. Past the deadline it records a `Default(group, cycle, member)` entry for each unpaid active member and sets the group to `Recovery`.
   - `contribute` and `trigger_payout` are blocked while the group is in `Recovery` or `Paused`.
   - While in `Recovery`, only recovery actions are allowed.
   - A successful recovery execution returns the group to `Active`.
6. **Fix related bugs while the contract is open:**
   - **C2:** the current recipient can be defaulted.
   - **H7:** the organizer fee is pushed, which lets the organizer freeze the group. Make it claimable.
   - **Upgrade path (optional):** add one (Decision 8).
7. **Tests** for every transition, threshold edge cases and expiry.
8. **Deploy.** Deploy to Testnet, regenerate `src/lib/contract/savings`, and update `scripts/check-call-sites.mjs`.

### Phase 2: Backend (`prisma/`, `src/server/`, `src/app/api/`)

1. **Schema.**
   - New tables: `Proposal`, `ProposalVote` and `MissedContribution` (the default record).
   - `GroupStatus` gains `paused` and `recovery`.
   - The group gets threshold and voting-window columns.
   - New `NotificationType` values: proposal created, vote needed, proposal approved / rejected / executed, default detected, recovery started, cycle resumed.
2. **Indexer.** For each live group:
   - Call `detect_defaults` once a deadline has passed (the service account signs, as `trigger_payout` does).
   - Mirror proposals, votes and defaults.
   - Call `execute` on passed proposals.
   - Emit notifications.
   - Detection is only as fast as the cron. The GitHub Action runs every 5 minutes; Vercel cron runs once a day.
3. **API routes**, following the existing patterns (Zod validation, `{message, errors}` responses, 404 for anything not yours):
   - `GET/POST /api/groups/:id/proposals`
   - `GET /api/groups/:id/proposals/:pid`
   - `POST …/:pid/confirm`, to reconcile after an on-chain vote or create
   - `GET /api/groups/:id/defaults`
   - `GET /api/groups/:id/history`
   - Extend `/circle` and `/dashboard` with governance and recovery status.
4. **Mocks.** Extend `src/mocks/` so every new screen works with the backend detached. These are ready before the real backend is.

### Phase 3: Frontend, the 12 design screens

| # | Screen | Proposed route / place |
| --- | --- | --- |
| 1 | Group Dashboard | `/groups/[id]` + circle page: status banner, active proposal, recovery state |
| 2 | Governance / Proposals | `/groups/[id]/proposals` |
| 3 | Create Proposal | `/groups/[id]/proposals/new` |
| 4 | Proposal Details | `/groups/[id]/proposals/[pid]` |
| 5 | Voting Screen | Vote sheet on the proposal page |
| 6 | Result / Execution Status | Proposal page, approved / rejected / executed states |
| 7 | Missed Contribution Alert | Banner on overview, circle and group pages, plus a notification |
| 8 | Default / Recovery State | `/groups/[id]/recovery` |
| 9 | Create / View Recovery Proposal | `/groups/[id]/proposals/new?kind=recovery` (same form, recovery actions only) |
| 10 | Recovery Voting | Same proposal page and vote sheet |
| 11 | Recovery Resolution | Proposal page "executed" state + cycle-resumed confirmation |
| 12 | Governance & Recovery History | `/groups/[id]/history` (with explorer links) |

- A new `useGovernanceContract` hook handles `create_proposal`, `vote` and `execute`.
- The create-group wizard gains a threshold setting in Step 2.

### Phase 4: Verify on Testnet

Run every Definition of Done item end-to-end against the deployed contract and record the transaction links:

- [ ] A member creates a supported proposal
- [ ] Members vote on it
- [ ] The configured threshold decides approval
- [ ] The approved proposal executes on-chain
- [ ] Members pause and resume a group by vote
- [ ] Members approve a payout-schedule change
- [ ] A missed contribution is detected after its deadline
- [ ] The default is recorded on-chain
- [ ] The cycle enters recovery
- [ ] Members vote on a recovery action
- [ ] The approved recovery action executes
- [ ] The cycle resumes
- [ ] Every step is verifiable on Stellar Testnet

## Order of work

Phases 1 and 2 don't depend on designs. Phase 3 does.

1. **Now:** decisions → contract spec → contract and tests, in parallel with mocks for the new screens.
2. **As designs arrive:** build each screen against the mocks.
3. **Then:** wire the screens to the real API and contract, then Testnet verification.
