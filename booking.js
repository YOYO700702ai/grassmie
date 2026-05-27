/**
 * 預約流程 - 五個步驟
 * 後端: Google Apps Script(部署後把 URL 貼到下方 API_URL)
 */

const API_URL = "https://script.google.com/macros/s/AKfycbyvdtrm3BeDpke6bAbPiIuUrzoyMBOycZRkBtjnVhmpi7DKzdj02puvw9KnlB5enU-X/exec";

// 每個主題各自固定每 2 小時一場;週三公休。平假日場次相同。
const THEME_SLOTS = {
  daughter: {
    weekday: ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"],
    weekend: ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"]
  },
  ai: {
    weekday: ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"],
    weekend: ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"]
  },
  hamel: {
    weekday: ["09:30", "11:30", "13:30", "15:30", "17:30", "19:30"],
    weekend: ["09:30", "11:30", "13:30", "15:30", "17:30", "19:30"]
  },
  geppetto: {
    weekday: ["10:30", "12:30", "14:30", "16:30", "18:30", "20:30"],
    weekend: ["10:30", "12:30", "14:30", "16:30", "18:30", "20:30"]
  }
};

const state = {
  step: 1,
  themeId: null,
  date: null,       // YYYY-MM-DD
  people: null,
  time: null,
  name: "",
  phone: "",
  email: "",
  note: "",
  taken: []
};

function getTheme() {
  return themes.find((t) => t.id === state.themeId);
}

function todayStr() {
  const d = new Date();
  return toDateStr(d);
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isClosedDay(dateStr) {
  // 每週三公休 (getDay: 日0 一1 二2 三3)
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay() === 3;
}

// 最早可訂的日期 = 現在 + 24 小時
function minBookingDateStr() {
  return toDateStr(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function slotsForThemeDate(themeId, dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  if (dow === 3) return []; // 週三公休
  const t = THEME_SLOTS[themeId];
  if (!t) return [];
  const isWeekend = dow === 0 || dow === 6;
  let slots = isWeekend ? t.weekend : t.weekday;
  // 24 小時截止點
  const cutoffMs = Date.now() + 24 * 60 * 60 * 1000;
  slots = slots.filter((s) => {
    const slotMs = new Date(`${dateStr}T${s.length === 4 ? "0" : ""}${s}:00`).getTime();
    return slotMs >= cutoffMs;
  });
  return slots;
}

function setStep(n) {
  state.step = n;
  syncStepBar();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function syncStepBar() {
  document.querySelectorAll("#stepBar li").forEach((li) => {
    const step = Number(li.dataset.step);
    li.classList.toggle("active", step === state.step);
    li.classList.toggle("done", step < state.step);
  });
}

function render() {
  const stage = document.getElementById("bookingStage");
  if (!stage) return;
  syncStepBar();
  if (state.step === 1) stage.innerHTML = renderStep1();
  else if (state.step === 2) stage.innerHTML = renderStep2();
  else if (state.step === 3) stage.innerHTML = renderStep3();
  else if (state.step === 4) stage.innerHTML = renderStep4();
  else if (state.step === 5) stage.innerHTML = renderStep5();
  else if (state.step === 6) stage.innerHTML = renderDone();
  bindHandlers();
  if (window.lucide) window.lucide.createIcons();
  if (state.step === 3 && state.themeId && state.date) {
    const slotKey = `${state.themeId}:${state.date}`;
    if (!state._loading && state._loadedSlotKey !== slotKey) loadTakenSlots(slotKey);
  }
}

/* -------- Step 1: 選主題 -------- */
function renderStep1() {
  const cards = themes.map((t) => `
    <button class="bk-theme ${state.themeId === t.id ? "selected" : ""}" data-theme="${t.id}" type="button">
      <figure><img src="${t.image}" alt="${t.title}"></figure>
      <div class="bk-theme-body">
        <h3>${t.title}</h3>
        <div class="tag-list">${t.tags.map((tg) => `<span class="tag">${tg}</span>`).join("")}</div>
        <div class="bk-meta">
          <span><i data-lucide="users"></i>${t.players}</span>
          <span><i data-lucide="timer"></i>${t.time}</span>
          <span><i data-lucide="ticket"></i>${t.priceRange}</span>
        </div>
      </div>
    </button>
  `).join("");
  return `
    <h2 class="step-title">選擇主題</h2>
    <p class="bk-lead">先選今天想挑戰的故事。每個主題都有固定場次與人數限制。</p>
    <div class="bk-theme-grid">${cards}</div>
    <div class="bk-actions">
      <span></span>
      <button class="button primary" id="nextBtn" type="button" ${state.themeId ? "" : "disabled"}>
        下一步 <i data-lucide="arrow-right"></i>
      </button>
    </div>
  `;
}

/* -------- Step 2: 日期 + 人數 -------- */
function renderStep2() {
  const theme = getTheme();
  const min = minBookingDateStr();
  // 解析人數選項範圍
  const range = parsePlayers(theme.players);
  const options = [];
  for (let i = range.min; i <= range.max; i++) {
    options.push(`<button type="button" class="people-pill ${state.people === i ? "selected" : ""}" data-people="${i}">${i} 人</button>`);
  }
  let closedNote = "";
  if (state.date && isClosedDay(state.date)) {
    closedNote = `<p class="bk-note error"><i data-lucide="x-circle"></i>每週三公休,請另選日期</p>`;
  } else if (state.date && state._allBlocked) {
    closedNote = `<p class="bk-note error"><i data-lucide="x-circle"></i>這天該主題已全部訂滿/暫不開放,請另選日期</p>`;
  }
  return `
    <h2 class="step-title">選擇日期與人數</h2>
    <p class="bk-current"><span>目前主題</span><strong>${theme.title}</strong></p>
    <div class="bk-grid-2">
      <label class="bk-field">
        <span>日期</span>
        <input type="date" id="dateInput" min="${min}" value="${state.date || ""}">
      </label>
      <div class="bk-field">
        <span>人數(${theme.players})</span>
        <div class="people-pills">${options.join("")}</div>
      </div>
    </div>
    <div class="bk-price-card">
      <div class="bk-price-title"><i data-lucide="receipt-text"></i>參考價格</div>
      ${theme.prices.map(([p, v]) => `<div class="price-row"><span>${p}</span><strong>${v}</strong></div>`).join("")}
      ${theme.note ? `<p class="theme-note"><i data-lucide="badge-alert"></i>${theme.note}</p>` : ""}
    </div>
    ${closedNote}
    <div class="bk-actions">
      <button class="button ghost" id="backBtn" type="button"><i data-lucide="arrow-left"></i>上一步</button>
      <button class="button primary" id="nextBtn" type="button" ${state.date && state.people && !isClosedDay(state.date) && !state._allBlocked ? "" : "disabled"}>
        下一步 <i data-lucide="arrow-right"></i>
      </button>
    </div>
  `;
}

function parsePlayers(str) {
  const m = String(str).match(/(\d+)\s*-\s*(\d+)/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const single = String(str).match(/(\d+)/);
  const n = single ? Number(single[1]) : 2;
  return { min: n, max: n };
}

/* -------- Step 3: 時段 -------- */
function renderStep3() {
  const theme = getTheme();
  const slots = slotsForThemeDate(state.themeId, state.date);
  const taken = new Set(state.taken || []);
  const isLoading = state._loading;
  const buttons = slots.map((t) => {
    const isTaken = taken.has(t);
    const selected = state.time === t;
    return `<button type="button" class="slot-pill ${isTaken ? "taken" : ""} ${selected ? "selected" : ""}" data-slot="${t}" ${isTaken ? "disabled" : ""}>
      <strong>${t}</strong>
      <span>${isTaken ? "已預約" : "可預約"}</span>
    </button>`;
  }).join("");
  const errNote = state._error
    ? `<p class="bk-note error"><i data-lucide="alert-triangle"></i>${state._error}</p>`
    : "";
  return `
    <h2 class="step-title">選擇場次時間</h2>
    <p class="bk-current"><span>預約內容</span><strong>${theme.title}</strong><strong>${state.date}</strong><strong>${state.people} 人</strong></p>
    ${errNote}
    ${isLoading ? `<p class="bk-note"><i data-lucide="loader"></i>載入時段中…</p>` : ""}
    <div class="slot-grid">${buttons}</div>
    <p class="bk-hint">遊戲時間約 ${theme.time}。預約成功後請於開場前 10 分鐘抵達。</p>
    <div class="bk-actions">
      <button class="button ghost" id="backBtn" type="button"><i data-lucide="arrow-left"></i>上一步</button>
      <button class="button primary" id="nextBtn" type="button" ${state.time ? "" : "disabled"}>
        下一步 <i data-lucide="arrow-right"></i>
      </button>
    </div>
  `;
}

async function loadTakenSlots(slotKey) {
  if (!API_URL) {
    state.taken = [];
    state._loadedSlotKey = slotKey;
    return;
  }
  state._loading = true;
  try {
    const url = `${API_URL}?action=slots&theme=${encodeURIComponent(state.themeId)}&date=${encodeURIComponent(state.date)}`;
    const r = await fetch(url);
    const json = await r.json();
    state.taken = json.ok ? (json.taken || []) : [];
    state._loadedSlotKey = slotKey;
  } catch (err) {
    state.taken = [];
    state._loadedSlotKey = slotKey;
  } finally {
    state._loading = false;
    render();
  }
}

/* -------- Step 4: 聯絡資料 -------- */
function renderStep4() {
  return `
    <h2 class="step-title">聯絡資料</h2>
    <div class="bk-form">
      <label class="bk-field"><span>姓名 <i>*</i></span><input type="text" id="f_name" value="${escapeHtml(state.name)}" placeholder="您的姓名"></label>
      <label class="bk-field"><span>聯絡電話 <i>*</i></span><input type="tel" id="f_phone" value="${escapeHtml(state.phone)}" placeholder="09xx-xxx-xxx"></label>
      <label class="bk-field"><span>Email</span><input type="email" id="f_email" value="${escapeHtml(state.email)}" placeholder="可選"></label>
      <label class="bk-field full"><span>備註</span><textarea id="f_note" rows="3" placeholder="想告訴我們的話(可不填)">${escapeHtml(state.note)}</textarea></label>
    </div>
    <div class="bk-actions">
      <button class="button ghost" id="backBtn" type="button"><i data-lucide="arrow-left"></i>上一步</button>
      <button class="button primary" id="nextBtn" type="button">下一步 <i data-lucide="arrow-right"></i></button>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* -------- Step 5: 確認 -------- */
function renderStep5() {
  const theme = getTheme();
  const submitting = state._submitting;
  const error = state._error;
  return `
    <h2 class="step-title">確認預約</h2>
    <div class="bk-summary">
      <div class="sum-row"><span>主題</span><strong>${theme.title}</strong></div>
      <div class="sum-row"><span>日期時間</span><strong>${state.date} ${state.time}</strong></div>
      <div class="sum-row"><span>人數</span><strong>${state.people} 人</strong></div>
      <div class="sum-row"><span>遊戲時長</span><strong>${theme.time}</strong></div>
      <div class="sum-row"><span>姓名</span><strong>${escapeHtml(state.name)}</strong></div>
      <div class="sum-row"><span>電話</span><strong>${escapeHtml(state.phone)}</strong></div>
      ${state.email ? `<div class="sum-row"><span>Email</span><strong>${escapeHtml(state.email)}</strong></div>` : ""}
      ${state.note ? `<div class="sum-row"><span>備註</span><strong>${escapeHtml(state.note)}</strong></div>` : ""}
    </div>
    <p class="bk-hint">送出後我們將盡快與您確認;費用於現場結算。</p>
    ${error ? `<p class="bk-note error"><i data-lucide="alert-triangle"></i>${error}</p>` : ""}
    <div class="bk-actions">
      <button class="button ghost" id="backBtn" type="button" ${submitting ? "disabled" : ""}><i data-lucide="arrow-left"></i>上一步</button>
      <button class="button primary" id="submitBtn" type="button" ${submitting ? "disabled" : ""}>
        <i data-lucide="${submitting ? "loader" : "check-circle-2"}"></i>${submitting ? "送出中…" : "送出預約"}
      </button>
    </div>
  `;
}

/* -------- 完成 -------- */
function renderDone() {
  const theme = getTheme();
  return `
    <div class="bk-done">
      <i data-lucide="party-popper"></i>
      <h2>預約已送出</h2>
      <p>預約編號:<strong>${state._bookingId || "-"}</strong></p>
      <div class="bk-summary">
        <div class="sum-row"><span>主題</span><strong>${theme.title}</strong></div>
        <div class="sum-row"><span>日期時間</span><strong>${state.date} ${state.time}</strong></div>
        <div class="sum-row"><span>人數</span><strong>${state.people} 人</strong></div>
      </div>
      <p class="bk-hint">我們會盡快與您聯繫確認。如需修改或取消,請來電 04 2234 4591。</p>
      <div class="bk-actions center">
        <a class="button ghost" href="index.html"><i data-lucide="home"></i>回首頁</a>
        <a class="button primary" href="booking.html" onclick="setTimeout(()=>location.reload(),0)"><i data-lucide="rotate-ccw"></i>再預約一次</a>
      </div>
    </div>
  `;
}

/* -------- 事件綁定 -------- */
function bindHandlers() {
  document.querySelectorAll(".bk-theme").forEach((el) => {
    el.addEventListener("click", () => {
      state.themeId = el.dataset.theme;
      // 切主題重置後續
      state.date = null; state.people = null; state.time = null; state.taken = []; state._loadedSlotKey = null;
      render();
    });
  });

  const dateInput = document.getElementById("dateInput");
  if (dateInput) {
    dateInput.addEventListener("change", async (e) => {
      state.date = e.target.value;
      state.time = null;
      state.taken = [];
      state._loadedSlotKey = null;
      state._allBlocked = false;
      render();
      // 立刻檢查該日該主題還有沒有空場次,沒有就 disable 下一步
      if (state.date && !isClosedDay(state.date)) {
        const slots = slotsForThemeDate(state.themeId, state.date);
        if (slots.length === 0) {
          state._allBlocked = true; render(); return;
        }
        try {
          const r = await fetch(`${API_URL}?action=slots&theme=${encodeURIComponent(state.themeId)}&date=${encodeURIComponent(state.date)}`);
          const j = await r.json();
          if (j.ok && Array.isArray(j.taken)) {
            const taken = new Set(j.taken);
            state.taken = j.taken;
            state._allBlocked = slots.every((s) => taken.has(s));
            render();
          }
        } catch (err) {}
      }
    });
    // 點輸入框任何位置都打開日曆(部分瀏覽器只有點 icon 才開)
    dateInput.addEventListener("click", () => {
      if (typeof dateInput.showPicker === "function") {
        try { dateInput.showPicker(); } catch (err) {}
      }
    });
  }

  document.querySelectorAll(".people-pill").forEach((el) => {
    el.addEventListener("click", () => {
      state.people = Number(el.dataset.people);
      render();
    });
  });

  document.querySelectorAll(".slot-pill:not([disabled])").forEach((el) => {
    el.addEventListener("click", () => {
      state.time = el.dataset.slot;
      state._error = null;
      render();
    });
  });

  ["f_name", "f_phone", "f_email", "f_note"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", (e) => {
        const key = id.slice(2);
        state[key] = e.target.value;
      });
    }
  });

  const back = document.getElementById("backBtn");
  if (back) back.addEventListener("click", () => {
    // 鎖定主題模式下,從 step 2 按上一步應回到主題詳情頁
    if (state.locked && state.step === 2) {
      const theme = getTheme();
      location.href = theme && theme.page ? theme.page : "index.html";
      return;
    }
    setStep(state.step - 1);
  });

  const next = document.getElementById("nextBtn");
  if (next) next.addEventListener("click", () => onNext());

  const submit = document.getElementById("submitBtn");
  if (submit) submit.addEventListener("click", () => onSubmit());
}

function onNext() {
  if (state.step === 4) {
    if (!state.name.trim() || !state.phone.trim()) {
      alert("請填寫姓名與聯絡電話");
      return;
    }
  }
  setStep(state.step + 1);
}

async function onSubmit() {
  const theme = getTheme();
  state._submitting = true;
  state._error = null;
  render();

  if (!API_URL) {
    state._submitting = false;
    state._error = "尚未設定後端 API_URL,請參考 SETUP.md 完成 Apps Script 部署後填入 booking.js 第 6 行";
    render();
    return;
  }

  try {
    // 送出前重抓一次 taken,避免使用者開頁面後管理員才關掉而看到的舊資料
    try {
      const tr = await fetch(`${API_URL}?action=slots&theme=${encodeURIComponent(state.themeId)}&date=${encodeURIComponent(state.date)}`);
      const tj = await tr.json();
      if (tj.ok && Array.isArray(tj.taken) && tj.taken.includes(state.time)) {
        state.taken = tj.taken;
        state._submitting = false;
        state._error = "你選的時段剛剛被佔走了,請選別的時段";
        state.time = null;
        setStep(3);
        return;
      }
    } catch (e) { /* 重抓失敗就讓後端擋,不阻擋送出 */ }

    const r = await fetch(API_URL, {
      method: "POST",
      // Apps Script 對 fetch 預檢敏感; text/plain 可避開 CORS preflight
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "book",
        theme_id: state.themeId,
        theme_title: theme.title,
        date: state.date,
        time: state.time,
        people: state.people,
        name: state.name,
        phone: state.phone,
        email: state.email,
        note: state.note
      })
    });
    const json = await r.json();
    if (!json.ok) {
      state._error = json.error || "預約失敗,請稍後再試";
      state._submitting = false;
      // 若衝突則退回時段選擇
      if (json.conflict) {
        state.taken = [...new Set([...(state.taken || []), state.time])];
        state.time = null;
        setStep(3);
        return;
      }
      render();
      return;
    }
    state._bookingId = json.id;
    state._submitting = false;
    setStep(6);
  } catch (err) {
    state._submitting = false;
    state._error = "連線失敗:" + err.message;
    render();
  }
}

/* -------- 啟動 -------- */
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("bookingStage")) return;
  // 支援從主題詳情頁帶入: booking.html?theme=ai (鎖定主題模式)
  const params = new URLSearchParams(location.search);
  const t = params.get("theme");
  if (t && themes.some((x) => x.id === t)) {
    state.themeId = t;
    state.locked = true;
    const theme = themes.find((x) => x.id === t);

    // 隱藏「選主題」步驟、重新編號其餘步驟
    const li1 = document.querySelector('#stepBar li[data-step="1"]');
    if (li1) li1.style.display = "none";
    document.querySelectorAll('#stepBar li').forEach((li) => {
      const step = Number(li.dataset.step);
      if (step >= 2) {
        const span = li.querySelector("span");
        if (span) span.textContent = String(step - 1);
      }
    });

    // 改頁面標題與大標
    document.title = `預約 ${theme.title} | 草咩咩遊戲工作室`;
    const h1 = document.querySelector(".booking-header h1");
    if (h1) h1.textContent = `預約 ${theme.title}`;
    const sub = document.querySelector(".booking-sub");
    if (sub) sub.textContent = "選擇日期人數、場次,並填寫聯絡資料,送出後我們會以電話或 Email 確認。";

    setStep(2);
    return;
  }
  render();
});
