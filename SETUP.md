# 草咩咩預約系統 - 部署設定

預約系統用 **Google Apps Script + Google Sheet** 當後端。
依下列步驟把後端部署起來,再把 URL 貼到 `booking.js`。

---

## 一、建立 Google Sheet

1. 開 https://sheets.new ,新建一個試算表,改名例如「草咩咩預約管理」。
2. 不用手動建工作表/標題列,Apps Script 第一次寫入時會自動建立 `Bookings` 工作表並寫入欄位標題。

## 二、貼上 Apps Script 後端

1. 在剛剛建好的 Google Sheet,選單點 **擴充功能 → Apps Script**。
2. 把開啟的 `Code.gs` 內容**整段刪掉**,換成本專案根目錄 `apps-script.gs` 的內容。
3. (可選)如要收新預約 Email 通知,把 `apps-script.gs` 裡這行的空字串改成你的 Email:
   ```js
   const NOTIFY_TO = '';      // 改成 'you@example.com'
   ```
4. 按工具列 💾 儲存。

## 三、部署為 Web App

1. 右上角點 **部署 → 新增部署作業**。
2. 類型選 **網頁應用程式 (Web app)**。
3. 設定:
   - 「執行身分」:**我**(以你帳號執行,才能寫入 Sheet)。
   - 「誰可以存取」:**任何人**(這樣前端網站才能呼叫;不會公開資料,只能透過 API)。
4. 按 **部署**,首次會跳授權,選你的帳號 → 進階 → 前往(不安全)→ 允許。
5. 部署完成會顯示一段網址,類似:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```
   **複製這個 URL**。

## 四、把 URL 貼進前端

打開 `booking.js`,第 6 行:

```js
const API_URL = ""; // ← 貼上 Apps Script 部署後的 Web App URL
```

把 URL 貼進去,變成:

```js
const API_URL = "https://script.google.com/macros/s/AKfycbx.../exec";
```

存檔即可。

## 五、測試

1. 直接用瀏覽器打開 `index.html` 或 `booking.html`(本機雙擊就行)。
2. 跑一次完整預約流程,送出後到 Google Sheet 看 `Bookings` 工作表會出現新一列。
3. 若選同一時段重複預約,後端會擋下並提示「此時段已被預約」。

---

## 規則說明

- **營業時間**:平日 12:00–22:00,假日 10:00–22:00,週三公休。
- **場次**(寫死在 `booking.js`):
  - 平日:12:00 / 14:00 / 16:00 / 18:00 / 20:00
  - 假日:10:00 / 12:00 / 14:00 / 16:00 / 18:00 / 20:00
  - 週三完全不開放(系統會擋下)。
- **每個主題各自一張時段表**——主題 A 在 14:00 被預約,不影響主題 B 同時段。
  (如果未來空間互卡,可在 Apps Script 的 `createBooking_` 裡加跨主題衝突檢查。)
- 預約寫入後狀態為 `confirmed`,要取消可手動把該列 L 欄改成 `cancelled`,系統就會把該時段重新開放。

## 之後想加的東西(目前未實作)

- 管理者後台 (`/admin` 頁,登入後可看清單、取消、關閉時段)
- 寄確認信給訂位者
- 不同人數對應自動帶價

要加的時候再說一聲。

---

## 常見問題

**Q: 改了 `apps-script.gs` 內容後預約還是用舊的?**
A: Apps Script 改動後要 **重新部署**:右上「部署 → 管理部署作業 → 編輯(鉛筆)→ 版本選新版本 → 部署**。URL 不會變。

**Q: 收不到通知信?**
A: 確認 `NOTIFY_TO` 已填,且 Apps Script 第一次部署有同意「寄 email」權限。可在 Apps Script 編輯器手動執行一次 `sendNotificationEmail_` 觸發授權。

**Q: 想換場次時間或加 / 減場次?**
A: 改 `booking.js` 開頭的 `WEEKDAY_SLOTS` / `WEEKEND_SLOTS` 陣列即可。
