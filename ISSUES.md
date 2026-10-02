# Saji: issues and bugs

Review date: 2026-10-01.

**What I covered:** the Next.js app (`src/`), the Prisma schema and migrations, both Soroban contracts (`contract/`), CI and config. I didn't review the retired `php/` backend.

**How:** I read the code; I didn't run the app against a live database or testnet. `tsc --noEmit` passes, and so does `scripts/check-call-sites.mjs` (all 11 contract call sites match the bindings). I didn't run the contract tests (`cargo test`).

**Severity**

- **Critical:** account takeover, data exposure or loss of funds is plausible.
- **High:** a money flow is broken, or there's a security hole with a clear path to exploit it.
- **Medium:** wrong behaviour that users will hit, or weaker security than the code claims.
- **Low:** edge cases and polish.

Items marked **(verify)** depend on deployment config I couldn't see.

---

## Critical

### C1. Every table except `notifications` may be readable and writable through the Supabase Data API (verify)

- **Where:** [prisma/migrations/20260812090000_instant_notifications/migration.sql](prisma/migrations/20260812090000_instant_notifications/migration.sql), [src/app/api/notifications/realtime-token/route.ts](src/app/api/notifications/realtime-token/route.ts)
- **Problem:** RLS is enabled on `notifications` only. Supabase normally grants the `anon` and `authenticated` roles access to tables created in `public` and serves them through PostgREST. Prisma migrations run as `postgres`, so those default grants usually apply. The publishable key is `NEXT_PUBLIC_*`, which means it ships to every browser. On top of that, the realtime-token route gives every user a `role: authenticated` JWT.
- **Impact:** if the default grants are in place, anyone holding the public key can read `users` (password hashes, emails, DOB, addresses). They can also insert their own row into `access_tokens` (the table stores only a SHA-256, so the attacker picks the token), which gives them a session as **any** user. They could also rewrite `users.stellar_address`.
- **How to verify:** `curl "https://<project>.supabase.co/rest/v1/users?select=email,password" -H "apikey: <publishable key>"`. The Supabase dashboard also shows "RLS disabled" warnings.
- **Fix:**
  - Run `ENABLE ROW LEVEL SECURITY` on every table. With no policies, that denies `anon` and `authenticated`.
  - And/or `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`, and alter the default privileges to match.
  - Keep only the existing `SELECT` grant on `notifications`.

### C2. The savings contract lets the current payout recipient be defaulted

- **Where:** [contract/contracts/savings/src/lib.rs:955-962](contract/contracts/savings/src/lib.rs#L955-L962) (`resolve_default`)
- **Problem:** `contribute` rejects the current recipient with `RecipientExempt`, so the recipient never has a `Contributed` flag for their own cycle. `resolve_default` only checks "has not paid this cycle". It never checks whether the member is the current recipient.
- **When it triggers:** whenever any *other* member is late, `trigger_payout` is blocked and the deadline can pass. The organizer can then call `resolve_default` on the recipient. After the 7-day escalation window, anyone can.
- **Impact:**
  - Under `RemoveMember`, or when the recipient's wallet holds less than `amount`, the recipient is removed and marked `Received`. They lose their turn, and the pot goes to the next member.
  - Under `DeductFromBalance`, they're charged a late fee for a contribution they were never allowed to make.
- **Fix:** in `resolve_default`, return `NotDefaultable` when `current_recipient(...) == Some(member)`, and add a test for it. The contract has no upgrade entrypoint, so this needs a redeploy.

---

## High

### H1. Payouts are never recorded in the DB on current networks (TransactionMeta v4)

- **Where:** [src/server/stellar/service.ts:538](src/server/stellar/service.ts#L538)
- **Problem:** `getPayoutEvent` reads `tx.resultMetaXdr.v3?.()`. Since Protocol 23, RPC returns `TransactionMeta` **v4**, and calling `.v3()` on a v4 union throws. Optional chaining doesn't help: it only guards a missing method, not one that throws. The call also sits outside the `try`. SDK 16 already handles both versions and exposes `tx.events.contractEventsXdr`.
- **Impact:** the payout lands on-chain, then `triggerPayoutIfReady` throws. No `Payout` row, `Transaction` row or `payout_received` notification gets written, and nothing recovers it later (see H2). Payout summary, home-dashboard "saved", the payout figures on the group dashboard, and wallet history are all wrong. The funds themselves are safe: they're still claimable on-chain.
- **Fix:** read the event from `tx.events.contractEventsXdr.flat()`, or switch on `meta.switch()`, and wrap the parse in a try.

### H2. A payout that isn't recorded the first time is never recorded

- **Where:** [src/server/stellar/indexer.ts:653-682](src/server/stellar/indexer.ts#L653-L682)
- **Problem:** if `waitForTransaction` gives up (about 9s), the event can't be read, or the function is killed by `maxDuration` after submitting, the loop `break`s. The comment says "the next sweep re-derives from chain". It doesn't: by then `next_recipient` and the cycle have moved on, and no code backfills `Payout` rows for past cycles. The `hasReceivedPayout` flag gets recovered; the money figures don't.
- **Fix:** do one of these:
  - Persist the submitted hash first (`Payout.status = submitted`) and confirm it on a later pass.
  - Backfill from contract `payout` events (`getEvents`) for any cycle below the chain cycle that has no `Payout` row.

### H3. A payout can be attributed to the wrong user

- **Where:** [src/server/stellar/indexer.ts:630](src/server/stellar/indexer.ts#L630), [:686](src/server/stellar/indexer.ts#L686)
- **Problem:** the recipient is read *before* `trigger_payout` is submitted, and the DB row uses that pre-read. The cycle, on the other hand, comes from the event. When two reconcile passes overlap (the comment above says they can), the pre-read recipient may not be the one this hash actually paid.
- **Fix:** look up the user by `settledEvent.recipient`.

### H4. On-chain links recorded during an RPC outage are never verified

- **Where:** [src/app/api/groups/[groupId]/onchain/route.ts:91-98](src/app/api/groups/[groupId]/onchain/route.ts#L91-L98), [src/server/stellar/indexer.ts:160](src/server/stellar/indexer.ts#L160)
- **Problem:** when `getGroup` fails, the link is saved "provisionally", and the comment says "the indexer verifies and corrects". `reconcileGroup` never does: it doesn't compare `state.organizer` with the organizer's wallet, and it doesn't call `describeConfigMismatch`. It also imports every on-chain member who has a linked wallet as an `approved` member.
- **Impact:** an organizer who links during an RPC blip, or retries until one happens, can attach any unclaimed on-chain group id. That includes another user's group, or one whose terms don't match. This skips the organizer check and the terms-mismatch check entirely.
- **Fix:** add an `onchainVerifiedAt` column. Have the indexer run the same organizer and terms checks on unverified links, and unlink or flag the group if they fail.

### H5. Withdrawals to exchanges have no memo, so funds can get stuck

- **Where:** [src/app/(webapp)/wallet/withdraw/page.tsx:202](src/app/(webapp)/wallet/withdraw/page.tsx#L202), [:529-556](src/app/(webapp)/wallet/withdraw/page.tsx#L529-L556), [src/app/api/withdraw-info/route.ts:25-26](src/app/api/withdraw-info/route.ts#L25-L26)
- **Problem:**
  - The API and DB support `memo` and `memo_type`, and destination labels suggest exchanges ("Binance"). But the Add Destination form never asks for a memo, and `claim_payout` is called with only the address.
  - Server-side, `memo` accepts up to 64 characters for any type. Stellar text memos are capped at 28 bytes, and id memos must be a uint64.
- **Impact:** an exchange that requires a memo can't credit the deposit, so the funds sit there until someone recovers them by hand.
- **Fix:** do one of these:
  - Restrict destinations to self-custody wallets and warn about exchanges.
  - Claim to the user's own wallet first, then send a classic payment that carries the memo.

  Either way, validate the memo against its type.

### H6. Backend and UI accept values the contract rejects, and the failure is hidden

- **Where:**
  - Cycle length: the "Yearly" preset is 31,536,000 s ([src/server/groups.ts:139](src/server/groups.ts#L139), [:144](src/server/groups.ts#L144), [src/features/group/CreateGroupForm.tsx:53](src/features/group/CreateGroupForm.tsx#L53)). The contract's maximum is 120 days ([lib.rs:218](contract/contracts/savings/src/lib.rs#L218)).
  - Fees: `fee_bps` and `late_fee_bps` are allowed up to 10000 ([src/app/api/groups/route.ts:155-156](src/app/api/groups/route.ts#L155-L156)), and the UI allows a late fee of 0–100% ([second-step.ts:15-21](src/lib/validations/create-group/second-step.ts#L15-L21)). The contract caps both at 1000 bps ([lib.rs:188](contract/contracts/savings/src/lib.rs#L188), [:326](contract/contracts/savings/src/lib.rs#L326)).
  - [CreateGroupForm.tsx:292-312](src/features/group/CreateGroupForm.tsx#L292-L312) catches *every* on-chain failure and shows the success screen anyway.
- **Impact:** a "Yearly" circle, or one with a fee above 10%, reverts on-chain. A rejected signature or an RPC error has the same result. The user still gets the success screen and an invite link for a circle that can never start.
- **Fix:**
  - Put these limits in shared constants and drop or cap "Yearly".
  - Validate both fees at 1000 bps or less in the UI and the API.
  - Show the on-chain error instead of swallowing it.

### H7. An organizer can freeze every payout in their circle

- **Where:** [contract/contracts/savings/src/lib.rs:815-818](contract/contracts/savings/src/lib.rs#L815-L818)
- **Problem:** `trigger_payout` *pushes* the service fee to the organizer. If the organizer's account can't receive the token (trustline removed or account merged), every `trigger_payout` reverts.
- **Impact:** there's no cancel or sweep function, so the pool is stuck for good. Removed members can't recover it either.
- **Fix:** make the fee claimable, the same way the recipient's net is (pull, not push).

### H8. Any user can delete another user's uploaded images from R2

- **Where:**
  - [src/app/api/groups/route.ts:129](src/app/api/groups/route.ts#L129), [:197](src/app/api/groups/route.ts#L197)
  - [src/app/api/challenges/route.ts:69](src/app/api/challenges/route.ts#L69), [:95](src/app/api/challenges/route.ts#L95)
  - [src/app/api/groups/[groupId]/photo/route.ts:60](src/app/api/groups/[groupId]/photo/route.ts#L60)
  - [src/server/storage.ts:211](src/server/storage.ts#L211)
- **Problem:** creating a group or challenge accepts any `photo_url` string and stores it as-is. Uploading a new photo then calls `deleteImage(previous)`, which deletes whatever key is stored. Other users' object keys are visible in avatar and photo URLs in API responses.
- **Exploit:** create a group with `photo_url: "avatars/<victim>.png"`, then upload a photo. The victim's avatar is deleted.
- **Also:** `photo_url` can point at any external URL, which works as a tracking pixel for every member who views the group.
- **Fix:** remove `photo_url` from the create schemas so the upload endpoint is its only writer. Failing that, accept only keys under `group-photos/` that this user uploaded.

### H9. `hide_balances` and the pending-requester restriction can be bypassed

- **Where:** [src/app/api/groups/[groupId]/route.ts:24-48](src/app/api/groups/[groupId]/route.ts#L24-L48), [src/app/api/groups/[groupId]/dashboard/route.ts:60-72](src/app/api/groups/[groupId]/dashboard/route.ts#L60-L72), [:108](src/app/api/groups/[groupId]/dashboard/route.ts#L108)
- **Problem:** the circle route has a long comment explaining that a pending requester must not see the roster, and that `hide_balances` must mask wallet addresses. It enforces both, but only in that one route:
  - `GET /api/groups/:id` still returns the full roster, with every member's `stellar_address`, to pending requesters. For public groups it returns it to any logged-in user. It ignores `hide_balances`.
  - The group dashboard returns unmasked tx hashes and explorer links in `recent_activity`.
- **Fix:** move the viewership and masking logic into a shared helper and apply it to every route that returns members or activity.

---

## Medium

### M1. The login lockout reveals whether an account exists, and lets anyone lock any account

- **Where:** [src/app/api/auth/login/route.ts:56-60](src/app/api/auth/login/route.ts#L56-L60)
- **Problem:**
  - A locked account gets its own message ("temporarily locked"). The comment at lines 29-43 says that exact behaviour was removed because it's an enumeration oracle.
  - Separately, five wrong passwords lock any email for 15 minutes, and the only rate limit is per-IP. That's a lockout anyone can trigger against anyone.
- **Fix:** call `rejectCredentials()` in the lock branch too. Consider per-account and per-IP limits instead of a hard lock.

### M2. Signup leaks whether an email is registered through timing

- **Where:** [src/app/api/auth/register/start/route.ts:34-53](src/app/api/auth/register/start/route.ts#L34-L53)
- **Problem:** a registered email skips the bcrypt hash and the Resend call, so it responds measurably faster. In production, a Resend failure also returns 500 only for *new* emails.
- **Fix:** do equivalent work on both paths, or send the mail in `after()`.

### M3. The OTP brute-force budget is weak

- **Where:** [src/app/api/auth/register/verify-otp/route.ts:107-117](src/app/api/auth/register/verify-otp/route.ts#L107-L117)
- **Problem:**
  - The code is 4 digits and rate limiting is per-IP only, with no per-email limit.
  - The attempt counter is incremented *after* the transaction commits, so concurrent guesses can all read `attempts < 5`.
- **Fix:**
  - Add a per-email limit.
  - Increment atomically: `UPDATE … SET attempts = attempts + 1 WHERE attempts < 5 RETURNING`.
  - Consider 6-digit codes.

### M4. Payout summary overstates what's owed when an RPC read fails

- **Where:** [src/app/api/wallet/payout-summary/route.ts:108-112](src/app/api/wallet/payout-summary/route.ts#L108-L112)
- **Problem:** the comment says a read failure takes "the safe direction, since … overstating it would offer to send funds that aren't there". The code then does exactly that: `?? groupTotal` treats everything as unclaimed.
- **Fix:** fall back to `0n`, or return `null` and let the UI handle "unknown".

### M5. The approve endpoint accepts members in any status

- **Where:** [src/app/api/groups/[groupId]/members/[memberId]/approve/route.ts:28-50](src/app/api/groups/[groupId]/members/[memberId]/approve/route.ts#L28-L50)
- **Problem:** an organizer can "approve" a `removed` member, which re-admits a defaulter, or re-approve an approved one, which moves them to the end of the rotation and resets `joinedAt`.
- **Fix:** require `status === "pending"`.

### M6. Joining ignores group state

- **Where:** [src/app/api/groups/join/[token]/route.ts:82-141](src/app/api/groups/join/[token]/route.ts#L82-L141), [src/app/api/challenges/[groupId]/join/route.ts](src/app/api/challenges/[groupId]/join/route.ts), [src/app/api/challenges/[groupId]/deposit/route.ts](src/app/api/challenges/[groupId]/deposit/route.ts)
- **Problem:**
  - Joining through an invite link works on active, completed and cancelled circles. With auto-approve on, it creates `approved` DB members who can never be admitted on-chain, because the contract only admits while the group is Draft/Open. They then hit `NotMember` when they try to contribute.
  - Challenge join and deposit ignore `status` and `challenge_ends_at`.
- **Fix:** check status (and the end date for challenges) on all three routes.

### M7. Challenge progress breaks after a withdrawal

- **Where:** [src/server/challenges.ts:147-159](src/server/challenges.ts#L147-L159)
- **Problem:** the available amount is computed as the current on-chain balance minus deposits already confirmed. After a member withdraws, that goes negative and none of their later deposits ever confirm. Confirmed "progress" also keeps counting money that has left the contract.
- **Fix:** show `balance_of` directly as progress, or verify each deposit's own transaction.

### M8. Challenge progress can be faked with a self-minted token, or with any hash string

- **Where:** [src/server/challenges.ts:94-179](src/server/challenges.ts#L94-L179), [contract/contracts/challenge/src/lib.rs:123](contract/contracts/challenge/src/lib.rs#L123)
- **Problem:** `deposit` accepts any `token` contract. The backend checks `balance_of` and never checks `token_of` against the challenge's asset. `stellar_tx_hash` isn't checked at all, so any unique string works.
- **Exploit:** a member deploys a token, mints 1e9, deposits it, and shows as having reached the target on the leaderboard.
- **Fix:** require `token_of(...)` to equal the expected asset contract (SAC). Ideally, also verify each submitted hash's `save` event.

### M9. The terms-mismatch check ignores the token

- **Where:** [src/server/groups.ts:53-120](src/server/groups.ts#L53-L120)
- **Problem:** an organizer can create the on-chain group with any token contract (for example the XLM SAC, or their own), while the DB and every screen say USDC. The link still passes the terms check.
- **Fix:** also compare `state.token` with the expected asset contract (SAC).

### M10. The indexer's RPC cost keeps growing for as long as a circle runs

- **Where:** [src/server/stellar/indexer.ts:391-394](src/server/stellar/indexer.ts#L391-L394), [:417-538](src/server/stellar/indexer.ts#L417-L538)
- **Problem:** each cycle's recipient never contributes, by design, so their `(member, cycle)` pair never confirms and gets re-read on every pass. Pending and removed members are included as well, because the member query has no status filter. Each pass therefore costs O(cycles × members) RPC calls, and the GitHub Action runs it every 5 minutes. `memberCount` also counts pending and removed members.
- **Fix:** skip each cycle's recipient and filter members to `approved`. Optionally store a "checked through cycle N" marker per group.

### M11. The cron sweep won't scale

- **Where:** [src/app/api/cron/chain-index/route.ts:29](src/app/api/cron/chain-index/route.ts#L29), [:67](src/app/api/cron/chain-index/route.ts#L67), [src/server/stellar/indexer.ts:93-98](src/server/stellar/indexer.ts#L93-L98)
- **Problem:**
  - The sweep processes groups one at a time under a 60s budget, which includes up to 9s waiting on each payout.
  - Completed groups are included, so they're re-read forever.
  - There's no ordering, so when the sweep times out, the groups at the end are skipped on every run.
- **Fix:** filter to `active`/`open` groups, process the least recently checked first, run with limited concurrency, and stop before the deadline.

### M12. The pending-transaction finalizer can be starved

- **Where:** [src/server/stellar/indexer.ts:772-803](src/server/stellar/indexer.ts#L772-L803), [src/app/api/wallet/withdraw/log/route.ts](src/app/api/wallet/withdraw/log/route.ts)
- **Problem:** the finalizer takes 100 rows with no `orderBy` and no age cutoff. Rows whose hash returns NOT_FOUND (a fake hash, or one older than RPC retention) stay `pending` forever and are re-checked on every pass. `withdraw/log` accepts any string as a hash and has no rate limit.
- **Impact:** about 100 junk rows are enough. Withdrawal logs have no group, so only the global sweep finalizes them, and that sweep would then look at the same 100 rows forever. Every user's withdrawals would stay "pending".
- **Fix:**
  - Validate hashes as 64 hex characters.
  - Rate-limit the route.
  - Order by `updatedAt` and mark rows `failed` after N days of NOT_FOUND.

### M13. The Generate Statement screen is fake

- **Where:** [src/features/profile/GenerateStatementView.tsx:36-40](src/features/profile/GenerateStatementView.tsx#L36-L40), [src/app/api/transactions/statement/route.ts:28](src/app/api/transactions/statement/route.ts#L28)
- **Problem:**
  - The screen waits on `setTimeout`, then tells the user the statement "will be sent to your registered email". It never calls the API.
  - It offers PDF and XLSX. The API returns 501 for PDF and rejects XLSX.
  - The API's `file_type` defaults to `pdf`, so a request without parameters always returns 501.
- **Fix:** call `api.transactions.statement({ file_type: "csv", … })` and download the result. Offer only CSV for now, and default `file_type` to `csv`.

### M14. Two security settings and an email promise do nothing

- **Where:** [src/features/profile/PasswordSecurityView.tsx:27](src/features/profile/PasswordSecurityView.tsx#L27), [:156](src/features/profile/PasswordSecurityView.tsx#L156), [src/server/notifications.ts:169](src/server/notifications.ts#L169)
- **Problem:**
  - `twofa_on_suspicious_withdrawal` is stored and shown but never enforced anywhere.
  - `PasswordSecurityView` keeps that toggle in local state only.
  - Every notification email says "You can turn these emails off in Saji under Profile › Security", but `notify_by_email` has no API or UI.
- **Fix:** wire up an email opt-out, and either implement the 2FA setting or hide it.

### M15. The home dashboard counts pending contributions as paid

- **Where:** [src/app/api/dashboard/route.ts:124](src/app/api/dashboard/route.ts#L124), [:173](src/app/api/dashboard/route.ts#L173)
- **Problem:** if the wallet signature fails after the intent row was created, the circle shows "contributed" and quick-deposit hides it. `GET /api/groups` counts only `confirmed`, so the two screens disagree.
- **Fix:** count `confirmed` only.

### M16. Anyone in a circle can trigger expensive indexer runs without limit

- **Where:** [src/app/api/groups/[groupId]/contributions/confirm/route.ts](src/app/api/groups/[groupId]/contributions/confirm/route.ts), [src/app/api/groups/[groupId]/activate/route.ts](src/app/api/groups/[groupId]/activate/route.ts), [src/app/api/challenges/[groupId]/deposit/route.ts](src/app/api/challenges/[groupId]/deposit/route.ts)
- **Problem:** each call runs a full indexer pass for the group inline, *plus* an `after()` pass that attempts payouts. That's dozens of RPC calls per request. There's no rate limit, so any approved member can exhaust RPC quotas.
- **Fix:** rate-limit per user and group, or debounce.

### M17. The Random, Vote and Custom payout orders aren't implemented

- **Where:** [contract/contracts/savings/src/lib.rs:28-42](contract/contracts/savings/src/lib.rs#L28-L42)
- **Problem:** the rotation is always admission order, which the organizer controls. A member who picked a "Random" circle effectively gets an order the organizer chose.
- **Fix:** implement the policies, or remove them from the UI.

### M18. Amount validation is looser than the contract

- **Where:** [src/app/api/groups/route.ts:116-118](src/app/api/groups/route.ts#L116-L118), [:131](src/app/api/groups/route.ts#L131)
- **Problem:**
  - The decimal regex accepts `"0"`, and the contract rejects `amount <= 0`. That's another create that fails silently (see H6). `savings_target` has the same problem.
  - `z.number()` is still accepted, even though the comment says amounts must be strings. `String(1e-7)` produces `"1e-7"`, which breaks `toStroops`.
- **Fix:** require amounts above zero and accept strings only.

---

## Low

### L1. A wallet challenge is tied to the address, not the user

[src/server/wallet-proof.ts:48](src/server/wallet-proof.ts#L48). Any user can request a challenge for someone else's address and invalidate their pending one. Bind the challenge to the user id too.

### L2. Races on unique constraints return 500 instead of 422

The check-then-write pattern means a concurrent request can hit Prisma's unique-constraint error (P2002) and get a bare 500 instead of a 422:

- `complete-profile` (tag name or email)
- `PATCH /api/profile` (tag name)
- concurrent `PATCH …/onchain`

Map P2002 to a 422.

### L3. Tag names are case-sensitive

`Alice` and `alice` can both be registered, which allows impersonation. Normalize case before the uniqueness check.

### L4. Google sign-in silently overwrites an existing Google link

[src/app/api/auth/google/callback/route.ts:67-83](src/app/api/auth/google/callback/route.ts#L67-L83). It overwrites `googleId` on an email-matched account that's already linked to a different Google account. The `findFirst({ OR })` can also match two different users, which ends in a P2002.

### L5. Balance screens only handle three assets

[src/app/api/wallet/balance/route.ts:22](src/app/api/wallet/balance/route.ts#L22) hard-codes USDC. `saji-balance` ignores groups whose `asset_code` isn't XLM, USDC or USDT, and `asset_code` is free text (up to 12 characters) at creation. Restrict it to an enum.

### L6. `recent_activity` breaks the snake_case convention

[src/app/api/groups/[groupId]/dashboard/route.ts:108](src/app/api/groups/[groupId]/dashboard/route.ts#L108) returns raw camelCase Prisma objects, which `serializers.ts` says must never happen.

### L7. Storage TTLs are inconsistent

- The challenge contract extends entries to 90 days ([lib.rs:100](contract/contracts/challenge/src/lib.rs#L100)) while savings uses 175. A saver who is idle for more than 90 days ends up with archived entries.
- The savings contract never extends `GroupCount`.

### L8. Every withdrawal log sends an email

`withdraw/log` sends a "Withdrawal sent" email via Resend on every call and has no rate limit.

### L9. Bearer tokens live in `localStorage`

[src/lib/api/index.ts:77-85](src/lib/api/index.ts#L77-L85). Any XSS can steal a 30-day token. Consider an httpOnly cookie.

### L10. `tokenSac()` is unused and unsafe to reuse

[src/server/groups.ts:163-173](src/server/groups.ts#L163-L173). It falls back to USDC for unknown assets, which its own comment forbids. Delete it before someone calls it.

---

## Housekeeping and docs

- **Stray file:** `notes---` at the repo root contains only `register`.
- **Uncommitted `pnpm-workspace.yaml` change:** it sets `allowBuilds` to `false` for `prisma` and `@prisma/engines`, while `package.json` → `pnpm.onlyBuiltDependencies` explicitly allows them. Pick one source of truth.
- **`src/server/ARCHITECTURE.md` is out of date:**
  - "Known gaps" #1 (in-memory rate limiting) and #2 (local-filesystem uploads) were both fixed.
  - It refers to `backend/`, but the folder is `php/`.
  - The gap numbering skips 4.
- **`.env.example`** says "This project has no supabase-js dependency", but `@supabase/supabase-js` is installed and used for Realtime.
- **Hard-coded production URL:** [.github/workflows/chain-index-cron.yml:34](.github/workflows/chain-index-cron.yml#L34) uses `https://usesaji.com`. Use a repo variable so forks and staging don't hit production.
- **Advisory lint:** lint runs in CI but doesn't fail the build, with about 439 existing errors.
- **No server tests:** there are none for the server layer, as ARCHITECTURE.md acknowledges. An indexer integration test against a testnet group would have caught H1 to H3.
- **Node version mismatch:** `@types/node` is `^20`, while CI uses Node 22 and Vercel defaults to 24.
- **Type in a mock file:** the `CircleGroup` type lives in `src/lib/utils/mock-data.ts` and production components import it from there. Move it to a types file.
- **Retired backend:** `php/` is no longer used but still in the tree. Consider removing it, or at least excluding it from search and deploys.
