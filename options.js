const DEFAULT_SETTINGS = {
  enabled: true,
  sleepDelaySeconds: 300,
  exceptions: [],
  excludePinned: true,
  excludeAudio: true,
};

let settings = { ...DEFAULT_SETTINGS };
let saveTimeout = null;

const els = {
  enabledToggle: document.getElementById("enabledToggle"),
  delayValue: document.getElementById("delayValue"),
  delayUnit: document.getElementById("delayUnit"),
  presets: document.getElementById("presets"),
  exceptionInput: document.getElementById("exceptionInput"),
  addExceptionBtn: document.getElementById("addExceptionBtn"),
  exceptionList: document.getElementById("exceptionList"),
  emptyHint: document.getElementById("emptyHint"),
  excludePinned: document.getElementById("excludePinned"),
  excludeAudio: document.getElementById("excludeAudio"),
  toast: document.getElementById("toast"),
};

function showToast(text = "Tersimpan") {
  els.toast.textContent = text;
  els.toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove("show"), 1400);
}

function secondsToUnitValue(seconds) {
  if (seconds % 60 === 0 && seconds >= 60) {
    return { value: seconds / 60, unit: 60 };
  }
  return { value: seconds, unit: 1 };
}

function renderDelayInputs() {
  const { value, unit } = secondsToUnitValue(settings.sleepDelaySeconds);
  els.delayValue.value = value;
  els.delayUnit.value = String(unit);
  highlightMatchingPreset();
}

function highlightMatchingPreset() {
  const buttons = els.presets.querySelectorAll(".preset-btn");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.seconds) === settings.sleepDelaySeconds);
  });
}

function renderExceptions() {
  els.exceptionList.innerHTML = "";
  if (!settings.exceptions.length) {
    els.emptyHint.style.display = "block";
    return;
  }
  els.emptyHint.style.display = "none";
  settings.exceptions.forEach((pattern, idx) => {
    const li = document.createElement("li");
    li.className = "exception-item";
    const span = document.createElement("span");
    span.textContent = pattern;
    const btn = document.createElement("button");
    btn.className = "remove";
    btn.textContent = "Hapus";
    btn.addEventListener("click", () => {
      settings.exceptions.splice(idx, 1);
      persist();
      renderExceptions();
    });
    li.appendChild(span);
    li.appendChild(btn);
    els.exceptionList.appendChild(li);
  });
}

function renderAll() {
  els.enabledToggle.checked = settings.enabled;
  els.excludePinned.checked = settings.excludePinned;
  els.excludeAudio.checked = settings.excludeAudio;
  renderDelayInputs();
  renderExceptions();
}

function persist() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await chrome.storage.sync.set(settings);
    showToast();
  }, 150);
}

function normalizePattern(input) {
  let p = input.trim().toLowerCase();
  p = p.replace(/^https?:\/\//, "");
  p = p.split("/")[0];
  return p;
}

async function init() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  settings = { ...DEFAULT_SETTINGS, ...stored };
  if (!Array.isArray(settings.exceptions)) settings.exceptions = [];
  renderAll();
}

els.enabledToggle.addEventListener("change", (e) => {
  settings.enabled = e.target.checked;
  persist();
});

els.excludePinned.addEventListener("change", (e) => {
  settings.excludePinned = e.target.checked;
  persist();
});

els.excludeAudio.addEventListener("change", (e) => {
  settings.excludeAudio = e.target.checked;
  persist();
});

function applyDelayFromInputs() {
  const raw = Number(els.delayValue.value);
  const unit = Number(els.delayUnit.value);
  if (!raw || raw <= 0) return;
  settings.sleepDelaySeconds = Math.round(raw * unit);
  highlightMatchingPreset();
  persist();
}

els.delayValue.addEventListener("input", applyDelayFromInputs);
els.delayUnit.addEventListener("change", applyDelayFromInputs);

els.presets.addEventListener("click", (e) => {
  const btn = e.target.closest(".preset-btn");
  if (!btn) return;
  settings.sleepDelaySeconds = Number(btn.dataset.seconds);
  renderDelayInputs();
  persist();
});

function addExceptionFromInput() {
  const pattern = normalizePattern(els.exceptionInput.value);
  if (!pattern) return;
  if (!settings.exceptions.includes(pattern)) {
    settings.exceptions.push(pattern);
    persist();
    renderExceptions();
  }
  els.exceptionInput.value = "";
  els.exceptionInput.focus();
}

els.addExceptionBtn.addEventListener("click", addExceptionFromInput);
els.exceptionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addExceptionFromInput();
  }
});

init();
