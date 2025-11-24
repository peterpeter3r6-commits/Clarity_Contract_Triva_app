// v1 UI script: minimal but explicit wiring to the `quiz` contract.
// This file focuses on clarity and learning. It shows how you would build
// read-only calls and transactions. To actually send transactions from a
// browser, you will need to plug in a Stacks wallet library (e.g. Hiro Wallet
// or Leather) and configure network endpoints.

import {
  Cl,
  cvToJSON,
} from "@stacks/transactions";

const CONTRACT_ADDRESS = "ST000000000000000000002AMW42H"; // replace with your devnet address
const CONTRACT_NAME = "quiz";

const logEl = document.getElementById("log");
const questionIdInput = document.getElementById("question-id");
const loadQuestionBtn = document.getElementById("load-question");
const questionView = document.getElementById("question-view");
const questionPromptEl = document.getElementById("question-prompt");
const questionDifficultyEl = document.getElementById("question-difficulty");
const answerOptionsEl = document.getElementById("answer-options");
const answerForm = document.getElementById("answer-form");

const userPrincipalInput = document.getElementById("user-principal");
const loadStatsBtn = document.getElementById("load-stats");
const statsView = document.getElementById("stats-view");
const statsScoreEl = document.getElementById("stats-score");
const statsAnsweredEl = document.getElementById("stats-answered");

const exampleSetAdminBtn = document.getElementById("example-set-admin");
const exampleAddQuestionBtn = document.getElementById("example-add-question");
const exampleFundPoolBtn = document.getElementById("example-fund-pool");
const adminExampleEl = document.getElementById("admin-example");

function log(message) {
  const time = new Date().toISOString();
  logEl.textContent += `[${time}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

// ---- Read-only calls (using Clarinet devnet endpoint) ----

async function callReadOnly(functionName, args, sender) {
  // This is a stubbed implementation to keep the example self-contained.
  // In a real app you would use the Stacks JSON-RPC endpoint and
  // @stacks/network helpers. For the documentary, this file is meant to be
  // read alongside the explanation.
  log(`read-only call: ${functionName}(${JSON.stringify(args)}) from ${sender}`);
  throw new Error(
    "callReadOnly is a stub. Wire this up to a Stacks node JSON-RPC endpoint in your environment.",
  );
}

loadQuestionBtn.addEventListener("click", async () => {
  const id = Number(questionIdInput.value || "0");
  try {
    const result = await callReadOnly(
      "get-question",
      [Cl.uint(id)],
      CONTRACT_ADDRESS,
    );
    log(`Question result: ${JSON.stringify(cvToJSON(result))}`);
    // Here you would parse the ClarityValue and render it; we keep it simple.
    questionView.classList.remove("hidden");
    questionPromptEl.textContent = "Loaded question (see console / log).";
    questionDifficultyEl.textContent = "(check on-chain data)";
    answerOptionsEl.innerHTML = "<p>This v1 UI leaves the concrete decoding as an exercise.</p>";
  } catch (error) {
    log(`Error loading question: ${error.message}`);
  }
});

answerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = Number(questionIdInput.value || "0");
  const selected = answerForm.querySelector("input[name=answer]:checked");
  if (!selected) {
    log("Please select an answer first.");
    return;
  }
  const index = Number(selected.value);
  log(
    `You would now build a transaction to call answer-question(${id}, ${index}). See admin examples below for how to construct a transaction.",
  );
});

loadStatsBtn.addEventListener("click", async () => {
  const principal = userPrincipalInput.value.trim();
  if (!principal) {
    log("Enter your principal to load stats.");
    return;
  }
  try {
    const result = await callReadOnly(
      "get-user-stats",
      [Cl.principal(principal)],
      principal,
    );
    log(`Stats result: ${JSON.stringify(cvToJSON(result))}`);
    statsView.classList.remove("hidden");
    statsScoreEl.textContent = "see log";
    statsAnsweredEl.textContent = "see log";
  } catch (error) {
    log(`Error loading stats: ${error.message}`);
  }
});

// ---- Admin code examples (non-functional snippets) ----

exampleSetAdminBtn.addEventListener("click", () => {
  adminExampleEl.textContent = `// Example: set the admin to the connected wallet\n\nimport { openContractCall } from "@stacks/connect";\nimport { Cl } from "@stacks/transactions";\n\nawait openContractCall({\n  contractAddress: "${CONTRACT_ADDRESS}",\n  contractName: "${CONTRACT_NAME}",\n  functionName: "set-admin",\n  functionArgs: [Cl.principal(userAddress)],\n  network, // your Stacks network instance\n});`;
});

exampleAddQuestionBtn.addEventListener("click", () => {
  adminExampleEl.textContent = `// Example: add a new beginner question\n\nawait openContractCall({\n  contractAddress: "${CONTRACT_ADDRESS}",\n  contractName: "${CONTRACT_NAME}",\n  functionName: "add-question",\n  functionArgs: [\n    Cl.stringAscii("What is Clarity?"),\n    Cl.list([\n      Cl.stringAscii("A smart contract language for Bitcoin"),\n      Cl.stringAscii("A database query language"),\n      Cl.stringAscii("A frontend framework"),\n      Cl.stringAscii("An L1 blockchain"),\n    ]),\n    Cl.uint(0),\n    Cl.stringAscii("beginner"),\n  ],\n  network,\n});`;
});

exampleFundPoolBtn.addEventListener("click", () => {
  adminExampleEl.textContent = `// Example: fund the reward pool with 10_000 micro-STX\n\nawait openContractCall({\n  contractAddress: "${CONTRACT_ADDRESS}",\n  contractName: "${CONTRACT_NAME}",\n  functionName: "fund-reward-pool",\n  functionArgs: [Cl.uint(10_000)],\n  postConditionMode: 1, // allow exact STX transfer\n  network,\n});`;
});
