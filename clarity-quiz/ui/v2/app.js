// v2 UI script: improved UX and a slightly more structured API layer.
// Still uses stubbed network calls so it can be read as an educational example
// alongside the documentary.

import { Cl, cvToJSON } from "@stacks/transactions";

const CONTRACT_ADDRESS = "ST000000000000000000002AMW42H"; // replace with your devnet contract address
const CONTRACT_NAME = "quiz";

const logEl = document.getElementById("log");
const difficultyTabs = document.querySelectorAll(".difficulty-tabs button");
const qDifficultyBadge = document.getElementById("q-difficulty");
const qIdSpan = document.getElementById("q-id");
const qPrompt = document.getElementById("q-prompt");
const qAnswers = document.getElementById("q-answers");
const qForm = document.getElementById("q-form");
const qIdInput = document.getElementById("q-id-input");
const qLoadBtn = document.getElementById("q-load");
const qSubmitBtn = document.getElementById("q-submit");
const qFeedback = document.getElementById("q-feedback");

const profilePrincipal = document.getElementById("profile-principal");
const profileLoadBtn = document.getElementById("profile-load");
const profileScore = document.getElementById("profile-score");
const profileAnswered = document.getElementById("profile-answered");

const poolBalance = document.getElementById("pool-balance");
const poolRefreshBtn = document.getElementById("pool-refresh");

function log(message, payload) {
  const time = new Date().toISOString();
  const extra = payload ? `\n${JSON.stringify(payload, null, 2)}` : "";
  logEl.textContent += `[${time}] ${message}${extra}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

// ---- Minimal API layer -----------------------------------------------------

async function callReadOnly(functionName, args, sender) {
  log(`read-only ${functionName}`, { args, sender });
  // Stub: throw so it is obvious this is not yet wired to a node.
  throw new Error(
    "callReadOnly is a stub in this demo. Wire it to a Stacks node JSON-RPC endpoint.",
  );
}

async function callPublic(functionName, args, sender) {
  log(`public ${functionName}`, { args, sender });
  throw new Error(
    "callPublic is a stub in this demo. Use @stacks/connect or a wallet integration.",
  );
}

// ---- UI helpers ------------------------------------------------------------

function setFeedback(kind, message) {
  qFeedback.classList.remove("ok", "error");
  if (kind) qFeedback.classList.add(kind);
  qFeedback.textContent = message;
}

function renderQuestion(json) {
  const { id, prompt, answers, difficulty } = json.value;
  qIdSpan.textContent = id.value.toString();
  qPrompt.textContent = prompt.value;
  qDifficultyBadge.textContent = difficulty.value;

  qAnswers.innerHTML = "";
  answers.value.forEach((answer, index) => {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "answer";
    radio.value = String(index);
    label.appendChild(radio);
    label.appendChild(document.createTextNode(answer.value));
    qAnswers.appendChild(label);
  });

  qSubmitBtn.disabled = false;
  setFeedback(null, "");
}

// ---- Event wiring ----------------------------------------------------------

difficultyTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    difficultyTabs.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    setFeedback(null, `Filter set to ${btn.dataset.difficulty}. Use an index that matches this difficulty.`);
  });
});

qLoadBtn.addEventListener("click", async () => {
  const id = Number(qIdInput.value || "0");
  try {
    const cv = await callReadOnly(
      "get-question",
      [Cl.uint(id)],
      CONTRACT_ADDRESS,
    );
    const json = cvToJSON(cv);
    log("get-question response", json);
    renderQuestion(json);
  } catch (error) {
    setFeedback("error", error.message);
  }
});

qForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const selected = qForm.querySelector("input[name=answer]:checked");
  if (!selected) {
    setFeedback("error", "Pick an answer first.");
    return;
  }
  const id = Number(qIdInput.value || "0");
  const index = Number(selected.value);

  try {
    const principal = profilePrincipal.value.trim() || CONTRACT_ADDRESS;
    const cv = await callPublic(
      "answer-question",
      [Cl.uint(id), Cl.uint(index)],
      principal,
    );

    const json = cvToJSON(cv);
    log("answer-question response", json);

    const ok = json.value["is-correct"].value;
    const rewardPaid = json.value["reward-paid"].value;
    if (ok) {
      setFeedback(
        "ok",
        rewardPaid
          ? "Correct! You should receive a reward from the pool."
          : "Correct! No reward paid (empty pool).",
      );
    } else {
      setFeedback("error", "Incorrect answer. Try a different question.");
    }
  } catch (error) {
    setFeedback("error", error.message);
  }
});

profileLoadBtn.addEventListener("click", async () => {
  const principal = profilePrincipal.value.trim();
  if (!principal) {
    setFeedback("error", "Enter your principal first.");
    return;
  }
  try {
    const cv = await callReadOnly(
      "get-user-stats",
      [Cl.principal(principal)],
      principal,
    );
    const json = cvToJSON(cv);
    log("get-user-stats response", json);
    profileScore.textContent = json.value.score.value.toString();
    profileAnswered.textContent = json.value["questions-answered"].value.toString();
  } catch (error) {
    setFeedback("error", error.message);
  }
});

poolRefreshBtn.addEventListener("click", async () => {
  try {
    const cv = await callReadOnly("get-reward-pool", [], CONTRACT_ADDRESS);
    const json = cvToJSON(cv);
    log("get-reward-pool response", json);
    poolBalance.textContent = json.value.toString();
  } catch (error) {
    setFeedback("error", error.message);
  }
});
