# 員工上班時間登記系統 - Handoff Spec

> 給 grassmie repo 的 AI 看的。員工每月底用網頁登記下個月有空的日期；戚漆 (booking-bot) 從同一張 Sheet 讀取，回答老闆與員工的查詢。
> **網頁前端 + Apps Script endpoint 由你做；bot 端的查詢工具由 booking-bot 那邊接，不歸你寫。**

---

## 一、要做什麼

1. 一頁 `/staff.html` 月曆 UI,員工點日期 → 送出 → 寫進 Sheet
2. Apps Script 新增 endpoints 處理寫入/查詢
3. (戚漆那邊,不歸你) 對應的工具會打你的查詢 endpoint,老闆可在 LINE 群問「6 月誰有空 6/15」

---

## 二、Sheet 結構

**新分頁名稱**:`StaffAvailability` (跟既有 `Bookings` 同一個 spreadsheet 內,新開分頁)

| 欄 | 名稱 | 範例 |
|---|---|---|
| A | id | `SA17783124...` (timestamp + 4 hex) |
| B | user_name | `小華` |
| C | year_month | `2026-06` |
| D | available_dates | `1,3,5,8,9,10,11,12,15,22,23,24,25,26,27,28,29,30`(純整數,逗號分隔;不收 range 簡寫,前端展開後再送) |
| E | note | (可空) |
| F | updated_at | `2026-05-25T10:30:00Z` |

**規則**:
- 同一個 `(user_name, year_month)` 只一筆,新提交**覆寫**舊的
- 日期都用「**整數日 1-31**」儲存,不含月份(year_month 欄已有)

---

## 三、API endpoints (4 個,加進現有 apps-script.gs)

回傳格式統一 `{ok: true, data: ...}` 或 `{ok: false, error: "..."}`,跟 BOT_SPEC.md 那邊一致。POST 需用 `Content-Type: text/plain;charset=utf-8`。

### 1. `POST {action: "set_availability", user_name, year_month, dates, note?}`
寫入或覆寫某員工某月排班。

- `dates`: array of integers,例如 `[1, 3, 5, 8, 9, 10, 11, 12, 15, 22, 23, 24, 25, 26, 27, 28, 29, 30]`
- `year_month`: `YYYY-MM` 字串
- 成功:`{ok: true, data: {id: "SA...", count: 18}}`
- 失敗:`{ok: false, error: "..."}`

### 2. `GET ?action=list_availability&year_month=2026-06`
列該月所有員工。
```json
{ "ok": true, "data": [
  {"user_name":"小華", "dates":[1,3,5,8,9,10,11,12,15,22,23,24,25,26,27,28,29,30], "count":18, "updated_at":"2026-05-25T..."},
  {"user_name":"阿明", "dates":[6,7,9,13,14,15,20], "count":7, "updated_at":"..."}
]}
```

### 3. `GET ?action=get_availability&user_name=小華&year_month=2026-06`
單人單月。找不到回 `{ok:false, error:"小華 尚未登記 2026-06"}`。

### 4. `GET ?action=who_available&date=2026-06-15`
那天誰有空(解析所有 user 的 dates 看是否包含該日)。
```json
{ "ok": true, "data": {
  "date": "2026-06-15",
  "available": ["小華", "阿明"]
}}
```

---

## 四、Frontend `/staff.html`

員工流程:

1. 進頁 → 輸入「姓名」+「PIN」(4 位數密碼,第一次填會自動建檔)
2. 月份選單預設「下個月」(也可切到當月或下下月)
3. 月曆 UI 顯示該月所有日期(週日到週六或週一到週日,你決定)
4. 點選日期 toggle 可上班/不可(深色＝可,淺色＝不可)
5. 「送出」呼叫 `set_availability`
6. 送出成功秀「已記下 N 天:1、3、5-12、15、22-30」並停留

視覺建議:
- 已選日期:草咩咩主視覺色系(綠/橘)
- 未選:白底
- 過去日期:灰色不能選
- 週三:灰色不能選(公休)

---

## 五、設計問題 (請你決定後告訴我,我這邊跟著對齊)

### 1. 認證方式

| 選項 | 優點 | 缺點 |
|---|---|---|
| (a) 純打名字 | 0 設定 | 員工可以亂改別人的 |
| **(b) 名字 + 4 位數 PIN(推薦)** | 簡單擋亂 | 員工要記 PIN(可由老闆事先指定或讓員工自設) |
| (c) 跟 LINE 帳號綁定 | 最安全 | 需要 LIFF 開發,超出小工具規模 |

我建議 **(b)**:第一次填寫時設定 PIN(存 Sheet 雜湊),之後輸入 PIN 才能改自己的。

### 2. 截止日期

- 預設**每月 28 號 23:59 截止**下個月的編輯?過期變唯讀?
- 或老闆手動鎖(多一個 `lock_month` action)?
- 還是完全不鎖,員工隨時可以改?

### 3. 老闆權限

- 老闆怎麼識別?建議用一個 `OWNER_PIN` 常數(寫在 apps-script.gs 設定區)
- 老闆能不能代員工提交/覆寫?建議**能**,但要在 Sheet 記一欄 `last_modified_by`

---

## 六、戚漆那邊會打的 endpoint (給你參考,不用你做)

我會接這 3 個工具給戚漆:
- `staff_list_month(year_month)` → 打 `list_availability`
- `staff_get_one(user_name, year_month)` → 打 `get_availability`
- `staff_who_available(date)` → 打 `who_available`

員工提交一律走網頁,bot 沒有寫入工具(避免聊天輸入錯誤導致排班混亂)。

---

## 七、Push to GitHub Pages

`grassmie` 似乎已部署在 GitHub Pages(看 `CNAME`)。新頁加進來後自動部署,URL 應該是 `https://草咩咩網域/staff.html`,員工書籤起來就好。

---

## 八、進度同步

實作過程中你有想到的問題、卡關、或設計變更,直接更新這份 `STAFF_AVAILABILITY_SPEC.md`(多開「實作備註」章節就好)。完成後在 `PROGRESS.md` 記一筆「YYYY-MM-DD 員工排班登記網頁上線 (/staff.html)」。

booking-bot 那邊有對應的 PROGRESS 我會自己記。
