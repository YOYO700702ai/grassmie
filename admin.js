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
  setTimeout(() => el.hidden = true, 2000);
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
  di.addEventListener("change", loadDay);
  document.getElementById("refreshBtn").addEventListener("click", loadDay);
  loadDay();
}

let CURRENT_DATE = "";
let DAY_STATE = {};

async function loadDay() {
  CURRENT_DATE = document.getElementById("dateInput").value;
  if (!CURRENT_DATE) return;
  const d = new Date(CURRENT_DATE + "T00:00:00");
  const dow = d.getDay();
  const note = document.getElementById("dateNote");
  const grid = document.getElementById("grid");
  note.textContent = `${CURRENT_DATE}(週${"日一二三四五六"[dow]})${dow===3?' 公休':''}`;
  if (dow === 3) { grid.innerHTML = ""; return; }
  grid.innerHTML = "<tr><td colspan='4' style='padding:16px;text-align:center;background:#fff;border-radius:6px'>載入中…</td></tr>";

  const res = await api("GET", { action: "list_bookings", date: CURRENT_DATE, status: "all" });
  if (!res.ok) { toast("讀取失敗:" + res.error, "err"); return; }
  DAY_STATE = {};
  // confirmed > blocked > cancelled (忽略 cancelled,confirmed 蓋過 blocked)
  const rank = { confirmed: 3, blocked: 2, cancelled: 0 };
  for (const b of res.data) {
    if (b.status === "cancelled") continue;
    const key = `${b.theme_id}|${b.time}`;
    const prev = DAY_STATE[key];
    if (!prev || (rank[b.status]||0) > (rank[prev.status]||0)) DAY_STATE[key] = b;
  }
  renderGrid();
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
      const b = DAY_STATE[`${t.id}|${time}`];
      let status = "free", label = "空";
      if (b) {
        if (b.status === "blocked") { status = "blocked"; label = "關"; }
        else { status = "booked"; label = "預"; }
      }
      const title = b ? `${time} ${b.name||''} ${b.people||''}人` : time;
      html += `<td><div class="cell ${status}" data-theme="${t.id}" data-time="${time}" data-status="${status}" title="${title}"><span class="t">${time}</span><span class="l">${label}</span></div></td>`;
    }
    html += "</tr>";
  }
  grid.innerHTML = html + "</tbody>";
  grid.querySelectorAll(".cell").forEach((el) => el.addEventListener("click", () => onCellClick(el)));
}

async function onCellClick(el) {
  const status = el.dataset.status;
  const theme = el.dataset.theme;
  const time = el.dataset.time;
  if (status === "booked") { toast("已預約的不能改", "err"); return; }
  el.style.opacity = ".5";
  const action = status === "free" ? "close_slot" : "reopen_slot";
  const res = await api("POST", { action, date: CURRENT_DATE, theme_id: theme, time, reason: "後台" });
  el.style.opacity = "1";
  if (res && res.ok) {
    toast(status === "free" ? "已關閉" : "已重開", "ok");
    loadDay();
  } else {
    toast("失敗:" + (res && res.error || "?"), "err");
  }
}

document.addEventListener("DOMContentLoaded", bindPin);
