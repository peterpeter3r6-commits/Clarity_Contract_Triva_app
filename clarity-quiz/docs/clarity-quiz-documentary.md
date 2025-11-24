# Clarity Quiz – Documentary

This document walks through the **Clarity Quiz** project from first principles to more advanced concepts. By the end, you should understand how the smart contract, tests, and UI fit together, and how to extend the system further.

---

## 1. What are Clarity and Clarinet?

**Clarity** is the smart contract language used on the Stacks blockchain. Key properties:

- **Decidable**: execution is predictable – there is no unbounded looping or dynamic code loading.
- **Interpreted, not compiled**: contracts are stored and executed directly on-chain.
- **Strongly typed**: functions, variables, and maps all have explicit types.

**Clarinet** is a local development toolchain for Clarity:

- Compiles and analyzes contracts (`clarinet check`).
- Provides a **simulated network** (Simnet) for fast tests.
- Integrates with **Vitest** via `vitest-environment-clarinet`.

In this project we use Clarinet to:

- Define and analyze the `quiz.clar` contract.
- Run tests that exercise quiz logic and STX rewards.
- Provide a manifest (`Clarinet.toml`) that tools and tests reference.

---

## 2. Project layout

At a high level, the `clarity-quiz` project looks like this:

- `Clarinet.toml` – Clarinet manifest, registers the `quiz` contract.
- `contracts/quiz.clar` – main Clarity contract implementing the quiz and reward pool.
- `tests/quiz.test.ts` – Vitest tests that call into the contract using Simnet.
- `ui/v1/` – first, minimal UI (basic layout; focuses on code examples).
- `ui/v2/` – redesigned UI with better UX and structured JS code.
- `docs/clarity-quiz-documentary.md` – this document.

You work primarily inside the `clarity-quiz` directory:

- Analyze contracts: `clarinet check`
- Run tests (after installing deps): `npm install && npm test`

---

## 3. The `quiz.clar` smart contract – beginner view

### 3.1 Core ideas

The contract is built around a few core concepts:

- **Questions**: on-chain records with a prompt, up to 4 possible answers, a difficulty label, and the index of the correct answer.
- **User stats**: how many questions a user has answered and how many they got correct.
- **User answers**: tracks whether a user has already answered a specific question.
- **Reward pool**: STX balance tracked in a data variable and held by the contract to reward correct answers.

### 3.2 Data definitions

We define constants for error codes and reward amount, then data variables and maps:

- `ERR_UNAUTHORIZED`, `ERR_QUESTION_NOT_FOUND`, `ERR_ALREADY_ANSWERED`, `ERR_INVALID_ANSWER_INDEX` – numeric error codes (`uint`) used consistently across functions.
- `REWARD_AMOUNT` – how many micro-STX to attempt to send per correct answer.
- `admin` – an **optional principal**; `none` at first, then set to `some <principal>` via `set-admin`.
- `next-question-id` – a `uint` counter for the next question id.
- `reward-pool` – `uint` accounting value mirroring how many micro-STX the contract holds for rewards.

Maps:

- `questions { id: uint } -> { prompt, answers, correct-index, difficulty }`
- `user-stats { user: principal } -> { score: uint, questions-answered: uint }`
- `user-answers { user: principal, question-id: uint } -> { is-correct: bool }`

Clarity maps are simple key–value stores with statically typed keys and values.

### 3.3 Helper functions

The contract has a few private helpers to keep the public functions simpler:

- `is-admin (who principal)` – checks whether `who` matches the stored `admin` (if any).
- `generate-question-id` – returns the current `next-question-id` and increments it.
- `update-user-stats (user, is-correct)` – increments `questions-answered` for a user and, if correct, increments `score`.
- `distribute-reward (recipient)` – tries to send `REWARD_AMOUNT` STX from the contract to `recipient` if `reward-pool` is large enough.

These helpers hide details like reading and writing data maps and handling `option` / `response` types.

---

## 4. The `quiz.clar` smart contract – intermediate view

### 4.1 Access control and `set-admin`

The contract does not hard-code a deployer principal. Instead, it uses an optional admin pattern:

- Initially, `admin` is `none`.
- The **first call** to `set-admin` can come from any principal and sets `admin` to `some new-admin`.
- Subsequent calls to `set-admin` check that `tx-sender` matches the current admin; otherwise they return `ERR_UNAUTHORIZED`.

This pattern is flexible for local dev, tests, and even mainnet deployments.

### 4.2 Managing questions

Admin-only functions:

- `add-question(prompt, answers, correct-index, difficulty)`
  - Requires `is-admin tx-sender` to be true.
  - Validates that `correct-index < len(answers)`.
  - Generates a new question id and stores the record in `questions`.
  - Returns the id as `ok u<id>`.

- `update-question(id, prompt, answers, correct-index, difficulty)`
  - Also requires admin.
  - Validates the `correct-index` again.
  - Requires the question to exist; otherwise returns `ERR_QUESTION_NOT_FOUND`.

Design choices:

- Questions are immutable by id, but the admin can update content via `update-question` (for example to fix typos or rebalance difficulties).
- Difficulty is stored as a short string like `"beginner"`, `"intermediate"`, or `"advanced"`. The UI uses this for filtering.

### 4.3 Answering questions

User-facing function:

- `answer-question(id, selected-index)`

Workflow:

1. Fetch the question from the `questions` map. If missing, return `ERR_QUESTION_NOT_FOUND`.
2. Validate `selected-index` against the `answers` list length. If out of range, return `ERR_INVALID_ANSWER_INDEX`.
3. Check `user-answers` to ensure the user has not already answered this question. If they have, return `ERR_ALREADY_ANSWERED`.
4. Compute `is-correct` by comparing `selected-index` with `correct-index` stored in the question.
5. Store `{ is-correct }` in `user-answers` for `(user, question-id)`.
6. Call `update-user-stats` to bump totals.
7. If correct, call `distribute-reward` and return `{ is-correct: true, reward-paid: <bool> }`.
8. If incorrect, return `{ is-correct: false, reward-paid: false }`.

Important:

- The function **never reveals the correct index** directly. Users see whether they were correct but not which index is correct when they are wrong.
- `distribute-reward` is deliberately written not to revert if the transfer fails. It simply returns `false` and leaves the accounting unchanged.

### 4.4 Reward pool mechanics

The reward pool is managed by:

- `fund-reward-pool(amount)`
  - Executes `stx-transfer? amount tx-sender (as-contract tx-sender)`.
  - Uses `try!` so that if the transfer fails (e.g., insufficient funds), the entire transaction reverts.
  - On success, increments `reward-pool` by `amount` and returns the new total.

- `distribute-reward(recipient)` (private)
  - Reads `reward-pool` and checks it is at least `REWARD_AMOUNT`.
  - Calls `stx-transfer? REWARD_AMOUNT (as-contract tx-sender) recipient` to send STX out of the contract.
  - On success, decrements `reward-pool` by `REWARD_AMOUNT` and returns `true`.
  - On failure, returns `false` without changing state.

This showcases:

- The difference between **user-funded** and **contract-funded** transfers.
- The `as-contract` pattern for moving STX in and out of a contract.
- How to keep a separate accounting variable (`reward-pool`) in sync with actual contract balance.

### 4.5 Read-only helpers

Read-only functions expose safe views of contract state:

- `get-question(id)` – returns `{ id, prompt, answers, difficulty }` without exposing `correct-index`.
- `get-user-stats(user)` – returns `{ score, questions-answered }`, defaulting to `{0, 0}` if the user has no stats yet.
- `get-reward-pool()` – returns the current `reward-pool` value.

Read-only functions cannot mutate state and are free for users to call (off-chain) via JSON-RPC.

---

## 5. Testing with Clarinet and Vitest – advanced view

The test file `tests/quiz.test.ts` demonstrates how to use the Clarinet **Simnet** from TypeScript.

### 5.1 Test environment

- The `vitest.config.js` is configured to use the `clarinet` environment.
- Each test case runs against a fresh simulated blockchain state.
- A global `simnet` object is available, exposing helpers such as:
  - `simnet.getAccounts()` – returns named accounts like `deployer`, `wallet_1`, `wallet_2`.
  - `simnet.callPublicFn(contract, fn, args, sender)` – mines a block and calls a public Clarity function.
  - `simnet.callReadOnlyFn(contract, fn, args, sender)` – evaluates a read-only function without mining.

The tests also use the `Cl` helpers from `@stacks/transactions` to construct typed Clarity values (e.g. `Cl.uint(0)`, `Cl.stringAscii("text")`, `Cl.list([...])`).

### 5.2 What the tests cover

The suite is organized into several `it(...)` blocks:

1. **Admin setup and question creation**
   - Calls `set-admin` to set the admin to the `deployer` account.
   - Calls `add-question` with a beginner question, expecting the id `u0`.
   - Uses `get-question` to verify that the stored question matches exactly.

2. **Unauthorized question creation**
   - Sets the admin to `deployer`.
   - Attempts to call `add-question` from `wallet_1`.
   - Asserts that the result is an error with code `u100` (`ERR_UNAUTHORIZED`).

3. **Rewarded correct answers**
   - Sets the admin, adds a beginner question.
   - Calls `fund-reward-pool` with `10_000` micro-STX.
   - Calls `answer-question` from `wallet_1` with the correct index.
   - Expects `{ is-correct: true, reward-paid: true }`.
   - Uses `get-user-stats` to assert `{ score: 1, questions-answered: 1 }`.
   - Uses `get-reward-pool` to assert that the pool decreased by `REWARD_AMOUNT`.

4. **Incorrect answers and re-answers**
   - Sets admin and adds a question where the correct index is `1`.
   - `wallet_2` answers with index `0` (incorrect) and receives `{ is-correct: false, reward-paid: false }`.
   - `wallet_2` attempts to answer again and gets `ERR_ALREADY_ANSWERED` (`u102`).

5. **Non-existent questions**
   - Calls `answer-question` with an id that has never been created.
   - Asserts that the error code is `u101` (`ERR_QUESTION_NOT_FOUND`).

### 5.3 How to run the tests

From the `clarity-quiz` directory:

1. Install dependencies once:

   ```bash
   npm install
   ```

2. Run the tests:

   ```bash
   npm test
   ```

3. (Optional) Watch mode with coverage and cost reports:

   ```bash
   npm run test:watch
   ```

These commands rely on the Clarinet SDK helpers to automatically initialize and tear down Simnet for you.

---

## 6. Frontend UIs – from basics to improved UX

This project intentionally ships with **two** UIs to illustrate how the same contract can be integrated at different levels of sophistication.

### 6.1 UI v1 – minimal and explicit

Located in `ui/v1/`, this version has:

- A simple layout with three panels:
  - Load and answer a question by id.
  - Load user stats by principal.
  - Show example code snippets for admin actions.
- Very basic event handling in `app.js` that:
  - Logs **intended** read-only calls and transactions.
  - Leaves the actual network wiring (`callReadOnly`) as a **stub**, to be filled in for your environment.
- Example usage of `@stacks/transactions` `Cl` helpers and `@stacks/connect` in code snippets.

The goal of v1 is clarity over completeness. You can read the code like a tutorial, then connect it to a real Stacks node and wallet.

### 6.2 UI v2 – improved UX and structure

Located in `ui/v2/`, this version demonstrates a more polished experience:

- A top bar with **difficulty filter tabs** (All / Beginner / Intermediate / Advanced).
- A **question card** with:
  - Difficulty badge.
  - Question id.
  - Prompt and list of answers as selectable options.
  - Clear feedback messages for success and error states.
- A side column with:
  - **Profile panel** showing score and total questions answered for a given principal.
  - **Reward pool panel** that reads the current `reward-pool` value.
  - A small explanation of which Clarity functions each interaction uses.
- A more modular `app.js` that:
  - Introduces a tiny **API layer** (`callReadOnly`, `callPublic`) which is still stubbed.
  - Decodes Clarity values from `cvToJSON` and maps them into DOM updates.
  - Provides structured feedback via `setFeedback(kind, message)` to style success vs error states.

v2 is closer to a real dApp front-end: the only missing piece is wiring the stubbed functions to a Stacks node and a wallet integration.

### 6.3 Wiring the UIs to a real network (outline)

To make either UI fully functional, you would:

1. Run `clarinet integrate` or a Devnet node.
2. Deploy the `quiz` contract to that network.
3. Replace `CONTRACT_ADDRESS` (and, if needed, `CONTRACT_NAME`) in the UI JS files.
4. Implement `callReadOnly` using `fetch` with the Stacks JSON-RPC `call-read-only-function` endpoint.
5. Implement `callPublic` using a wallet integration such as `@stacks/connect` `openContractCall`.

The existing code and examples in `ui/v1/app.js` and `ui/v2/app.js` are intentionally structured to make this mapping straightforward.

---

## 7. Extending the project – advanced ideas

Here are some directions to take this from a learning project to something production-like:

1. **SIP-010 fungible token rewards**
   - Instead of direct STX payouts, deploy a SIP-010 token contract.
   - Mint tokens to the quiz contract and reward users with tokens.

2. **Leaderboards**
   - Maintain a small on-chain leaderboard (e.g., top N users by score), updated whenever user stats change.
   - Or, index events off-chain (via a PostgreSQL indexer) for more complex leaderboards.

3. **Question pools per difficulty**
   - Add read-only functions to list all questions by difficulty.
   - Let the UI randomly select from that subset.

4. **Time-based quizzes**
   - Store block height when a quiz session starts.
   - Only accept answers within a certain window of blocks.

5. **Permissions and roles**
   - Add separate roles for quiz creators vs contract admin.
   - Let the admin freeze or archive old questions.

Each extension gives you more practice with:

- Working with Clarity types (tuples, lists, options, responses).
- Designing access control and upgrade patterns.
- Integrating on-chain logic with off-chain UIs and indexers.

---

## 8. How to use this project as a learning path

To get the most out of this repository:

1. **Read** `contracts/quiz.clar` top to bottom, then re-read sections of this documentary.
2. **Run** `clarinet check` and inspect warnings to understand safety checks.
3. **Modify** or add new questions and tests in `tests/quiz.test.ts`.
4. **Connect** the UI stubs to a real Devnet and see the on-chain state change.
5. **Extend** the contract with one advanced feature (e.g., leaderboards or SIP-010 rewards) and write tests for it.

By iterating through these steps, you will move from beginner to intermediate and into advanced Clarity and Clarinet usage, with this quiz app as a concrete, end-to-end example.
