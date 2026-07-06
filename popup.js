const DEFAULT_SETTINGS = {
  enabled: true,
  sleepDelaySeconds: 300,
  exceptions: [],
  excludePinned: true,
  excludeAudio: true,
};

function formatDelay(seconds) {
  if (seconds < 60) return `${seconds} detik`;
  if (seconds % 60 === 0) {
    const m = seconds / 60;
    return `${m} menit`;
  }
  return `${Math.round(seconds / 60)} menit`;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isExactExceptionOf(hostname, exceptions) {
  return exceptions.findIndex(
    (p) => p.trim().toLowerCase() === hostname.toLowerCase()
  );
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function refreshUI() {
  const settings = await getSettings();
  document.getElementById("enabledToggle").checked = settings.enabled;
  document.getElementById("subtitle").textContent = settings.enabled
    ? "Menidurkan tab tidak aktif secara otomatis"
    : "Sedang dinonaktifkan";
  document.getElementById("delayLabel").textContent = formatDelay(settings.sleepDelaySeconds);

  const status = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
  if (status?.ok) {
    document.getElementById("sleepingCount").textContent = status.sleeping;
    document.getElementById("totalCount").textContent = status.total;
  }

  const tab = await getActiveTab();
  const hostEl = document.getElementById("currentHost");
  const btn = document.getElementById("exceptBtn");
  const host = tab ? hostnameOf(tab.url) : null;

  if (!host) {
    hostEl.textContent = "Halaman internal (tidak berlaku)";
    btn.disabled = true;
    btn.style.opacity = 0.5;
    return;
  }

  hostEl.textContent = host;
  btn.disabled = false;
  btn.style.opacity = 1;

  const idx = isExactExceptionOf(host, settings.exceptions);
  if (idx >= 0) {
    btn.textContent = "Hapus dari pengecualian";
    btn.classList.add("is-active");
  } else {
    btn.textContent = "Kecualikan situs ini";
    btn.classList.remove("is-active");
  }
}

document.getElementById("enabledToggle").addEventListener("change", async (e) => {
  const settings = await getSettings();
  settings.enabled = e.target.checked;
  await chrome.storage.sync.set(settings);
  refreshUI();
});

document.getElementById("exceptBtn").addEventListener("click", async () => {
  const tab = await getActiveTab();
  const host = tab ? hostnameOf(tab.url) : null;
  if (!host) return;

  const settings = await getSettings();
  const idx = isExactExceptionOf(host, settings.exceptions);
  if (idx >= 0) {
    settings.exceptions.splice(idx, 1);
  } else {
    settings.exceptions.push(host);
  }
  await chrome.storage.sync.set(settings);
  refreshUI();
});

document.getElementById("sleepNowBtn").addEventListener("click", async (e) => {
  const btn = e.target;
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "Menidurkan...";
  const res = await chrome.runtime.sendMessage({ type: "SLEEP_ALL_INACTIVE_NOW" });
  btn.disabled = false;
  if (res?.ok) {
    btn.textContent = `Berhasil: ${res.succeeded}/${res.attempted} tab`;
  } else {
    btn.textContent = "Gagal, coba lagi";
  }
  setTimeout(() => {
    btn.textContent = original;
    refreshUI();
  }, 1800);
});

document.getElementById("openOptions").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refreshUI();
