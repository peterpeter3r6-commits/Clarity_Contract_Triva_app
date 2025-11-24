import { describe, it, expect } from "vitest";
import { Cl } from "@stacks/transactions";

// Clarinet provides the global `simnet` object via vitest-environment-clarinet
const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const CONTRACT_NAME = "quiz";

describe("quiz contract", () => {
  it("allows an admin to be set and add a question", () => {
    // Bootstrap admin to the deployer
    const setAdmin = simnet.callPublicFn(
      CONTRACT_NAME,
      "set-admin",
      [Cl.principal(deployer)],
      deployer,
    );
    expect(setAdmin.result).toBeOk(Cl.principal(deployer));

    // Add a beginner-level question
    const addQuestion = simnet.callPublicFn(
      CONTRACT_NAME,
      "add-question",
      [
        Cl.stringAscii("What is Clarity?"),
        Cl.list([
          Cl.stringAscii("A smart contract language for Bitcoin"),
          Cl.stringAscii("A database query language"),
          Cl.stringAscii("A frontend framework"),
          Cl.stringAscii("An L1 blockchain"),
        ]),
        Cl.uint(0), // correct answer index
        Cl.stringAscii("beginner"),
      ],
      deployer,
    );

    // First question should have id u0
    expect(addQuestion.result).toBeOk(Cl.uint(0));

    // Fetch the question via read-only function
    const question = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      "get-question",
      [Cl.uint(0)],
      deployer,
    );

    expect(question.result).toBeOk(
      Cl.tuple({
        id: Cl.uint(0),
        prompt: Cl.stringAscii("What is Clarity?"),
        answers: Cl.list([
          Cl.stringAscii("A smart contract language for Bitcoin"),
          Cl.stringAscii("A database query language"),
          Cl.stringAscii("A frontend framework"),
          Cl.stringAscii("An L1 blockchain"),
        ]),
        difficulty: Cl.stringAscii("beginner"),
      }),
    );
  });

  it("prevents non-admins from adding questions", () => {
    // Set admin to deployer
    simnet.callPublicFn(
      CONTRACT_NAME,
      "set-admin",
      [Cl.principal(deployer)],
      deployer,
    );

    // wallet1 tries to add a question and should be rejected
    const unauthorizedAdd = simnet.callPublicFn(
      CONTRACT_NAME,
      "add-question",
      [
        Cl.stringAscii("Unauthorized question"),
        Cl.list([
          Cl.stringAscii("Answer 1"),
          Cl.stringAscii("Answer 2"),
        ]),
        Cl.uint(0),
        Cl.stringAscii("beginner"),
      ],
      wallet1,
    );

    // ERR_UNAUTHORIZED = u100
    expect(unauthorizedAdd.result).toBeErr(Cl.uint(100));
  });

  it("rewards correct answers and updates user stats", () => {
    // Setup: admin + one question
    simnet.callPublicFn(
      CONTRACT_NAME,
      "set-admin",
      [Cl.principal(deployer)],
      deployer,
    );

    const addQuestion = simnet.callPublicFn(
      CONTRACT_NAME,
      "add-question",
      [
        Cl.stringAscii("Which difficulty is this question?"),
        Cl.list([
          Cl.stringAscii("beginner"),
          Cl.stringAscii("intermediate"),
          Cl.stringAscii("advanced"),
          Cl.stringAscii("expert"),
        ]),
        Cl.uint(0),
        Cl.stringAscii("beginner"),
      ],
      deployer,
    );
    expect(addQuestion.result).toBeOk(Cl.uint(0));

    // Fund the reward pool with more than one REWARD_AMOUNT (u1000)
    const fund = simnet.callPublicFn(
      CONTRACT_NAME,
      "fund-reward-pool",
      [Cl.uint(10_000)],
      deployer,
    );
    expect(fund.result).toBeOk(Cl.uint(10_000));

    // wallet1 answers the question correctly (index 0)
    const answer = simnet.callPublicFn(
      CONTRACT_NAME,
      "answer-question",
      [Cl.uint(0), Cl.uint(0)],
      wallet1,
    );

    expect(answer.result).toBeOk(
      Cl.tuple({
        "is-correct": Cl.bool(true),
        "reward-paid": Cl.bool(true),
      }),
    );

    // Check user stats: score u1, questions-answered u1
    const stats = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      "get-user-stats",
      [Cl.principal(wallet1)],
      wallet1,
    );

    expect(stats.result).toBeOk(
      Cl.tuple({
        score: Cl.uint(1),
        "questions-answered": Cl.uint(1),
      }),
    );

    // Reward pool should have decreased by REWARD_AMOUNT (u1000)
    const pool = simnet.callReadOnlyFn(
      CONTRACT_NAME,
      "get-reward-pool",
      [],
      deployer,
    );

    expect(pool.result).toBeOk(Cl.uint(9_000));
  });

  it("does not reward incorrect answers and prevents re-answering", () => {
    // Setup: admin + one question
    simnet.callPublicFn(
      CONTRACT_NAME,
      "set-admin",
      [Cl.principal(deployer)],
      deployer,
    );

    const addQuestion = simnet.callPublicFn(
      CONTRACT_NAME,
      "add-question",
      [
        Cl.stringAscii("Pick the correct index"),
        Cl.list([
          Cl.stringAscii("0"),
          Cl.stringAscii("1"),
          Cl.stringAscii("2"),
          Cl.stringAscii("3"),
        ]),
        Cl.uint(1), // correct answer is index 1
        Cl.stringAscii("intermediate"),
      ],
      deployer,
    );
    expect(addQuestion.result).toBeOk(Cl.uint(0));

    // wallet2 answers incorrectly with index 0
    const wrongAnswer = simnet.callPublicFn(
      CONTRACT_NAME,
      "answer-question",
      [Cl.uint(0), Cl.uint(0)],
      wallet2,
    );

    expect(wrongAnswer.result).toBeOk(
      Cl.tuple({
        "is-correct": Cl.bool(false),
        "reward-paid": Cl.bool(false),
      }),
    );

    // wallet2 tries to answer the same question again and should be rejected
    const secondAttempt = simnet.callPublicFn(
      CONTRACT_NAME,
      "answer-question",
      [Cl.uint(0), Cl.uint(1)],
      wallet2,
    );

    // ERR_ALREADY_ANSWERED = u102
    expect(secondAttempt.result).toBeErr(Cl.uint(102));
  });

  it("fails when answering a non-existent question", () => {
    // No questions have been added in this test case

    const answer = simnet.callPublicFn(
      CONTRACT_NAME,
      "answer-question",
      [Cl.uint(999), Cl.uint(0)],
      wallet1,
    );

    // ERR_QUESTION_NOT_FOUND = u101
    expect(answer.result).toBeErr(Cl.uint(101));
  });
});
