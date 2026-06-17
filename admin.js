const API_URL = "https://script.google.com/macros/s/AKfycbyvdtrm3BeDpke6bAbPiIuUrzoyMBOycZRkBtjnVhmpi7DKzdj02puvw9KnlB5enU-X/exec";
const OWNER_PIN = "7872";
const PIN_KEY = "grassmie_admin_pin";

const THEMES = [
  { id: "daughter", title: "女兒",   slots: ["10:00","12:00","14:00","16:00","18:00","20:00"] },
  { id: "hamel",    title: "哈梅爾", slots: ["09:30","11:30","13:30","15:30","17:30","19:30"] },
  { id: "ai",       title: "AI",     slots: ["10:00","12:00","14:00","16:00","18:00","20:00"] },
  { id: "geppetto", title: "杰佩多", slots: ["10:30","12:30","14:30","16:30","18:30","20:30"] },
];

function toast(msg, kind) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = kind || "";
  el.hidden = false;
  setTimeout(() => el.hidden = true, 2200);
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
async function api(method, body) {
  if (method === "GET") {
    const qs = new URLSearchParams(body).toString();
    const r = await fetch(`${API_URL}?${qs}`);
    return r.json();
  }
  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body)
  });
  return r.json();
}

function bindPin() {
  if (localStorage.getItem(PIN_KEY) === OWNER_PIN) { enterApp(); return; }
  document.getElementById("pinBtn").addEventListener("click", checkPin);
  document.getElementById("pinInput").addEventListener("keydown", (e) => { if (e.key === "Enter") checkPin(); });
}
function checkPin() {
  const v = document.getElementById("pinInput").value;
  if (v === OWNER_PIN) { localStorage.setItem(PIN_KEY, v); enterApp(); }
  else document.getElementById("pinErr").textContent = "PIN 錯誤";
}
function enterApp() {
  document.getElementById("pinGate").hidden = true;
  document.getElementById("adminApp").hidden = false;
  const di = document.getElementById("dateInput");
  di.value = toDateStr(new Date());
  di.addEventListener("change", () => { PENDING = {}; loadDay(); });
  document.getElementById("refreshBtn").addEventListener("click", () => { PENDING = {}; loadDay(); });
  document.getElementById("confirmBtn").addEventListener("click", confirmChanges);
  document.getElementById("cancelBtn").addEventListener("click", () => { PENDING = {}; renderGrid(); updateBar(); });
  loadDay();
}

let CURRENT_DATE = "";
let DAY_STATE = {}; // key -> 已落地 booking row
let PENDING = {};   // key -> "close" | "reopen"

async function loadDay() {
  CURRENT_DATE = document.getElementById("dateInput").value;
  if (!CURRENT_DATE) return;
  const d = new Date(CURRENT_DATE + "T00:00:00");
  const dow = d.getDay();
  const note = document.getElementById("dateNote");
  const grid = document.getElementById("grid");
  note.textContent = `${CURRENT_DATE}(週${"日一二三四五六"[dow]})`;
  grid.innerHTML = "<tr><td colspan='4' style='padding:16px;text-align:center;background:#fff;border-radius:6px'>載入中…</td></tr>";

  const res = await api("GET", { action: "list_bookings", date: CURRENT_DATE, status: "all" });
  if (!res.ok) { toast("讀取失敗:" + res.error, "err"); return; }
  DAY_STATE = {};
  const rank = { confirmed: 3, blocked: 2, cancelled: 0 };
  for (const b of res.data) {
    if (b.status === "cancelled") continue;
    const key = `${b.theme_id}|${b.time}`;
    const prev = DAY_STATE[key];
    if (!prev || (rank[b.status]||0) > (rank[prev.status]||0)) DAY_STATE[key] = b;
  }
  renderGrid();
  updateBar();
}

function statusOf(themeId, time) {
  const b = DAY_STATE[`${themeId}|${time}`];
  if (!b) return "free";
  if (b.status === "blocked") return "blocked";
  return "booked";
}

function effectiveStatus(themeId, time) {
  const key = `${themeId}|${time}`;
  const real = statusOf(themeId, time);
  if (!PENDING[key]) return { real, shown: real, pending: false };
  // 有待提交的變更
  const next = PENDING[key] === "close" ? "blocked" : "free";
  return { real, shown: next, pending: true };
}

function renderGrid() {
  const grid = document.getElementById("grid");
  let html = "<thead><tr>";
  for (const t of THEMES) html += `<th>${t.title}</th>`;
  html += "</tr></thead><tbody>";
  for (let i = 0; i < 6; i++) {
    html += "<tr>";
    for (const t of THEMES) {
      const time = t.slots[i];
      const { shown, real, pending } = effectiveStatus(t.id, time);
      const label = shown === "free" ? "空" : shown === "blocked" ? "關" : "預";
      const b = DAY_STATE[`${t.id}|${time}`];
      const title = b ? `${time} ${b.name||''} ${b.people||''}人` : time;
      const cls = `cell ${shown}${pending ? ' pending' : ''}`;
      html += `<td><div class="${cls}" data-theme="${t.id}" data-time="${time}" data-real="${real}" title="${title}"><span class="t">${time}</span><span class="l">${label}</span></div></td>`;
    }
    html += "</tr>";
  }
  grid.innerHTML = html + "</tbody>";
  grid.querySelectorAll(".cell").forEach((el) => el.addEventListener("click", () => onCellClick(el)));
}

function onCellClick(el) {
  const real = el.dataset.real;
  if (real === "booked") { toast("已預約的不能改", "err"); return; }
  const key = el.dataset.theme + "|" + el.dataset.time;
  if (PENDING[key]) delete PENDING[key];
  else PENDING[key] = real === "free" ? "close" : "reopen";
  renderGrid();
  updateBar();
}

function updateBar() {
  const n = Object.keys(PENDING).length;
  const bar = document.getElementById("confirmBar");
  if (n === 0) { bar.hidden = true; return; }
  bar.hidden = false;
  let closes = 0, reopens = 0;
  for (const k in PENDING) PENDING[k] === "close" ? closes++ : reopens++;
  const parts = [];
  if (closes) parts.push(`關 ${closes} 場`);
  if (reopens) parts.push(`開 ${reopens} 場`);
  document.getElementById("pendingCount").textContent = parts.join(' / ');
}

async function confirmChanges() {
  const entries = Object.entries(PENDING);
  if (entries.length === 0) return;
  const btn = document.getElementById("confirmBtn");
  btn.disabled = true;

  // 先試 batch (一個請求)
  btn.textContent = `送出中… (${entries.length})`;
  const ops = entries.map(([key, action]) => {
    const [theme_id, time] = key.split('|');
    return { op: action, theme_id, time, date: CURRENT_DATE };
  });
  let resp = await api("POST", { action: "batch_slot_ops", ops });
  let results = (resp && resp.ok && Array.isArray(resp.results)) ? resp.results : null;

  // batch 不支援 → fallback: 逐筆序列送 (避免 LockService 並行 timeout)
  if (!results) {
    results = [];
    for (let i = 0; i < entries.length; i++) {
      btn.textContent = `送出中… (${i+1}/${entries.length})`;
      const [key, action] = entries[i];
      const [theme_id, time] = key.split('|');
      const a = action === "close" ? "close_slot" : "reopen_slot";
      try {
        const r = await api("POST", { action: a, date: CURRENT_DATE, theme_id, time, reason: "後台" });
        results.push(r);
      } catch (e) {
        results.push({ ok: false, error: String(e) });
      }
    }
  }

  let ok = 0, fail = 0;
  const failedPending = {};
  results.forEach((r, i) => {
    const [key, action] = entries[i];
    if (r && r.ok) {
      ok++;
      const [theme_id, time] = key.split('|');
      if (action === "close") {
        DAY_STATE[key] = { id: r.id, theme_id, time, status: "blocked", name: "(關閉) 後台" };
      } else {
        delete DAY_STATE[key];
      }
    } else {
      fail++;
      failedPending[key] = action;
    }
  });

  PENDING = failedPending;
  btn.disabled = false;
  btn.textContent = "確定";
  renderGrid();
  updateBar();
  if (fail === 0) toast(`完成 ${ok} 個變更`, "ok");
  else toast(`成功 ${ok} 失敗 ${fail}`, "err");
}

document.addEventListener("DOMContentLoaded", bindPin);
