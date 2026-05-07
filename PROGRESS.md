# 草咩咩專案進度筆記

最後更新:2026-05-08

---

## 目前狀態總覽

| 項目 | 狀態 |
|---|---|
| 官網靜態檔 | ✅ 完成(首頁 + 4 主題頁 + 預約頁) |
| 線上預約系統前端 | ✅ 完成(多步驟 + 從主題頁進入鎖定主題模式) |
| Google Apps Script 後端 | ✅ 部署完成 |
| Google Sheet 月份視覺化分頁 | ✅ 完成(每月一張、淺色 + 粗線分日) |
| GitHub 倉庫 | ✅ 已推送 |
| GitHub Pages 上架 | ✅ DNS 已生效,HTTP 可連 |
| HTTPS 憑證 | ⏳ 等 GitHub / Let's Encrypt 簽發(5-30 分鐘) |
| Google Search Console | ❌ 待做(等 HTTPS 好) |

---

## 重要 URL / ID

| 項目 | 值 |
|---|---|
| 正式網址 | http://grassmie.com (HTTPS 簽證中) |
| GitHub Pages 預設網址 | https://yoyo700702ai.github.io/grassmie/ |
| GitHub 倉庫 | https://github.com/YOYO700702ai/grassmie |
| 預約系統後端 (Apps Script Web App) | `https://script.google.com/macros/s/AKfycbyvdtrm3BeDpke6bAbPiIuUrzoyMBOycZRkBtjnVhmpi7DKzdj02puvw9KnlB5enU-X/exec` |
| Apps Script 編輯器 | https://script.google.com/d/1SO5TymfkeAoFY-vRatEHbLhAUQZbBT3uq8au1ZKnb98g3dx370t6MwPf/edit |
| 預約資料 Google Sheet | https://docs.google.com/spreadsheets/d/10pixtZa0WT2A4ocFuSfPjzp9432Z_qLuKMxMLj7yLkc/edit |
| Apps Script ID | `1SO5TymfkeAoFY-vRatEHbLhAUQZbBT3uq8au1ZKnb98g3dx370t6MwPf` |
| Spreadsheet ID | `10pixtZa0WT2A4ocFuSfPjzp9432Z_qLuKMxMLj7yLkc` |

---

## 預約系統規則

- **營業時間**:平日 12:00-22:00,假日 10:00-22:00,**每週三公休**
- **平日 11:00 前不開場**
- **每個主題每 2 小時一場**(不同主題場次時間互相獨立)

| 主題 | 假日場次 | 平日場次 |
|---|---|---|
| 不存在的女兒 | 10/12/14/16/18/20:00 | 12/14/16/18/20:00 |
| 這是 AI 做的密室 | 10/12/14/16/18/20:00 | 12/14/16/18/20:00 |
| 哈梅爾寺 | 09:30/11:30/13:30/15:30/17:30/19:30 | 11:30/13:30/15:30/17:30/19:30 |
| 杰佩多先生 | 10:30/12:30/14:30/16:30/18:30/20:30 | 12:30/14:30/16:30/18:30/20:30 |

---

## Google Sheet 結構

- **Bookings 分頁**:原始資料(每筆預約一列,id/created_at/theme_id/theme_title/date/time/people/name/phone/email/note/status)
- **YYYY-MM 分頁**(如 2026-05、2026-06):月份視覺化
  - 每天 4 列(對應 4 個主題)
  - 6 個場次欄(場 1 ~ 場 6)
  - 已預約格 = 琥珀黃 + `時間\n姓名 N人`,滑鼠移上去看到電話
  - 公休 = 淡粉紅、無此場 = 淺灰、空可預約 = 白(平日) / 奶油黃(假日)
  - 每天下方加粗黑線分隔

---

## 檔案結構

```
草咩咩/
├── index.html                  首頁
├── booking.html                預約頁面外殼
├── booking.js                  預約前端邏輯(API_URL 已寫入)
├── site.js                     主題資料 + 首頁/詳情頁渲染
├── styles.css                  全站樣式
├── apps-script.gs              後端原始碼(Sheet 自動同步用)
├── deploy_booking_backend.py   一鍵建 Sheet + 部署 Apps Script
├── push_code.py                重推程式碼到既有 Apps Script
├── CNAME                       grassmie.com (GitHub Pages 用)
├── robots.txt                  允許全索引
├── sitemap.xml                 6 個頁面
├── SETUP.md                    後端部署手動步驟說明
├── PROGRESS.md                 (本檔案)
└── themes/
    ├── bu-cun-zai-de-nu-er.html
    ├── hamel-temple.html
    ├── ai-room.html
    └── geppetto.html
```

---

## SEO 已完成

- 4 個主題頁、首頁、預約頁皆有:
  - canonical link 指向 grassmie.com
  - description meta
  - Open Graph (FB/LINE 分享預覽)
  - Twitter Card
- 首頁額外有 **LocalBusiness JSON-LD**(地址、電話、營業時間、社群)
- robots.txt + sitemap.xml 已備妥

---

## DNS 設定(GoDaddy,已完成)

```
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
CNAME www   yoyo700702ai.github.io
```

GoDaddy 預設那筆 `_domainconnect` CNAME 不影響,可保留。

---

## 待辦清單

### 短期(等 HTTPS 簽證好之後做)
- [ ] 確認 https://grassmie.com 可連
- [ ] GitHub Pages 設定打開「Enforce HTTPS」
- [ ] Google Search Console 驗證網域所有權
- [ ] 提交 sitemap.xml
- [ ] 對 6 個主要頁面點「要求建立索引」

### 之後想加的功能(目前未實作)
- [ ] 管理者後台 `/admin`(可看清單、取消、關閉時段)
- [ ] 寄預約成功確認信給訂位者
- [ ] 不同人數對應自動帶入價格
- [ ] 預約取消同步重整月份分頁
  (目前手動改 Bookings 的 status 為 cancelled 後要跑 `rebuildAll`)

---

## 常用維護指令

```powershell
cd "C:\Users\USER\Desktop\草咩咩"

# 改完前端 → 推 GitHub(會自動部署到 grassmie.com)
git add .
git commit -m "說明"
git push

# 改完 apps-script.gs → 推到 Apps Script
python push_code.py
# 之後到 https://script.google.com/d/.../edit
# 部署 → 管理部署作業 → 鉛筆編輯 → 版本選新版本 → 部署
```

```js
// Apps Script 編輯器內手動可執行的函式:
ensureUpcomingMonths()  // 預先建本月+未來 2 個月分頁
rebuildAll()             // 從 Bookings 重畫所有月份分頁
```

---

## 與其他 AI 交接相關

- 全域指令:Claude → GPT 用 HANDOFF.md(在專案根目錄;每次覆寫)
- 觸發詞:「交接給 GPT」/「接手」
