# Mock mode: frontend without the backend

With `NEXT_PUBLIC_USE_MOCKS=true` in `.env.local`, the app runs with no database, no Stellar RPC and no wallet extension. Every backend call is answered from an in-memory store instead. A **Mock data** badge in the bottom-left corner shows when it's on.

```bash
pnpm dev   # .env.local already sets NEXT_PUBLIC_USE_MOCKS=true
```

To reattach the backend, set `NEXT_PUBLIC_USE_MOCKS=false` (or delete the line) and restart `pnpm dev`. Nothing in the UI changes between the two modes.

## How it works

The frontend reaches the outside world in three places, and each checks the flag:

| Real module | In mock mode, answered by |
| --- | --- |
| `src/lib/api/index.ts` → `request()` / `downloadFile()` | `api.ts`: one handler per `/api/*` route |
| `src/lib/contract/client.ts` → `savingsClient()` / `challengeClient()` | `chain.ts`: fake savings and challenge contracts |
| `src/lib/wallet/index.ts` → connect, sign, balances, trustlines | `chain.ts` → `wallet` |

Hooks, pages and components are untouched.

- `enabled.ts`: the flag. It's the only mock file imported statically. The others are loaded with `import()` only when the flag is on.
- `db.ts`: seed data, the on-chain state and serializers.
- `api.ts`: the API routes.
- `chain.ts`: the contracts and the wallet.

The mocks follow the real wire format: ids are strings, money is a decimal string and fields are snake_case. Validation errors use the same `{ message, errors }` shape and status codes, and contract failures throw the real `Error(Contract, #N)` codes. UI built against the mocks should therefore work unchanged against the real backend.

## What you're working with

You're signed in as **Ada Okafor** (`ada@example.com`), with a wallet already connected.

| Id | Circle | What it's good for |
| --- | --- | --- |
| 10 | Family Ajo (you organize) | Active, cycle 1. Unclaimed 148.5 USDC payout, one pending join request, and you still owe this cycle. |
| 11 | Office Esusu (Bayo organizes) | Active and `hide_balances` on. You've already paid this cycle. |
| 12 | Rent Circle (you organize) | Draft, not yet on-chain. Exercises the setup / "create on-chain" flow. |
| 13 | Holiday Fund | Completed rotation. |
| 20, 21, 22 | Challenges | You're in 20; 21 is joinable; 22 has `hide_balances` on. |

Invite links: `/groups/join/family-ajo`, `/groups/join/rent-circle`, `/groups/join/office-esusu`.

**Actions update the store.** Contributing, approving, claiming, withdrawing, creating circles and so on all change the data, and a fully funded cycle pays out just as the indexer would. Data survives client-side navigation. **A full page reload resets everything to the seed.**

## Triggering error states

- **Login:** any email and password work, except the password `wrong`.
- **Signup OTP:** any 4 digits work, except `0000`.
- **Change password:** a current password of `wrong` is rejected.
- **Logging out works.** You stay signed out until you log in again (any credentials).
- **Contract rules are enforced**, as in the real contract, for example:
  - The current recipient can't contribute (`#20`).
  - A cycle can't start with fewer than 2 members (`#10`).
  - Fees above 10% are rejected (`#3`).
  - Cycles longer than 120 days are rejected (`#11`).

## Adding to it

- **A screen calls an endpoint that isn't mocked:** the console prints `[mocks] no mock for GET /api/...`. Add a route to the `routes` list in `api.ts`, copying the response shape from the real handler in `src/app/api/`.
- **A screen needs different data:** edit the seed in `db.ts`.
- **A new contract method:** add a `case` in `chain.ts`.

**Never enable mock mode in a deployed environment.** The flag is inlined at build time.
