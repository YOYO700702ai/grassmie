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

const HEADERS = [
  'id', 'created_at', 'theme_id', 'theme_title',
  'date', 'time', 'people',
  'name', 'phone', 'email', 'note', 'status'
];

// 每主題各自固定每 2 小時一場;週三公休;平日不開 11:00 前場次。
const THEME_SLOTS = {
  daughter: {
    weekday: ['12:00', '14:00', '16:00', '18:00', '20:00'],
    weekend: ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00']
  },
  ai: {
    weekday: ['12:00', '14:00', '16:00', '18:00', '20:00'],
    weekend: ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00']
  },
  hamel: {
    weekday: ['11:30', '13:30', '15:30', '17:30', '19:30'],
    weekend: ['09:30', '11:30', '13:30', '15:30', '17:30', '19:30']
  },
  geppetto: {
    weekday: ['12:30', '14:30', '16:30', '18:30', '20:30'],
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

    return jsonOut_({ ok: true, id: id });
  } finally {
    lock.releaseLock();
  }
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
  const ss = SpreadsheetApp.openById(ONSITE_SHEET_ID);
  const sheet = ss.getSheetByName(ONSITE_TAB);
  if (!sheet) return;
  const pricePerPerson = getPriceForBooking_(booking.theme_id, booking.people, ss);
  const expected = pricePerPerson ? pricePerPerson * booking.people : '';
  sheet.appendRow([
    booking.date,
    booking.time,
    booking.theme_title,
    booking.name,
    booking.people,
    expected,
    '', '', '',                // 現金 / 文化幣 / 備註 (現場填)
    booking.id,
  ]);
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
