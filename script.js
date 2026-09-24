"use strict";

/* ---------------- DOM refs ---------------- */
const currentEl = document.getElementById("current");
const previousEl = document.getElementById("previous");
const historyListEl = document.getElementById("history-list");
const historyEmptyEl = document.getElementById("history-empty");
const themeToggle = document.getElementById("theme-toggle");

const THEME_KEY = "calculator-theme";
const MAX_DIGITS = 12;    // max digits typed into one number
const MAX_HISTORY = 30;

/* ---------------- State ---------------- */
const state = {
  current: "0",       // main display value
  previous: null,     // left operand of a pending operation
  operator: null,     // pending operator (÷ × − +)
  overwrite: true,    // next digit replaces the display
  error: false,       // display currently shows an error
  lastOperator: null, // for repeating "=" (5 + 2 = = → 9)
  lastOperand: null,
  previousText: "",   // small line above the main display
};

/* ---------------- Math helpers ---------------- */
const OPERATIONS = {
  "+": (a, b) => a + b,
  "−": (a, b) => a - b,
  "×": (a, b) => a * b,
  "÷": (a, b) => a / b,
};

// Round to 15 significant digits to hide float noise (0.1 + 0.2 → 0.3)
function formatNumber(value) {
  if (!Number.isFinite(value)) return null;
  return String(Number(value.toPrecision(15)));
}

function compute(a, b, operator) {
  return formatNumber(OPERATIONS[operator](parseFloat(a), parseFloat(b)));
}

function errorMessage(operator, b) {
  const isDivByZero = operator === "÷" && parseFloat(b) === 0;
  return isDivByZero ? "Cannot divide by 0" : "Out of range";
}

/* ---------------- Display ---------------- */
function updateDisplay() {
  if (state.error) return; // showError() owns the display while in error
  currentEl.textContent = state.current;
  previousEl.textContent = state.previousText;
}

function showError(message) {
  state.error = true;
  state.overwrite = true;
  state.previousText = "";
  previousEl.textContent = "";
  currentEl.textContent = message;
  currentEl.classList.add("display__current--error");
}

function clearAll() {
  Object.assign(state, {
    current: "0", previous: null, operator: null, overwrite: true,
    error: false, lastOperator: null, lastOperand: null, previousText: "",
  });
  currentEl.classList.remove("display__current--error");
  updateDisplay();
}

/* ---------------- Input handling ---------------- */
function digitCount(text) {
  return (text.match(/\d/g) || []).length;
}

function inputDigit(digit) {
  if (state.error) clearAll(); // recover from error by starting fresh

  if (state.overwrite) {
    // Fresh start (also after "=" or an operator): a typed "." becomes "0."
    state.current = digit === "." ? "0." : digit;
    state.overwrite = false;
    state.lastOperator = null;
    state.lastOperand = null;
  } else {
    if (digit === "." && state.current.includes(".")) return;   // one dot max
    if (digit !== "." && digitCount(state.current) >= MAX_DIGITS) return;
    // Leading zeros: "0" + digit → digit, but "0." is kept
    state.current = state.current === "0" && digit !== "." ? digit : state.current + digit;
  }
  updateDisplay();
}

function chooseOperator(operator) {
  if (state.error) { clearAll(); return; }

  // Chaining: 2 + 3 × 4 → first finish 2 + 3 = 5
  if (state.operator && !state.overwrite) {
    const result = compute(state.previous, state.current, state.operator);
    if (result === null) {
      showError(errorMessage(state.operator, state.current));
      return;
    }
    state.current = result;
  }

  // Two operators in a row just replace the operator (5 + × → 5 ×)
  state.previous = state.current;
  state.operator = operator;
  state.overwrite = true;
  state.previousText = `${state.current} ${operator}`;
  updateDisplay();
}

function equals() {
  if (state.error) return;

  let a;
  let b;
  let operator;
  if (state.operator) {
    a = state.previous;
    b = state.current;
    operator = state.operator;
  } else if (state.lastOperator) {
    // Repeat last operation: 5 + 2 = = → 9
    a = state.current;
    b = state.lastOperand;
    operator = state.lastOperator;
  } else {
    return; // nothing to calculate
  }

  const result = compute(a, b, operator);
  if (result === null) {
    showError(errorMessage(operator, b));
    return;
  }

  const expression = `${a} ${operator} ${b}`;
  addHistory(expression, result);

  state.lastOperator = operator;
  state.lastOperand = b;
  state.previousText = `${expression} =`;
  state.current = result;
  state.previous = null;
  state.operator = null;
  state.overwrite = true;
  updateDisplay();
}

function percent() {
  if (state.error) return;

  const value = parseFloat(state.current);
  // Contextual percent: 200 + 10% adds 20, while 50 × 10% multiplies by 0.1
  const relative =
    state.operator && (state.operator === "+" || state.operator === "−") && state.previous !== null;
  const result = relative ? (parseFloat(state.previous) * value) / 100 : value / 100;

  state.current = formatNumber(result) ?? "0";
  state.overwrite = true;
  state.lastOperator = null;
  state.lastOperand = null;
  updateDisplay();
}

function backspace() {
  if (state.error) { clearAll(); return; }
  if (state.overwrite) return; // result or fresh operator state: nothing to trim

  const next = state.current.slice(0, -1);
  state.current = next === "" ? "0" : next;
  if (state.current === "0") state.overwrite = true;
  updateDisplay();
}

/* ---------------- History ---------------- */
function addHistory(expression, result) {
  const item = document.createElement("li");
  item.className = "history__item";
  item.dataset.action = "history";
  item.dataset.expression = expression;
  item.dataset.result = result;

  const exprSpan = document.createElement("span");
  exprSpan.className = "history__expression";
  exprSpan.textContent = expression;

  const resultSpan = document.createElement("span");
  resultSpan.className = "history__result";
  resultSpan.textContent = result;

  item.append(exprSpan, resultSpan);

  historyEmptyEl.hidden = true;
  historyListEl.prepend(item);
  while (historyListEl.children.length > MAX_HISTORY) {
    historyListEl.lastElementChild.remove();
  }
}

// Clicking a history entry loads its result back onto the display
function useHistory(item) {
  Object.assign(state, {
    current: item.dataset.result,
    previous: null, operator: null, overwrite: true, error: false,
    lastOperator: null, lastOperand: null,
    previousText: `${item.dataset.expression} =`,
  });
  currentEl.classList.remove("display__current--error");
  updateDisplay();
}

function clearHistory() {
  historyListEl.replaceChildren();
  historyEmptyEl.hidden = false;
}

/* ---------------- Theme (dark mode) ---------------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  themeToggle.textContent = isDark ? "☀️" : "🌙";
  themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

function loadTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {
    /* storage unavailable — fall back to OS setting */
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light");
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* ignore: theme still applies for this visit */
  }
}

/* ---------------- Event handling (delegation) ---------------- */
function handleAction(action, value, element) {
  switch (action) {
    case "digit":         inputDigit(value); break;
    case "operator":      chooseOperator(value); break;
    case "equals":        equals(); break;
    case "clear":         clearAll(); break;
    case "backspace":     backspace(); break;
    case "percent":       percent(); break;
    case "history":       useHistory(element); break;
    case "clear-history": clearHistory(); break;
    case "theme":         toggleTheme(); break;
  }
}

// One click listener for the whole page
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  handleAction(target.dataset.action, target.dataset.value, target);
});

/* ---------------- Keyboard support ---------------- */
const KEYBOARD_OPERATORS = { "/": "÷", "*": "×", "-": "−", "+": "+" };

window.addEventListener("keydown", (event) => {
  const { key } = event;
  let action = null;
  let value;

  if (/^[0-9]$/.test(key))                       { action = "digit"; value = key; }
  else if (key === "." || key === ",")           { action = "digit"; value = "."; }
  else if (Object.hasOwn(KEYBOARD_OPERATORS, key)) { action = "operator"; value = KEYBOARD_OPERATORS[key]; }
  else if (key === "Enter" || key === "=")       { action = "equals"; }
  else if (key === "Backspace")                  { action = "backspace"; }
  else if (key === "Escape" || key === "Delete") { action = "clear"; }
  else if (key === "%")                          { action = "percent"; }
  else return;

  event.preventDefault(); // stop "/" quick-find, Enter re-clicking focused buttons, etc.
  handleAction(action, value);
  flashKey(action, value);
});

// Briefly highlight the on-screen key matching a pressed keyboard key
function flashKey(action, value) {
  const selector = `.key[data-action="${action}"]${value ? `[data-value="${value}"]` : ""}`;
  const key = document.querySelector(selector);
  if (!key) return;
  key.classList.add("is-pressed");
  setTimeout(() => key.classList.remove("is-pressed"), 120);
}

/* ---------------- Init ---------------- */
loadTheme();
updateDisplay();
