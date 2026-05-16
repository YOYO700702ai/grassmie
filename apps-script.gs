/**
 * 草咩咩遊戲工作室 - 預約系統 Apps Script 後端
 *
 * 部署步驟見專案根目錄 SETUP.md
 *
 * Sheet 結構:
 *   Bookings      原始資料 (一筆一列,不要手動編輯)
 *   2026-05 等    每月視覺化分頁,系統自動產生 / 更新
 *
 * Bookings 欄位:
 *   A id / B created_at / C theme_id / D theme_title
 *   E date / F time / G people
 *   H name / I phone / J email / K note / L status
 */

const SHEET_NAME = 'Bookings';

// 現場收款 Sheet (獨立檔案,給現場人員填現金/文化幣)
const ONSITE_SHEET_ID = '1coV1fSztjULH9YQ5jE5ct2QPfCNv0B2QxWrUXQO8-DU';
const ONSITE_TAB = '收款明細';
const ONSITE_PRICE_TAB = '定價';

// 營業報表 Sheet (用 IMPORTRANGE 直接抓現場日結,完全自動)
const REPORT_SHEET_ID = '1H_eznBVmV-Qo0ylk1isTANaIcsk7XC4HWf4WU6-su2E';
const REPORT_TEMPLATE_TAB = '空白月營業報表';
// 每主題在 (報表現金欄, 現場 cash 欄, 現場 文化幣 欄)
const REPORT_THEME_MAP = {
  ai:       { reportCol: 'B', onsiteCash: 'R', onsiteCoin: 'S' },
  geppetto: { reportCol: 'D', onsiteCash: 'X', onsiteCoin: 'Y' },
  daughter: { reportCol: 'F', onsiteCash: 'F', onsiteCoin: 'G' },
  hamel:    { reportCol: 'H', onsiteCash: 'L', onsiteCoin: 'M' }
};

const HEADERS = [
  'id', 'created_at', 'theme_id', 'theme_title',
  'date', 'time', 'people',
  'name', 'phone', 'email', 'note', 'status'
];

// 每主題各自固定每 2 小時一場;週三公休。平假日場次相同。
const THEME_SLOTS = {
  daughter: {
    weekday: ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
    weekend: ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00']
  },
  ai: {
    weekday: ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
    weekend: ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00']
  },
  hamel: {
    weekday: ['09:30', '11:30', '13:30', '15:30', '17:30', '19:30'],
    weekend: ['09:30', '11:30', '13:30', '15:30', '17:30', '19:30']
  },
  geppetto: {
    weekday: ['10:30', '12:30', '14:30', '16:30', '18:30', '20:30'],
    weekend: ['10:30', '12:30', '14:30', '16:30', '18:30', '20:30']
  }
};

const MAX_SLOTS = 6; // 月份分頁固定 6 個場次欄

const THEMES = [
  { id: 'daughter', title: '不存在的女兒' },
  { id: 'hamel',    title: '哈梅爾寺' },
  { id: 'ai',       title: '這是 AI 做的密室' },
  { id: 'geppetto', title: '杰佩多先生' }
];

function slotsForThemeDate_(themeId, dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  if (dow === 3) return [];
  const t = THEME_SLOTS[themeId];
  if (!t) return [];
  const isWeekend = dow === 0 || dow === 6;
  return isWeekend ? t.weekend : t.weekday;
}

const WEEKDAYS_TC = ['日', '一', '二', '三', '四', '五', '六'];

function ensureSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = (e.parameter.action || '').toLowerCase();
    if (action === 'slots') return getTakenSlots_(e.parameter);
    if (action === 'list_bookings') return listBookings_(e.parameter);
    if (action === 'get_booking') return getBooking_(e.parameter);
    if (action === 'ping') return jsonOut_({ ok: true });
    return jsonOut_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = (body.action || '').toLowerCase();
    if (action === 'book') return createBooking_(body);
    if (action === 'cancel_booking') return cancelBooking_(body);
    if (action === 'update_booking') return updateBooking_(body);
    if (action === 'close_slot') return closeSlot_(body);
    if (action === 'reopen_slot') return reopenSlot_(body);
    if (action === 'batch_slot_ops') return batchSlotOps_(body);
    return jsonOut_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function getTakenSlots_(params) {
  const themeId = params.theme || '';
  const date = params.date || '';
  if (!themeId || !date) {
    return jsonOut_({ ok: false, error: 'theme and date required' });
  }
  const sheet = ensureSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return jsonOut_({ ok: true, taken: [] });

  const values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const taken = [];
  for (const row of values) {
    const rTheme = String(row[2]);
    const rDate = formatDate_(row[4]);
    const rTime = formatTime_(row[5]);
    const status = String(row[11] || 'confirmed');
    if (rTheme === themeId && rDate === date && status !== 'cancelled') {
      taken.push(rTime);
    }
  }
  return jsonOut_({ ok: true, taken: taken });
}

function createBooking_(body) {
  const required = ['theme_id', 'theme_title', 'date', 'time', 'people', 'name', 'phone'];
  for (const f of required) {
    if (!body[f]) return jsonOut_({ ok: false, error: '缺少欄位: ' + f });
  }

  // 擋 24 小時內預約 (網頁前端用;77 / 老闆呼叫時帶 bypass_24h:true 即可繞過)
  if (!body.bypass_24h) {
    try {
      const slotDt = new Date(body.date + 'T' + (body.time.length === 4 ? '0' : '') + body.time + ':00+08:00');
      const diffMs = slotDt.getTime() - Date.now();
      if (diffMs < 24 * 60 * 60 * 1000) {
        return jsonOut_({
          ok: false,
          error: '24 小時內的場次無法線上預約,請私訊草咩咩 FB 粉專安排',
          too_soon: true
        });
      }
    } catch (e) { /* 解析失敗就放行,讓下面照常驗 */ }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const sheet = ensureSheet_();
    const last = sheet.getLastRow();
    if (last >= 2) {
      const values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
      for (const row of values) {
        const rTheme = String(row[2]);
        const rDate = formatDate_(row[4]);
        const rTime = formatTime_(row[5]);
        const status = String(row[11] || 'confirmed');
        if (rTheme === body.theme_id && rDate === body.date && rTime === body.time && status !== 'cancelled') {
          return jsonOut_({ ok: false, error: '此時段已被預約,請選擇其他時段', conflict: true });
        }
      }
    }

    const id = 'BK' + Date.now() + Math.floor(Math.random() * 1000);
    sheet.appendRow([
      id,
      new Date().toISOString(),
      body.theme_id,
      body.theme_title,
      body.date,
      body.time,
      body.people,
      body.name,
      body.phone,
      body.email || '',
      body.note || '',
      'confirmed'
    ]);

    try {
      const yyyymm = String(body.date).substring(0, 7);
      rebuildMonthSheet_(yyyymm);
    } catch (viewErr) {
      // 月份視圖更新失敗不影響預約成功
    }

    try {
      appendToOnsite_(Object.assign({}, body, { id: id }));
    } catch (onsiteErr) {
      // 現場收款表寫入失敗不影響預約成功
    }

    try { sendNotificationEmail_(body, id); } catch (mailErr) {}
    try { sendCustomerConfirmation_(body, id); } catch (mailErr) {}

    return jsonOut_({ ok: true, id: id });
  } finally {
    lock.releaseLock();
  }
}

function sendCustomerConfirmation_(body, id) {
  const to = String(body.email || '').trim();
  if (!to || to.indexOf('@') < 0) return; // 沒填 email 就跳過
  const subject = '[草咩咩遊戲工作室] 預約成功 - ' + body.theme_title + ' ' + body.date + ' ' + body.time;
  const dt = body.date + ' ' + body.time;
  const html =
    '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width:560px; margin:auto; color:#11100d;">' +
      '<div style="background:#11100d; color:#f5ead3; padding:24px; text-align:center;">' +
        '<h1 style="margin:0; font-size:22px; letter-spacing:2px;">草咩咩遊戲工作室</h1>' +
        '<p style="margin:8px 0 0; font-size:13px; opacity:.8;">CaoMeMe Game Studio</p>' +
      '</div>' +
      '<div style="padding:24px; background:#fffaf0;">' +
        '<h2 style="margin:0 0 16px; color:#a8762a;">✅ 預約成功</h2>' +
        '<p style="margin:0 0 16px;">' + escapeHtml_(body.name) + ' 您好,感謝您預約草咩咩遊戲工作室!以下是您的預約資訊:</p>' +
        '<table style="width:100%; border-collapse:collapse; margin:16px 0;">' +
          tableRow_('預約編號', id) +
          tableRow_('主題', body.theme_title) +
          tableRow_('日期時間', dt) +
          tableRow_('人數', String(body.people) + ' 人') +
          tableRow_('姓名', body.name) +
          tableRow_('電話', body.phone) +
          (body.note ? tableRow_('備註', body.note) : '') +
        '</table>' +
        '<div style="background:#fff4d6; border-left:4px solid #d4a72a; padding:12px 16px; margin:16px 0; font-size:14px;">' +
          '<strong>溫馨提醒</strong><br>' +
          '• 請於開場前 10 分鐘抵達<br>' +
          '• 若需改期或取消,請於 24 小時前透過 Facebook 粉專私訊告知<br>' +
          '• 24 小時內無故未到視同放棄,並需支付全額場地費' +
        '</div>' +
        '<p style="margin:16px 0 0; font-size:14px;">' +
          '如有任何問題請私訊我們的粉專:<br>' +
          '<a href="https://www.facebook.com/CaoMeMeGameStudio" style="color:#a8762a;">facebook.com/CaoMeMeGameStudio</a>' +
        '</p>' +
      '</div>' +
      '<div style="background:#11100d; color:#f5ead3; padding:12px; text-align:center; font-size:12px; opacity:.7;">' +
        '期待與您一起踏入故事 🌿' +
      '</div>' +
    '</div>';
  const plain =
    body.name + ' 您好,感謝您預約草咩咩遊戲工作室!\n\n' +
    '預約編號: ' + id + '\n' +
    '主題: ' + body.theme_title + '\n' +
    '日期時間: ' + dt + '\n' +
    '人數: ' + body.people + ' 人\n' +
    '姓名: ' + body.name + '\n' +
    '電話: ' + body.phone + '\n' +
    (body.note ? ('備註: ' + body.note + '\n') : '') +
    '\n溫馨提醒:\n' +
    '• 請於開場前 10 分鐘抵達\n' +
    '• 改期/取消請於 24 小時前透過 FB 粉專私訊告知\n' +
    '• 24 小時內無故未到視同放棄,並需支付全額場地費\n\n' +
    '粉專: https://www.facebook.com/CaoMeMeGameStudio\n';
  MailApp.sendEmail({
    to: to,
    subject: subject,
    htmlBody: html,
    body: plain,
    name: '草咩咩遊戲工作室'
  });
}

function tableRow_(label, value) {
  return '<tr>' +
    '<td style="padding:8px 12px; background:#f5ead3; border:1px solid #e0d4b0; width:30%; font-weight:bold;">' + escapeHtml_(label) + '</td>' +
    '<td style="padding:8px 12px; background:#fff; border:1px solid #e0d4b0;">' + escapeHtml_(String(value)) + '</td>' +
  '</tr>';
}

function escapeHtml_(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sendNotificationEmail_(body, id) {
  const NOTIFY_TO = '';
  if (!NOTIFY_TO) return;
  const subject = `[草咩咩] 新預約 ${body.theme_title} ${body.date} ${body.time}`;
  const lines = [
    '預約編號: ' + id,
    '主題: ' + body.theme_title,
    '日期: ' + body.date + ' ' + body.time,
    '人數: ' + body.people,
    '姓名: ' + body.name,
    '電話: ' + body.phone,
    'Email: ' + (body.email || '-'),
    '備註: ' + (body.note || '-')
  ];
  MailApp.sendEmail(NOTIFY_TO, subject, lines.join('\n'));
}

/* ============================================================
 * 月份視覺化分頁
 * ============================================================ */

/**
 * 重建單一月份分頁
 * @param {string} yyyymm  例 "2026-05"
 */
function rebuildMonthSheet_(yyyymm) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let view = ss.getSheetByName(yyyymm);
  if (!view) {
    view = ss.insertSheet(yyyymm, 0); // 插到最前面
  }
  view.clear();

  const parts = yyyymm.split('-').map(Number);
  const y = parts[0], m = parts[1];
  const daysInMonth = new Date(y, m, 0).getDate();

  // 標題列: 日期 / 星期 / 主題 / 場1 ... 場6
  const slotHeaders = [];
  for (let i = 1; i <= MAX_SLOTS; i++) slotHeaders.push('場 ' + i);
  const headers = ['日期', '星期', '主題'].concat(slotHeaders);
  view.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#11100d')
    .setFontColor('#f5ead3')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  view.setFrozenRows(1);
  view.setFrozenColumns(3);

  // 從 Bookings 抓本月所有預約
  const src = ensureSheet_();
  const last = src.getLastRow();
  const bookingMap = {};
  if (last >= 2) {
    const values = src.getRange(2, 1, last - 1, HEADERS.length).getValues();
    for (const row of values) {
      const status = String(row[11] || 'confirmed');
      if (status === 'cancelled') continue;
      const rDate = formatDate_(row[4]);
      if (!rDate.startsWith(yyyymm)) continue;
      const rTime = formatTime_(row[5]);
      const themeId = String(row[2]);
      bookingMap[rDate + '|' + rTime + '|' + themeId] = {
        name: String(row[7] || ''),
        people: row[6],
        phone: String(row[8] || '')
      };
    }
  }

  // 組資料
  const data = [];
  const cellNotes = [];
  const cellBackgrounds = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = yyyymm + '-' + String(d).padStart(2, '0');
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();
    const isClosed = dow === 3;
    const isWeekend = dow === 0 || dow === 6;
    // 淺色配色
    const dayBg = isClosed ? '#fadcdc'    // 公休:淡粉紅
                : isWeekend ? '#fff4d6'   // 週末:奶油黃
                : '#ffffff';              // 平日:白

    for (let i = 0; i < THEMES.length; i++) {
      const theme = THEMES[i];
      const dateCell = i === 0 ? dateStr : '';
      const dowCell  = i === 0 ? '週' + WEEKDAYS_TC[dow] : '';
      const row = [dateCell, dowCell, theme.title];
      const noteRow = ['', '', ''];
      const bgRow = [dayBg, dayBg, dayBg];

      const slots = isClosed ? [] : slotsForThemeDate_(theme.id, dateStr);

      for (let s = 0; s < MAX_SLOTS; s++) {
        if (isClosed) {
          row.push('公休');
          noteRow.push('');
          bgRow.push('#fadcdc');
        } else if (s >= slots.length) {
          row.push('—');
          noteRow.push('');
          bgRow.push('#ececec'); // 該主題該日沒這場:淺灰
        } else {
          const t = slots[s];
          const k = dateStr + '|' + t + '|' + theme.id;
          const b = bookingMap[k];
          if (b) {
            row.push(t + '\n' + b.name + ' ' + b.people + '人');
            noteRow.push('電話: ' + b.phone);
            bgRow.push('#ffd966'); // 已預約:琥珀黃
          } else {
            row.push(t);
            noteRow.push('');
            bgRow.push(dayBg);
          }
        }
      }
      data.push(row);
      cellNotes.push(noteRow);
      cellBackgrounds.push(bgRow);
    }
  }

  if (data.length) {
    const range = view.getRange(2, 1, data.length, headers.length);
    range.setValues(data);
    range.setNotes(cellNotes);
    range.setBackgrounds(cellBackgrounds);
    range.setFontColor('#11100d');
    range.setVerticalAlignment('middle');
    // 細灰格線
    range.setBorder(true, true, true, true, true, true, '#d0d0d0', SpreadsheetApp.BorderStyle.SOLID);
  }

  // 合併日期/星期欄
  for (let d = 0; d < daysInMonth; d++) {
    const startRow = 2 + d * THEMES.length;
    view.getRange(startRow, 1, THEMES.length, 1).merge()
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setFontWeight('bold');
    view.getRange(startRow, 2, THEMES.length, 1).merge()
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setFontWeight('bold');
    // 每個日期區塊下方加粗黑線
    view.getRange(startRow + THEMES.length - 1, 1, 1, headers.length)
      .setBorder(null, null, true, null, null, null, '#11100d', SpreadsheetApp.BorderStyle.SOLID_THICK);
  }

  // 主題欄樣式
  for (let r = 0; r < data.length; r++) {
    view.getRange(2 + r, 3).setHorizontalAlignment('left').setFontWeight('bold');
  }
  // 時段欄置中、可換行
  view.getRange(2, 4, data.length, MAX_SLOTS)
    .setHorizontalAlignment('center')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);

  // 欄寬
  view.setColumnWidth(1, 110);
  view.setColumnWidth(2, 60);
  view.setColumnWidth(3, 150);
  for (let i = 0; i < MAX_SLOTS; i++) {
    view.setColumnWidth(4 + i, 130);
  }
  view.setRowHeights(2, data.length, 38);
}

/**
 * 一鍵重建所有月份分頁(從 Bookings 涉及到的月份)
 * 在 Apps Script 編輯器手動執行即可。
 */
function rebuildAll() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const months = new Set();

  // 1) 既有的月份分頁(分頁名為 YYYY-MM)
  ss.getSheets().forEach(function (sh) {
    const name = sh.getName();
    if (/^\d{4}-\d{2}$/.test(name)) months.add(name);
  });

  // 2) Bookings 裡有預約的月份
  const src = ensureSheet_();
  const last = src.getLastRow();
  if (last >= 2) {
    const values = src.getRange(2, 5, last - 1, 1).getValues();
    for (const row of values) {
      const d = formatDate_(row[0]);
      if (d && /^\d{4}-\d{2}/.test(d)) months.add(d.substring(0, 7));
    }
  }

  Array.from(months).sort().forEach(rebuildMonthSheet_);

  const bookings = ss.getSheetByName(SHEET_NAME);
  if (bookings) {
    ss.setActiveSheet(bookings);
    ss.moveActiveSheet(ss.getNumSheets());
  }
}

/**
 * 預先建立未來 N 個月的空白分頁(可選,從編輯器手動執行)
 */
function ensureUpcomingMonths() {
  const N = 3;
  const now = new Date();
  for (let i = 0; i < N; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const yyyymm = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    rebuildMonthSheet_(yyyymm);
  }
}

/* ============================================================ */

function formatDate_(v) {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return String(v);
}

function formatTime_(v) {
  if (v instanceof Date) {
    const h = String(v.getHours()).padStart(2, '0');
    const mi = String(v.getMinutes()).padStart(2, '0');
    return h + ':' + mi;
  }
  return String(v);
}

/* ============================================================
 * 現場收款 Sheet 同步
 * ============================================================ */

function getPriceForBooking_(themeId, people, ss) {
  if (!ss) ss = SpreadsheetApp.openById(ONSITE_SHEET_ID);
  const sh = ss.getSheetByName(ONSITE_PRICE_TAB);
  if (!sh) return null;
  const last = sh.getLastRow();
  if (last < 2) return null;
  const values = sh.getRange(2, 1, last - 1, 5).getValues();
  for (const row of values) {
    const tid = String(row[0]).trim();
    const minP = Number(row[2]);
    const maxP = Number(row[3]);
    const price = Number(row[4]);
    if (tid === themeId && people >= minP && people <= maxP) {
      return price;
    }
  }
  return null;
}

function appendToOnsite_(booking) {
  if (!ONSITE_SHEET_ID) return;
  rebuildOnsiteMonth_(String(booking.date).substring(0, 7));
}

function syncOnsiteForDate_(dateStr) {
  if (!ONSITE_SHEET_ID || !dateStr) return;
  try { rebuildOnsiteMonth_(String(dateStr).substring(0, 7)); } catch (e) {}
}

/**
 * 一鍵把 Bookings 裡所有 confirmed 預約同步到現場收款表(去重)。
 * 第一次設定後跑一次回填既有資料,日常 createBooking_ 會自動同步。
 */
function syncAllToOnsite() {
  const src = ensureSheet_();
  const ss = SpreadsheetApp.openById(ONSITE_SHEET_ID);
  const sheet = ss.getSheetByName(ONSITE_TAB);
  if (!sheet) throw new Error('找不到 ' + ONSITE_TAB + ' 分頁');

  // 已存在的預約 ID
  const existing = new Set();
  const last = sheet.getLastRow();
  if (last >= 2) {
    const ids = sheet.getRange(2, 10, last - 1, 1).getValues();
    for (const r of ids) {
      if (r[0]) existing.add(String(r[0]));
    }
  }

  const srcLast = src.getLastRow();
  if (srcLast < 2) return;
  const values = src.getRange(2, 1, srcLast - 1, HEADERS.length).getValues();

  const toAppend = [];
  for (const row of values) {
    const id = String(row[0]);
    const status = String(row[11] || 'confirmed');
    if (status !== 'confirmed') continue;
    if (existing.has(id)) continue;
    const themeId = String(row[2]);
    const themeTitle = String(row[3]);
    const date = formatDate_(row[4]);
    const time = formatTime_(row[5]);
    const people = Number(row[6]);
    const name = String(row[7]);
    const pricePerPerson = getPriceForBooking_(themeId, people, ss);
    const expected = pricePerPerson ? pricePerPerson * people : '';
    toAppend.push([date, time, themeTitle, name, people, expected, '', '', '', id]);
  }

  if (toAppend.length === 0) {
    Logger.log('沒有新資料要同步');
    return;
  }

  // 依日期、時間排序後寫入
  toAppend.sort(function (a, b) {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return a[1] < b[1] ? -1 : 1;
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, toAppend.length, 10).setValues(toAppend);
  Logger.log('已同步 ' + toAppend.length + ' 筆到現場收款表');
}


/* ============================================================
 * Bot 操作用 API (list / get / cancel / update / close / reopen)
 * 全部回 { ok: true, data?: ... } 或 { ok: false, error: "..." }
 * ============================================================ */

function findRowById_(id) {
  const sheet = ensureSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      return { rowIndex: i + 2, sheet: sheet };
    }
  }
  return null;
}

function readRow_(sheet, rowIndex) {
  const v = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
  return {
    id: String(v[0]),
    created_at: v[1] instanceof Date ? v[1].toISOString() : String(v[1] || ''),
    theme_id: String(v[2]),
    theme_title: String(v[3]),
    date: formatDate_(v[4]),
    time: formatTime_(v[5]),
    people: Number(v[6]) || 0,
    name: String(v[7] || ''),
    phone: String(v[8] || ''),
    email: String(v[9] || ''),
    note: String(v[10] || ''),
    status: String(v[11] || 'confirmed')
  };
}

function listBookings_(params) {
  const date = (params.date || '').toString().trim();
  const phone = (params.phone || '').toString().trim();
  const name = (params.name || '').toString().trim();
  const themeId = (params.theme_id || '').toString().trim();
  const status = (params.status || 'confirmed').toString().trim();

  const sheet = ensureSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return jsonOut_({ ok: true, data: [], total: 0 });

  const values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  const results = [];
  for (const row of values) {
    const b = {
      id: String(row[0]),
      theme_id: String(row[2]),
      theme_title: String(row[3]),
      date: formatDate_(row[4]),
      time: formatTime_(row[5]),
      people: Number(row[6]) || 0,
      name: String(row[7] || ''),
      phone: String(row[8] || ''),
      status: String(row[11] || 'confirmed')
    };
    if (status !== 'all' && b.status !== status) continue;
    if (date && b.date !== date) continue;
    if (themeId && b.theme_id !== themeId) continue;
    if (phone && b.phone.indexOf(phone) === -1) continue;
    if (name && b.name.indexOf(name) === -1) continue;
    results.push(b);
  }
  results.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.time < b.time ? -1 : 1;
  });

  const truncated = results.length > 50;
  return jsonOut_({
    ok: true,
    data: truncated ? results.slice(0, 50) : results,
    total: results.length,
    truncated: truncated
  });
}

function getBooking_(params) {
  const id = (params.id || '').toString().trim();
  if (!id) return jsonOut_({ ok: false, error: 'id required' });
  const found = findRowById_(id);
  if (!found) return jsonOut_({ ok: false, error: '找不到預約: ' + id });
  return jsonOut_({ ok: true, data: readRow_(found.sheet, found.rowIndex) });
}

function cancelBooking_(body) {
  const id = (body.id || '').toString().trim();
  if (!id) return jsonOut_({ ok: false, error: 'id required' });
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const found = findRowById_(id);
    if (!found) return jsonOut_({ ok: false, error: '找不到預約: ' + id });
    const before = readRow_(found.sheet, found.rowIndex);
    if (before.status === 'cancelled') {
      return jsonOut_({ ok: true, data: before, changed: false, note: '本來就是 cancelled' });
    }
    found.sheet.getRange(found.rowIndex, 12).setValue('cancelled');
    try { rebuildMonthSheet_(before.date.substring(0, 7)); } catch (e) {}
    syncOnsiteForDate_(before.date);
    const after = readRow_(found.sheet, found.rowIndex);
    return jsonOut_({ ok: true, data: after, changed: true });
  } finally {
    lock.releaseLock();
  }
}

function updateBooking_(body) {
  const id = (body.id || '').toString().trim();
  if (!id) return jsonOut_({ ok: false, error: 'id required' });
  if (body.date || body.time || body.theme_id) {
    return jsonOut_({ ok: false, error: '不支援改日期/時間/主題,請先 cancel_booking 再 book 一筆新的' });
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const found = findRowById_(id);
    if (!found) return jsonOut_({ ok: false, error: '找不到預約: ' + id });
    const before = readRow_(found.sheet, found.rowIndex);
    const updates = [];
    const sheet = found.sheet;
    const r = found.rowIndex;
    if (body.people !== undefined && body.people !== null && body.people !== '') {
      sheet.getRange(r, 7).setValue(Number(body.people));
      updates.push('people');
    }
    if (body.name !== undefined && body.name !== null) {
      sheet.getRange(r, 8).setValue(String(body.name));
      updates.push('name');
    }
    if (body.phone !== undefined && body.phone !== null) {
      sheet.getRange(r, 9).setValue(String(body.phone));
      updates.push('phone');
    }
    if (body.email !== undefined && body.email !== null) {
      sheet.getRange(r, 10).setValue(String(body.email));
      updates.push('email');
    }
    if (body.note !== undefined && body.note !== null) {
      sheet.getRange(r, 11).setValue(String(body.note));
      updates.push('note');
    }
    if (updates.length === 0) {
      return jsonOut_({ ok: true, data: before, changed: false, note: '沒提供要更新的欄位' });
    }
    try { rebuildMonthSheet_(before.date.substring(0, 7)); } catch (e) {}
    syncOnsiteForDate_(before.date);
    const after = readRow_(sheet, r);
    return jsonOut_({ ok: true, data: after, changed: true, updated: updates });
  } finally {
    lock.releaseLock();
  }
}

function closeSlot_(body) {
  const required = ['date', 'theme_id', 'time'];
  for (const f of required) {
    if (!body[f]) return jsonOut_({ ok: false, error: '缺少欄位: ' + f });
  }
  const reason = (body.reason || '老闆關閉').toString();
  const theme = THEMES.find(function (t) { return t.id === body.theme_id; });
  if (!theme) return jsonOut_({ ok: false, error: '未知 theme_id: ' + body.theme_id });

  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const sheet = ensureSheet_();
    const last = sheet.getLastRow();
    if (last >= 2) {
      const values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
      for (const row of values) {
        const status = String(row[11] || 'confirmed');
        if (status === 'cancelled') continue;
        const rTheme = String(row[2]);
        const rDate = formatDate_(row[4]);
        const rTime = formatTime_(row[5]);
        if (rTheme === body.theme_id && rDate === body.date && rTime === body.time) {
          if (status === 'confirmed') {
            return jsonOut_({
              ok: false,
              error: '此時段已有預約 (' + row[7] + '),請先取消那筆才能關閉',
              conflict_id: String(row[0])
            });
          }
          if (status === 'blocked') {
            return jsonOut_({ ok: true, id: String(row[0]), changed: false, note: '此時段已被關閉' });
          }
        }
      }
    }

    const id = 'BLK' + Date.now() + Math.floor(Math.random() * 1000);
    sheet.appendRow([
      id,
      new Date().toISOString(),
      body.theme_id,
      theme.title,
      body.date,
      body.time,
      0,
      '(關閉) ' + reason,
      '', '', '',
      'blocked'
    ]);
    try { rebuildMonthSheet_(String(body.date).substring(0, 7)); } catch (e) {}
    return jsonOut_({ ok: true, id: id, changed: true });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 一次處理多個關閉/重開操作 (一個 lock,避免 LockService 排隊 timeout)
 * body: { ops: [{op:'close'|'reopen', date, theme_id, time, reason?}] }
 * 回傳: { ok:true, results:[{ok, id?, error?}], summary:{ok, fail} }
 */
function batchSlotOps_(body) {
  // 直接呼叫各自帶 lock 的 closeSlot_/reopenSlot_,序列執行 (同一個 execution 不會 deadlock)
  const ops = Array.isArray(body.ops) ? body.ops : [];
  if (!ops.length) return jsonOut_({ ok: false, error: '沒有 ops' });
  const results = [];
  let ok = 0, fail = 0;
  for (const o of ops) {
    try {
      let r;
      if (o.op === 'close') r = JSON.parse(closeSlot_({ date: o.date, theme_id: o.theme_id, time: o.time, reason: o.reason || '後台' }).getContent());
      else if (o.op === 'reopen') r = JSON.parse(reopenSlot_({ date: o.date, theme_id: o.theme_id, time: o.time }).getContent());
      else { results.push({ ok: false, error: 'unknown op: ' + o.op }); fail++; continue; }
      results.push(r);
      if (r.ok) ok++; else fail++;
    } catch (e) {
      results.push({ ok: false, error: String(e) });
      fail++;
    }
  }
  return jsonOut_({ ok: true, results: results, summary: { ok: ok, fail: fail } });
}

function reopenSlot_(body) {
  const required = ['date', 'theme_id', 'time'];
  for (const f of required) {
    if (!body[f]) return jsonOut_({ ok: false, error: '缺少欄位: ' + f });
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    const sheet = ensureSheet_();
    const last = sheet.getLastRow();
    if (last < 2) return jsonOut_({ ok: false, error: '查無資料' });
    const values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const status = String(row[11] || 'confirmed');
      if (status !== 'blocked') continue;
      const rTheme = String(row[2]);
      const rDate = formatDate_(row[4]);
      const rTime = formatTime_(row[5]);
      if (rTheme === body.theme_id && rDate === body.date && rTime === body.time) {
        sheet.getRange(i + 2, 12).setValue('cancelled');
        try { rebuildMonthSheet_(String(body.date).substring(0, 7)); } catch (e) {}
        return jsonOut_({ ok: true, id: String(row[0]), changed: true });
      }
    }
    return jsonOut_({ ok: false, error: '找不到該時段的關閉紀錄' });
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
 * 現場收款 v2: 每月一分頁 + 每日小計 + 本月總計
 * ============================================================ */

function loadPriceTable_(ss) {
  const sh = ss.getSheetByName(ONSITE_PRICE_TAB);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues();
}

function priceFromTable_(prices, themeId, people) {
  for (const row of prices) {
    if (String(row[0]).trim() === themeId &&
        people >= Number(row[2]) && people <= Number(row[3])) {
      return Number(row[4]);
    }
  }
  return null;
}

/* ============================================================
 * 現場收款 v3: 每月一分頁,每日 6 列場次 × 4 主題並排
 *   每天結尾一列「日結」,月底一列「本月總計」
 *   現場可填的欄: 收款 / 小天使 / 備註(三欄)
 *   重建時以「日期|主題|場次時間」為 key 保留現場已填的值
 * ============================================================ */

const ONSITE_MAX_SLOTS = 6;
const ONSITE_THEME_ORDER = ['daughter', 'hamel', 'ai', 'geppetto'];
const ONSITE_THEME_COL_LABELS = ['場次', '小天使', '實習生', '現金', '文化幣', '備註'];
// theme block 欄寬 (場次/預約人/人數/電話/收款/小天使/備註)
const ONSITE_THEME_COL_WIDTHS = [70, 90, 90, 80, 80, 110];
const ONSITE_ANGEL_OPTIONS = ['他口', '小飛', '鯨魚', '阿單', '阿葳', '美魚', 'Ling', '尤尤', '小悅'];

// 每個小天使對應的格子背景色(條件式格式自動套用)
const ONSITE_ANGEL_COLORS = {
  '尤尤':   '#f4cccc',  // 粉紅
  '他口':   '#f6b26b',  // 橘
  '小悅':   '#ffd966',  // 黃
  '美魚':   '#d9ead3',  // 淺黃綠
  '小飛':   '#b6d7a8',  // 綠
  'Ling':   '#a4c2f4',  // 淺藍
  '阿單':   '#6fa8dc',  // 深藍
  '鯨魚':   '#d5a6bd',  // 粉紫
  '阿葳':   '#b4a7d6'   // 紫
};

const ONSITE_THEME_TITLES = {
  daughter: '不存在的女兒',
  hamel: '哈梅爾寺',
  ai: '這是 AI 做的密室',
  geppetto: '杰佩多先生'
};
const ONSITE_THEME_COLORS = {
  daughter: '#fdd9e1',
  hamel:    '#ffe5b4',
  ai:       '#cdebd6',
  geppetto: '#d9e2ff'
};
// 每 day block 列數 = 6 場次 + 1 日結 = 7
const ONSITE_DAY_ROWS = ONSITE_MAX_SLOTS + 1;
const ONSITE_HEADER_ROWS = 2;  // 主題列 + 子標題列

function _onsiteThemeStartCol_(themeIdx) {
  // A=日期, B=星期, 從 C 開始第一個主題
  return 3 + themeIdx * ONSITE_THEME_COL_LABELS.length;
}

/**
 * 重畫單一月份的現場收款分頁
 */
function rebuildOnsiteMonth_(yyyymm) {
  if (!ONSITE_SHEET_ID) return;
  const ss = SpreadsheetApp.openById(ONSITE_SHEET_ID);
  let view = ss.getSheetByName(yyyymm);
  if (!view) view = ss.insertSheet(yyyymm);

  const parts = yyyymm.split('-').map(Number);
  const y = parts[0], m = parts[1];
  const daysInMonth = new Date(y, m, 0).getDate();

  // 1) 從現有分頁保留「收款 / 小天使 / 備註」(以 date|theme|time 為 key)
  const preserved = {};
  const existingLast = view.getLastRow();
  if (existingLast > ONSITE_HEADER_ROWS) {
    // 用我們的固定布局回推
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStartRow = ONSITE_HEADER_ROWS + 1 + (d - 1) * ONSITE_DAY_ROWS;
      const slotsBlockEndRow = dayStartRow + ONSITE_MAX_SLOTS - 1;
      if (slotsBlockEndRow > existingLast) break;
      const dateStr = yyyymm + '-' + String(d).padStart(2, '0');
      const dt = new Date(y, m - 1, d);
      const dow = dt.getDay();
      if (dow === 3) continue; // 公休那天什麼都沒填
      for (let ti = 0; ti < ONSITE_THEME_ORDER.length; ti++) {
        const themeId = ONSITE_THEME_ORDER[ti];
        const slots = slotsForThemeDate_(themeId, dateStr);
        const themeCol = _onsiteThemeStartCol_(ti);
        for (let i = 0; i < slots.length; i++) {
          const row = dayStartRow + i;
          // 欄位: 場次=themeCol+0, 小天使=+1, 實習生=+2, 現金=+3, 文化幣=+4, 備註=+5
          const angel = view.getRange(row, themeCol + 1).getValue();
          const intern = view.getRange(row, themeCol + 2).getValue();
          const cash = view.getRange(row, themeCol + 3).getValue();
          const coin = view.getRange(row, themeCol + 4).getValue();
          const note = view.getRange(row, themeCol + 5).getValue();
          if (cash !== '' || coin !== '' || angel !== '' || intern !== '' || note !== '') {
            preserved[dateStr + '|' + themeId + '|' + slots[i]] = {
              cash: cash, coin: coin, angel: angel, intern: intern, note: note
            };
          }
        }
      }
    }
  }

  // 先清掉所有舊資料驗證 / 條件式格式 / 合併,避免新舊欄位錯位殘留
  const wholeRange = view.getRange(1, 1, view.getMaxRows(), view.getMaxColumns());
  wholeRange.clearDataValidations();
  wholeRange.breakApart();
  view.clearConditionalFormatRules();
  view.clear();

  // 2) 從 Bookings 抓本月所有 confirmed,建立 (date|theme|time -> booking) map
  const src = ensureSheet_();
  const srcLast = src.getLastRow();
  const bookMap = {};
  if (srcLast >= 2) {
    const values = src.getRange(2, 1, srcLast - 1, HEADERS.length).getValues();
    for (const row of values) {
      const status = String(row[11] || 'confirmed');
      if (status !== 'confirmed') continue;
      const date = formatDate_(row[4]);
      if (date.indexOf(yyyymm) !== 0) continue;
      const time = formatTime_(row[5]);
      const themeId = String(row[2]);
      bookMap[date + '|' + themeId + '|' + time] = {
        name: String(row[7] || ''),
        people: Number(row[6]) || 0,
        phone: String(row[8] || ''),
        id: String(row[0])
      };
    }
  }

  // 3) 生成 headers (兩列)
  const totalCols = 2 + ONSITE_THEME_ORDER.length * ONSITE_THEME_COL_LABELS.length + 2;
  const colTotalShouShou = totalCols - 1;  // 今日實收 (0-indexed)
  const colTotalIncome = totalCols;        // 今日總收益 (1-indexed for letter)
  const header1 = new Array(totalCols).fill('');
  header1[0] = '日期';
  header1[1] = '星期';
  for (let ti = 0; ti < ONSITE_THEME_ORDER.length; ti++) {
    const startIdx = _onsiteThemeStartCol_(ti) - 1;
    header1[startIdx] = ONSITE_THEME_TITLES[ONSITE_THEME_ORDER[ti]];
  }
  header1[totalCols - 2] = '日結合計';
  const header2 = new Array(totalCols).fill('');
  for (let ti = 0; ti < ONSITE_THEME_ORDER.length; ti++) {
    const startIdx = _onsiteThemeStartCol_(ti) - 1;
    for (let c = 0; c < ONSITE_THEME_COL_LABELS.length; c++) {
      header2[startIdx + c] = ONSITE_THEME_COL_LABELS[c];
    }
  }
  header2[totalCols - 2] = '今日實收';
  header2[totalCols - 1] = '今日總收益';

  const data = [header1, header2];
  const notes = [new Array(totalCols).fill(''), new Array(totalCols).fill('')];
  const bookedCells = [];        // 預約格 [{row, col}],事後染黃 + 加下拉
  const dailySubtotalRows = []; // 1-indexed sheet row
  const closedDayRows = [];      // 公休整個日整 block 染色用

  // 4) 每天的 7 列(6 場次 + 1 日結)
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = yyyymm + '-' + String(d).padStart(2, '0');
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();
    const isClosed = dow === 3;
    const wkLabel = '週' + WEEKDAYS_TC[dow];

    // dayStartRow = 在最終 sheet 的第幾列(1-indexed)
    const dayStartRow = ONSITE_HEADER_ROWS + 1 + (d - 1) * ONSITE_DAY_ROWS;

    // 6 場次列
    for (let i = 0; i < ONSITE_MAX_SLOTS; i++) {
      const row = new Array(totalCols).fill('');
      const noteRow = new Array(totalCols).fill('');
      if (i === 0) {
        row[0] = dateStr;
        row[1] = wkLabel;
      }
      for (let ti = 0; ti < ONSITE_THEME_ORDER.length; ti++) {
        const themeId = ONSITE_THEME_ORDER[ti];
        const startIdx = _onsiteThemeStartCol_(ti) - 1;
        if (isClosed) {
          row[startIdx] = '公休';
          continue;
        }
        const slots = slotsForThemeDate_(themeId, dateStr);
        if (i >= slots.length) continue;
        const time = slots[i];
        row[startIdx + 0] = time;
        const k = dateStr + '|' + themeId + '|' + time;
        const b = bookMap[k];
        const p = preserved[k];
        if (b) {
          // 預約格 (小天使欄): 顯示已選天使名字(若有);hover note 顯示客戶資訊
          row[startIdx + 1] = (p && p.angel) || '';
          noteRow[startIdx + 1] = '姓名: ' + b.name + '\n人數: ' + b.people + ' 人\n電話: ' + b.phone;
          bookedCells.push({
            row: ONSITE_HEADER_ROWS + 1 + (d - 1) * ONSITE_DAY_ROWS + i,
            col: startIdx + 1 + 1  // 1-indexed
          });
        }
        if (p) {
          row[startIdx + 2] = p.intern || '';
          row[startIdx + 3] = p.cash || '';
          row[startIdx + 4] = p.coin || '';
          row[startIdx + 5] = p.note || '';
        }
      }
      data.push(row);
      notes.push(noteRow);
    }

    // 日結列
    const subRow = new Array(totalCols).fill('');
    subRow[1] = (m + '/' + d) + ' 日結';
    if (!isClosed) {
      const fr = dayStartRow;
      const lr = dayStartRow + ONSITE_MAX_SLOTS - 1;
      const subRowNum = dayStartRow + ONSITE_MAX_SLOTS;
      const cashCols = [];
      const coinCols = [];
      for (let ti = 0; ti < ONSITE_THEME_ORDER.length; ti++) {
        const startIdx = _onsiteThemeStartCol_(ti) - 1;
        const colCash = _onsiteColLetter_(startIdx + 3 + 1);
        const colCoin = _onsiteColLetter_(startIdx + 4 + 1);
        subRow[startIdx + 3] = '=SUM(' + colCash + fr + ':' + colCash + lr + ')';
        subRow[startIdx + 4] = '=SUM(' + colCoin + fr + ':' + colCoin + lr + ')';
        cashCols.push(colCash);
        coinCols.push(colCoin);
      }
      // 今日實收 = 各主題 現金加總
      subRow[totalCols - 2] = '=' + cashCols.map(function (c) { return c + subRowNum; }).join('+');
      // 今日總收益 = 各主題 (現金 + 文化幣) 加總
      const allCols = cashCols.concat(coinCols);
      subRow[totalCols - 1] = '=' + allCols.map(function (c) { return c + subRowNum; }).join('+');
    } else {
      subRow[2] = '公休';
    }
    data.push(subRow);
    notes.push(new Array(totalCols).fill(''));
    dailySubtotalRows.push(dayStartRow + ONSITE_MAX_SLOTS);
    if (isClosed) {
      closedDayRows.push(dayStartRow);
    }
  }

  // 5) 空白列
  data.push(new Array(totalCols).fill(''));
  notes.push(new Array(totalCols).fill(''));
  // 6) 本月總計
  const monthRow = new Array(totalCols).fill('');
  monthRow[1] = yyyymm + ' 本月總計';
  for (let ti = 0; ti < ONSITE_THEME_ORDER.length; ti++) {
    const startIdx = _onsiteThemeStartCol_(ti) - 1;
    const colCash = _onsiteColLetter_(startIdx + 3 + 1);
    const colCoin = _onsiteColLetter_(startIdx + 4 + 1);
    monthRow[startIdx + 3] = '=SUMIFS(' + colCash + ':' + colCash + ', B:B, "*日結*")';
    monthRow[startIdx + 4] = '=SUMIFS(' + colCoin + ':' + colCoin + ', B:B, "*日結*")';
  }
  const colShouShouLetter = _onsiteColLetter_(totalCols - 1);
  const colTotalLetter = _onsiteColLetter_(totalCols);
  monthRow[totalCols - 2] = '=SUMIFS(' + colShouShouLetter + ':' + colShouShouLetter + ', B:B, "*日結*")';
  monthRow[totalCols - 1] = '=SUMIFS(' + colTotalLetter + ':' + colTotalLetter + ', B:B, "*日結*")';
  data.push(monthRow);
  notes.push(new Array(totalCols).fill(''));
  const monthRowIndex = data.length;  // 1-indexed final sheet row

  // 7) 寫入
  view.getRange(1, 1, data.length, totalCols).setValues(data);
  view.getRange(1, 1, notes.length, totalCols).setNotes(notes);

  // 預約格染黃 + 小天使下拉選單
  const angelRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ONSITE_ANGEL_OPTIONS, true)
    .setAllowInvalid(false)
    .build();
  for (const cell of bookedCells) {
    view.getRange(cell.row, cell.col)
      .setBackground('#fff4d6')
      .setDataValidation(angelRule);
  }

  // 8) 樣式
  view.setFrozenRows(2);
  view.setFrozenColumns(2);

  // 主題列合併 + 上色
  for (let ti = 0; ti < ONSITE_THEME_ORDER.length; ti++) {
    const startCol = _onsiteThemeStartCol_(ti);
    view.getRange(1, startCol, 1, ONSITE_THEME_COL_LABELS.length).merge()
      .setHorizontalAlignment('center')
      .setBackground(ONSITE_THEME_COLORS[ONSITE_THEME_ORDER[ti]])
      .setFontWeight('bold');
    view.getRange(2, startCol, 1, ONSITE_THEME_COL_LABELS.length)
      .setFontWeight('bold')
      .setBackground('#f3f3f3')
      .setHorizontalAlignment('center');
  }
  // 日結合計 區塊
  view.getRange(1, totalCols - 1, 1, 2).merge()
    .setHorizontalAlignment('center')
    .setBackground('#ffd966')
    .setFontWeight('bold');
  view.getRange(2, totalCols - 1, 1, 2)
    .setFontWeight('bold')
    .setBackground('#ffe599')
    .setHorizontalAlignment('center');
  view.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#f3f3f3');
  view.getRange(2, 1, 1, 2).setFontWeight('bold').setBackground('#f3f3f3').setHorizontalAlignment('center');

  // 合併 A,B 各日的日期/星期(跨 7 列)
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStartRow = ONSITE_HEADER_ROWS + 1 + (d - 1) * ONSITE_DAY_ROWS;
    view.getRange(dayStartRow, 1, ONSITE_MAX_SLOTS, 1).merge()
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setFontWeight('bold');
    view.getRange(dayStartRow, 2, ONSITE_MAX_SLOTS, 1).merge()
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setFontWeight('bold');
  }

  // 公休日染粉紅 + 整塊(含日結列)所有欄位字靠右
  for (const r of closedDayRows) {
    view.getRange(r, 1, ONSITE_MAX_SLOTS + 1, totalCols)
      .setBackground('#fadcdc')
      .setHorizontalAlignment('right');
  }

  // 日結列染淺藍(與預約格的米黃明顯區分)
  for (const r of dailySubtotalRows) {
    if (closedDayRows.indexOf(r - ONSITE_MAX_SLOTS) === -1) {
      view.getRange(r, 1, 1, totalCols).setBackground('#cfe2f3').setFontWeight('bold');
    }
  }

  // 本月總計染金黃
  view.getRange(monthRowIndex, 1, 1, totalCols).setBackground('#ffd966').setFontWeight('bold');

  // 欄寬
  view.setColumnWidth(1, 105);
  view.setColumnWidth(2, 70);
  for (let ti = 0; ti < ONSITE_THEME_ORDER.length; ti++) {
    const startCol = _onsiteThemeStartCol_(ti);
    for (let c = 0; c < ONSITE_THEME_COL_WIDTHS.length; c++) {
      view.setColumnWidth(startCol + c, ONSITE_THEME_COL_WIDTHS[c]);
    }
  }
  view.setColumnWidth(totalCols - 1, 100);  // 今日實收
  view.setColumnWidth(totalCols, 110);      // 今日總收益

  // 數字欄位強制 NUMBER 格式 (避免被舊 TIME 格式吃掉,SUM 顯示成 0:00)
  const maxR = view.getMaxRows();
  for (let ti = 0; ti < ONSITE_THEME_ORDER.length; ti++) {
    const startCol = _onsiteThemeStartCol_(ti);
    view.getRange(1, startCol + 3, maxR, 1).setNumberFormat('#,##0'); // 現金
    view.getRange(1, startCol + 4, maxR, 1).setNumberFormat('#,##0'); // 文化幣
  }
  view.getRange(1, totalCols - 1, maxR, 2).setNumberFormat('#,##0');  // 今日實收 / 今日總收益

  // 小天使選擇 → 對應顏色 (條件式格式;下拉選誰格子就染誰的色)
  const angelRanges = [];
  for (let ti = 0; ti < ONSITE_THEME_ORDER.length; ti++) {
    const startCol = _onsiteThemeStartCol_(ti);
    const angelCol = startCol + 1;
    angelRanges.push(view.getRange(3, angelCol, view.getMaxRows() - 2, 1));
  }
  const colorRules = [];
  for (const angelName in ONSITE_ANGEL_COLORS) {
    colorRules.push(
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(angelName)
        .setBackground(ONSITE_ANGEL_COLORS[angelName])
        .setRanges(angelRanges)
        .build()
    );
  }
  view.setConditionalFormatRules(colorRules);

  // 同步建立 / 更新營業報表分頁 (失敗不影響現場表)
  try { syncToReport_(yyyymm); } catch (e) { Logger.log('syncToReport_ err: ' + e); }
}

/* ============================================================
 * 營業報表同步: 在報表寫 IMPORTRANGE 直接抓現場表的日結
 *   - 分頁名: 26/5月營業報表 (= {yy}/{m}月營業報表)
 *   - 缺分頁時複製「空白月營業報表」範本並重新命名
 *   - B/D/F/H = 各主題該日現金日結 (IMPORTRANGE)
 *   - L = 4 主題該日文化幣加總 (IMPORTRANGE)
 *   - K/O/J/M/N 等其他欄完全不動 (沿用報表既有公式 / 人工輸入)
 *   - 第一次跑後,請開報表點允許 IMPORTRANGE 授權一次即可
 * ============================================================ */

function _reportTabName_(yyyymm) {
  const yy = parseInt(yyyymm.substring(2, 4), 10);
  const mm = parseInt(yyyymm.substring(5, 7), 10);
  return yy + '/' + mm + '月營業報表';
}

// 不要 sync 的月份 (例:現場表沒有歷史資料,維持手工數字)
const REPORT_SYNC_SKIP = { '2026-04': true };

/**
 * 確保報表分頁有正確的日期列數 (28/29/30/31),在總計列前面插入或刪除列。
 * 並更新總計列的 SUM 公式範圍。
 */
function _ensureMonthRows_(tab, daysInMonth) {
  const lastRow = tab.getLastRow();
  const aValues = tab.getRange(1, 1, Math.max(lastRow, 35), 1).getValues();
  let totalRow = -1;
  for (let i = 0; i < aValues.length; i++) {
    if (String(aValues[i][0]).trim() === '總計') { totalRow = i + 1; break; }
  }
  if (totalRow < 0) return; // 找不到總計列,異常不動
  const expectedTotalRow = daysInMonth + 2; // header row 1 + N 個日期列
  if (totalRow > expectedTotalRow) {
    tab.deleteRows(expectedTotalRow, totalRow - expectedTotalRow);
  } else if (totalRow < expectedTotalRow) {
    tab.insertRowsBefore(totalRow, expectedTotalRow - totalRow);
  }
  // A2..A{daysInMonth+1} 填日期數字 1..daysInMonth
  const dayLabels = [];
  for (let d = 1; d <= daysInMonth; d++) dayLabels.push([d]);
  tab.getRange(2, 1, daysInMonth, 1).setValues(dayLabels);
  // 總計列公式 (跟著新位置走)
  const tr = expectedTotalRow;
  tab.getRange(tr, 1).setValue('總計');
  const lastDayRow = tr - 1;
  tab.getRange('B' + tr).setFormula('=SUM(B2:B' + lastDayRow + ')');
  tab.getRange('D' + tr).setFormula('=SUM(D2:D' + lastDayRow + ')');
  tab.getRange('F' + tr).setFormula('=SUM(F2:F' + lastDayRow + ')');
  tab.getRange('H' + tr).setFormula('=SUM(H2:H' + lastDayRow + ')');
  tab.getRange('J' + tr).setFormula('=SUM(J2:J' + lastDayRow + ')');
  tab.getRange('K' + tr).setFormula('=B' + tr + '+D' + tr + '+F' + tr + '+H' + tr + '+J' + tr);
  tab.getRange('L' + tr).setFormula('=SUM(L2:L' + lastDayRow + ')');
  tab.getRange('M' + tr).setFormula('=SUM(M2:M' + lastDayRow + ')');
  tab.getRange('O' + tr).setFormula('=K' + tr + '-M' + tr + '-L' + tr);
  tab.getRange('R' + tr).setFormula('=SUM(R2:R' + lastDayRow + ')');
}

/**
 * 從 yyyymm 算上一個月 (例: '2026-06' -> '2026-05')
 */
function _prevYYYYMM_(yyyymm) {
  const parts = yyyymm.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 2, 1); // m - 2 因為 JS month 0-indexed,再減 1
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}

/**
 * 設置「錢箱現金」欄 (S 欄): 從 26/6 起生效
 *   - S1 = '錢箱現金'
 *   - day d (row d+1): S = O - R
 *   - day 1 額外加: 上個月 S 總計 (如果上個月有此欄)
 *   - 總計列 = SUM(S)
 */
function _setCashBoxColumn_(tab, yyyymm, daysInMonth, reportSS) {
  if (yyyymm < '2026-06') return;
  tab.getRange(1, 19).setValue('錢箱現金'); // S1
  const lastDayRow = daysInMonth + 1;

  // 看上個月是否已啟用此欄 → 是的話 day 1 帶上一月總計
  let carry = '';
  const prevYYYYMM = _prevYYYYMM_(yyyymm);
  const prevTab = reportSS.getSheetByName(_reportTabName_(prevYYYYMM));
  if (prevTab) {
    const prevHeader = String(prevTab.getRange(1, 19).getValue() || '');
    if (prevHeader === '錢箱現金') {
      const prevParts = prevYYYYMM.split('-').map(Number);
      const prevDays = new Date(prevParts[0], prevParts[1], 0).getDate();
      const prevTotalRow = prevDays + 2;
      carry = "+IFERROR('" + _reportTabName_(prevYYYYMM) + "'!S" + prevTotalRow + ",0)";
    }
  }

  // day 1: S2 = O2-R2 (+ carry)
  tab.getRange('S2').setFormula('=O2-R2' + carry);
  // day 2..N
  for (let r = 3; r <= lastDayRow; r++) {
    tab.getRange('S' + r).setFormula('=O' + r + '-R' + r);
  }
  // 總計
  const tr = lastDayRow + 1;
  tab.getRange('S' + tr).setFormula('=SUM(S2:S' + lastDayRow + ')');
}

function syncToReport_(yyyymm) {
  if (!REPORT_SHEET_ID || !ONSITE_SHEET_ID) return;
  if (REPORT_SYNC_SKIP[yyyymm]) { Logger.log('skip sync: ' + yyyymm); return; }
  const reportSS = SpreadsheetApp.openById(REPORT_SHEET_ID);
  const tabName = _reportTabName_(yyyymm);
  let tab = reportSS.getSheetByName(tabName);
  if (!tab) {
    const tpl = reportSS.getSheetByName(REPORT_TEMPLATE_TAB);
    if (!tpl) {
      Logger.log('找不到範本分頁: ' + REPORT_TEMPLATE_TAB);
      return;
    }
    tab = tpl.copyTo(reportSS);
    tab.setName(tabName);
    const mm = parseInt(yyyymm.substring(5, 7), 10);
    try { tab.getRange(1, 1).setValue(mm + '月'); } catch (e) {}
  }

  const parts = yyyymm.split('-').map(Number);
  const y = parts[0], m = parts[1];
  const daysInMonth = new Date(y, m, 0).getDate();
  const ID = ONSITE_SHEET_ID;

  // 確保日期列數正確 (28/29/30/31) + 總計列在對的位置
  _ensureMonthRows_(tab, daysInMonth);

  for (let d = 1; d <= daysInMonth; d++) {
    // 現場表日結列 (1-indexed): header 2 + 前 d-1 天 * 7 + 6 場次 + 1 = 2 + d*7
    const onsiteSubRow = 2 + d * ONSITE_DAY_ROWS;
    const reportRow = d + 1;
    // 保險:報表 A 欄該列必須是日期數字 d,否則 (例如 '總計') 跳過避免覆寫 SUM
    const aCell = tab.getRange(reportRow, 1).getValue();
    if (Number(aCell) !== d) { Logger.log(yyyymm + ' skip row ' + reportRow + ' (A=' + aCell + ')'); continue; }

    // 每主題 (現金 + 文化幣) → 報表對應欄
    for (const themeId in REPORT_THEME_MAP) {
      const map = REPORT_THEME_MAP[themeId];
      const cashRng = "'" + yyyymm + "'!" + map.onsiteCash + onsiteSubRow;
      const coinRng = "'" + yyyymm + "'!" + map.onsiteCoin + onsiteSubRow;
      const formula = '=IFERROR(IMPORTRANGE("' + ID + '","' + cashRng + '"),0)+IFERROR(IMPORTRANGE("' + ID + '","' + coinRng + '"),0)';
      tab.getRange(map.reportCol + reportRow).setFormula(formula);
    }

    // L = 4 主題文化幣加總
    const coinParts = [];
    for (const themeId in REPORT_THEME_MAP) {
      const map = REPORT_THEME_MAP[themeId];
      coinParts.push('IFERROR(IMPORTRANGE("' + ID + '","\'' + yyyymm + "'!" + map.onsiteCoin + onsiteSubRow + '"),0)');
    }
    tab.getRange('L' + reportRow).setFormula('=' + coinParts.join('+'));
  }

  // 錢箱現金欄 (26/6 起)
  _setCashBoxColumn_(tab, yyyymm, daysInMonth, reportSS);
}

/**
 * 一鍵把現場表所有月份分頁同步到營業報表 (手動跑一次回填,日常自動)。
 */
function syncAllToReport() {
  if (!ONSITE_SHEET_ID) return;
  const ss = SpreadsheetApp.openById(ONSITE_SHEET_ID);
  const months = [];
  ss.getSheets().forEach(function (sh) {
    if (/^\d{4}-\d{2}$/.test(sh.getName())) months.push(sh.getName());
  });
  months.sort();
  for (const m of months) {
    try { syncToReport_(m); } catch (e) { Logger.log(m + ' err: ' + e); }
  }
  Logger.log('Synced report months: ' + months.join(', '));
}

/**
 * 把 1-indexed 欄號轉成欄母 (1->A, 27->AA)。
 */
function _onsiteColLetter_(col) {
  let s = '';
  while (col > 0) {
    const r = (col - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

/**
 * 一鍵清掉舊「收款明細」分頁 + 重建所有月份分頁。
 * 第一次升級到 v2 跑一次,日後 createBooking_ / cancel / update 會自動同步。
 */
function syncAllToOnsiteV2() {
  if (!ONSITE_SHEET_ID) throw new Error('ONSITE_SHEET_ID 未設定');
  const ss = SpreadsheetApp.openById(ONSITE_SHEET_ID);

  // 刪除舊 v1 的 收款明細 分頁(若存在)
  const old = ss.getSheetByName('收款明細');
  if (old) {
    ss.deleteSheet(old);
    Logger.log('已刪除舊「收款明細」分頁');
  }

  // 為避免欄位數變更殘留,先刪掉所有 YYYY-MM 分頁再重建
  const allSheets = ss.getSheets();
  for (const sh of allSheets) {
    if (/^\d{4}-\d{2}$/.test(sh.getName())) {
      ss.deleteSheet(sh);
    }
  }

  // 從 Bookings 抓所有月份
  const src = ensureSheet_();
  const last = src.getLastRow();
  if (last < 2) {
    Logger.log('Bookings 是空的,無資料可同步');
    return;
  }
  const months = new Set();
  const dates = src.getRange(2, 5, last - 1, 1).getValues();
  for (const row of dates) {
    const d = formatDate_(row[0]);
    if (d && /^\d{4}-\d{2}/.test(d)) months.add(d.substring(0, 7));
  }

  Array.from(months).sort().forEach(rebuildOnsiteMonth_);
  Logger.log('已同步 ' + months.size + ' 個月份');
}


/**
 * 重畫現場表的所有月份分頁(保留現金/小天使/備註)。
 * 跟 syncAllToOnsiteV2 不同:這個不刪 tab,只 rebuild 每個現有 tab。
 */
function rebuildAllOnsite() {
  if (!ONSITE_SHEET_ID) return;
  const ss = SpreadsheetApp.openById(ONSITE_SHEET_ID);
  const monthSet = {};
  // 1) 現場表已存在的月份分頁
  ss.getSheets().forEach(function (sh) {
    if (/^\d{4}-\d{2}$/.test(sh.getName())) monthSet[sh.getName()] = true;
  });
  // 2) Bookings 裡有預約的月份(會自動補建現場表還沒有的分頁)
  const src = ensureSheet_();
  const last = src.getLastRow();
  if (last >= 2) {
    const dates = src.getRange(2, 5, last - 1, 1).getValues();
    for (const row of dates) {
      const d = formatDate_(row[0]);
      if (d && /^\d{4}-\d{2}/.test(d)) monthSet[d.substring(0, 7)] = true;
    }
  }
  const months = Object.keys(monthSet).sort();
  for (const m of months) {
    rebuildOnsiteMonth_(m);
  }
  Logger.log('Rebuilt onsite months: ' + months.join(', '));
}
