// ===== Tab Sleeper — background service worker =====

const DEFAULT_SETTINGS = {
  enabled: true,
  sleepDelaySeconds: 300, // default 5 menit
  exceptions: [],         // daftar hostname / pola, contoh: "youtube.com", "*.google.com"
  excludePinned: true,
  excludeAudio: true,
};

// Cache setting di memory supaya tidak query storage tiap saat.
let settings = { ...DEFAULT_SETTINGS };

// Map tabId -> timeoutId (hanya berlaku selama service worker hidup).
const timers = new Map();

// ---------- Util ----------

function normalizeSettings(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  merged.sleepDelaySeconds = Math.max(1, Number(merged.sleepDelaySeconds) || DEFAULT_SETTINGS.sleepDelaySeconds);
  if (!Array.isArray(merged.exceptions)) merged.exceptions = [];
  return merged;
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  settings = normalizeSettings(stored);
  return settings;
}

function hostnameMatchesPattern(hostname, pattern) {
  const p = pattern.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  const h = hostname.toLowerCase();
  if (!p) return false;
  if (p.startsWith("*.")) {
    const base = p.slice(2);
    return h === base || h.endsWith("." + base);
  }
  return h === p || h.endsWith("." + p);
}

function isUrlExcepted(url) {
  if (!url) return true;
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // chrome://, edge://, about: dsb — selalu dikecualikan (tidak bisa/aman didiskard)
    return true;
  }
  if (!hostname) return true;
  return settings.exceptions.some((pattern) => hostnameMatchesPattern(hostname, pattern));
}

function clearTimer(tabId) {
  if (timers.has(tabId)) {
    clearTimeout(timers.get(tabId));
    timers.delete(tabId);
  }
}

async function clearDueMark(tabId) {
  try {
    await chrome.storage.session.remove(`due:${tabId}`);
  } catch {
    /* storage.session mungkin belum siap sesaat setelah install, aman diabaikan */
  }
}

// ---------- Penjadwalan tidur ----------

async function scheduleSleep(tabId) {
  clearTimer(tabId);
  if (!settings.enabled) return;

  const delayMs = settings.sleepDelaySeconds * 1000;
  const dueAt = Date.now() + delayMs;

  const timeoutId = setTimeout(() => {
    trySleepTab(tabId);
  }, delayMs);
  timers.set(tabId, timeoutId);

  try {
    await chrome.storage.session.set({ [`due:${tabId}`]: dueAt });
  } catch {
    /* ignore */
  }
}

async function trySleepTab(tabId) {
  clearTimer(tabId);
  await clearDueMark(tabId);

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return; // tab sudah ditutup
  }
  if (!tab) return;
  if (tab.discarded) return;
  if (tab.active) return; // sedang dilihat user, jangan ditidurkan
  if (settings.excludePinned && tab.pinned) return;
  if (settings.excludeAudio && tab.audible) return;
  if (isUrlExcepted(tab.url)) return;

  try {
    await chrome.tabs.discard(tabId);
  } catch (err) {
    console.warn("[Tab Sleeper] gagal menidurkan tab", tabId, err);
  }
}

async function rescheduleTab(tab) {
  if (!tab || tab.id == null || tab.id === chrome.tabs.TAB_ID_NONE) return;
  clearTimer(tab.id);
  await clearDueMark(tab.id);
  if (!settings.enabled) return;
  if (tab.active) return;
  if (settings.excludePinned && tab.pinned) return;
  if (settings.excludeAudio && tab.audible) return;
  if (isUrlExcepted(tab.url)) return;
  scheduleSleep(tab.id);
}

async function rescheduleAllTabs() {
  await loadSettings();
  for (const tabId of Array.from(timers.keys())) clearTimer(tabId);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    await rescheduleTab(tab);
  }
}

// ---------- Safety net: alarm periodik ----------
// Service worker MV3 bisa "tertidur" dan membatalkan setTimeout yang sedang berjalan.
// Alarm ini membangunkan service worker secara berkala untuk mengecek tab yang
// harusnya sudah tertidur tapi timernya hilang karena worker dimatikan Chrome.
chrome.alarms.create("tab-sleeper-check", { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "tab-sleeper-check") return;
  await loadSettings();
  if (!settings.enabled) return;

  let dueMap = {};
  try {
    dueMap = await chrome.storage.session.get(null);
  } catch {
    dueMap = {};
  }
  const now = Date.now();
  for (const [key, dueAt] of Object.entries(dueMap)) {
    if (!key.startsWith("due:")) continue;
    if (typeof dueAt === "number" && dueAt <= now) {
      const tabId = parseInt(key.slice(4), 10);
      if (!Number.isNaN(tabId)) await trySleepTab(tabId);
    }
  }
});

// ---------- Event listener tab ----------

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  // PENTING: chrome.tabs.onActivated TIDAK menyediakan previousTabId.
  // Jadi kita query ulang semua tab di window yang sama untuk menemukan
  // tab-tab yang sekarang tidak aktif dan menjadwalkan mereka untuk tidur.
  clearTimer(tabId);
  await clearDueMark(tabId);
  try {
    const tabsInWindow = await chrome.tabs.query({ windowId });
    for (const t of tabsInWindow) {
      if (t.id === tabId) continue; // tab yang baru aktif, skip
      await rescheduleTab(t);
    }
  } catch (err) {
    console.warn("[Tab Sleeper] gagal reschedule saat onActivated", err);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.active && windowId !== chrome.windows.WINDOW_ID_NONE && tab.windowId === windowId) {
      clearTimer(tab.id);
      await clearDueMark(tab.id);
    } else if (!tab.active) {
      await rescheduleTab(tab);
    }
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  rescheduleTab(tab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTimer(tabId);
  clearDueMark(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Reset timer saat url berubah, status audio berubah, atau status pin berubah.
  if (changeInfo.url || changeInfo.audible !== undefined || changeInfo.pinned !== undefined || changeInfo.status === "complete") {
    rescheduleTab(tab);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    rescheduleAllTabs();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  rescheduleAllTabs();
});

chrome.runtime.onStartup.addListener(() => {
  rescheduleAllTabs();
});

// Muat setting saat service worker pertama kali dieksekusi.
loadSettings();

// ---------- Pesan dari popup/options (mis. "tidurkan sekarang") ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SLEEP_NOW" && message.tabId) {
    chrome.tabs.discard(message.tabId).then(
      () => sendResponse({ ok: true }),
      (err) => sendResponse({ ok: false, error: String(err) })
    );
    return true;
  }
  if (message?.type === "GET_STATUS") {
    (async () => {
      const tabs = await chrome.tabs.query({});
      const sleeping = tabs.filter((t) => t.discarded).length;
      sendResponse({ ok: true, total: tabs.length, sleeping, enabled: settings.enabled });
    })();
    return true;
  }
  if (message?.type === "SLEEP_ALL_INACTIVE_NOW") {
    (async () => {
      await loadSettings();
      const tabs = await chrome.tabs.query({});
      let attempted = 0;
      let succeeded = 0;
      for (const tab of tabs) {
        if (tab.active || tab.discarded) continue;
        if (settings.excludePinned && tab.pinned) continue;
        if (settings.excludeAudio && tab.audible) continue;
        if (isUrlExcepted(tab.url)) continue;
        attempted++;
        try {
          await chrome.tabs.discard(tab.id);
          succeeded++;
        } catch (err) {
          console.warn("[Tab Sleeper] SLEEP_ALL_INACTIVE_NOW gagal untuk tab", tab.id, err);
        }
      }
      sendResponse({ ok: true, attempted, succeeded });
    })();
    return true;
  }
});
