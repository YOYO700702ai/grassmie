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
