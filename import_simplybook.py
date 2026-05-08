"""
從 SimplyBook 匯出的 .xls 檔批次匯入既有預約到 Google Sheet 的 Bookings 分頁。

策略:
  - 以 SimplyBook 代碼當 id 前綴 "SB-",再次執行也不會重複。
  - 已取消的預約 status='cancelled',其餘 confirmed。
  - 不直接呼叫 Apps Script /exec(那會跑衝突檢查 + 月份分頁重建,
    一次幾十筆會超時),改用 Sheets API append。
  - 匯入完後請手動到 Apps Script 編輯器跑 rebuildAll() 重畫月份分頁。
"""
import sys, glob, re
from datetime import datetime
from pathlib import Path

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

import pandas as pd
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

HERE = Path(__file__).parent
TOKEN = Path(r"C:\Users\USER\Desktop\學員與課程管理\token.json")
SHEET_ID = "10pixtZa0WT2A4ocFuSfPjzp9432Z_qLuKMxMLj7yLkc"
SHEET_NAME = "Bookings"

THEME_MAP = {
    "不存在的女兒": ("daughter", "不存在的女兒"),
    "哈梅爾寺": ("hamel", "哈梅爾寺"),
    "這是AI做的密室": ("ai", "這是 AI 做的密室"),
    "這是 AI 做的密室": ("ai", "這是 AI 做的密室"),
    "杰佩多先生": ("geppetto", "杰佩多先生"),
}


def parse_time_range(s):
    """'03:30 PM - 04:45 PM' -> '15:30'"""
    m = re.match(r"\s*(\d{1,2}:\d{2}\s*[AP]M)", str(s))
    if not m:
        return None
    return datetime.strptime(m.group(1).replace(" ", ""), "%I:%M%p").strftime("%H:%M")


def normalize_phone(p):
    """'+886972075119 -> 0972-075-119"""
    s = str(p).strip().lstrip("'").strip()
    if s.startswith("+886"):
        s = "0" + s[4:]
    s = re.sub(r"\D", "", s)
    if len(s) == 10 and s.startswith("09"):
        return f"{s[:4]}-{s[4:7]}-{s[7:]}"
    return s


def find_people(row, df_cols):
    """從 預約人數 / 各主題人數 欄位找出非空的整數。"""
    for c in range(19, len(df_cols)):
        v = row.iloc[c]
        if pd.notna(v):
            try:
                n = int(v)
                if 1 <= n <= 30:
                    return n
            except (ValueError, TypeError):
                pass
    return None


def parse_xls(path):
    df = pd.read_excel(path, engine="calamine", header=None)
    out = []
    for i, row in df.iterrows():
        if i < 3:  # 前三列是標題
            continue
        date = row.iloc[0]
        time_s = row.iloc[1]
        theme = row.iloc[2]
        code = row.iloc[4]
        name = row.iloc[5]
        email = row.iloc[6]
        phone = row.iloc[7]
        cancelled = row.iloc[9]
        created_at = row.iloc[11]

        if not pd.notna(code) or not pd.notna(theme):
            continue
        theme_key = str(theme).strip()
        if theme_key not in THEME_MAP:
            print(f"  [略過] 未知主題: {theme_key}")
            continue
        theme_id, theme_title = THEME_MAP[theme_key]

        time_str = parse_time_range(time_s)
        if not time_str:
            print(f"  [略過] 時間解析失敗: {time_s}")
            continue

        people = find_people(row, df.columns)

        # 日期格式
        if isinstance(date, datetime):
            date_str = date.strftime("%Y-%m-%d")
        else:
            date_str = str(date)[:10]

        # created_at
        if isinstance(created_at, datetime):
            ca = created_at.strftime("%Y-%m-%dT%H:%M:%S")
        elif pd.notna(created_at):
            ca = str(created_at)
        else:
            ca = datetime.now().isoformat()

        status = "cancelled" if str(cancelled).strip() == "是" else "confirmed"

        out.append({
            "id": "SB-" + str(code).strip(),
            "created_at": ca,
            "theme_id": theme_id,
            "theme_title": theme_title,
            "date": date_str,
            "time": time_str,
            "people": people or 2,
            "name": str(name).strip() if pd.notna(name) else "",
            "phone": normalize_phone(phone) if pd.notna(phone) else "",
            "email": str(email).strip() if pd.notna(email) else "",
            "note": "(自 SimplyBook 匯入)",
            "status": status,
        })
    return out


def main():
    creds = Credentials.from_authorized_user_file(str(TOKEN))
    if creds.expired:
        creds.refresh(Request())
    sheets = build("sheets", "v4", credentials=creds)

    # 讀現有 ID,避免重複
    existing = set()
    res = sheets.spreadsheets().values().get(
        spreadsheetId=SHEET_ID, range=f"{SHEET_NAME}!A2:A"
    ).execute()
    for row in res.get("values", []):
        if row:
            existing.add(row[0])
    print(f"[i] Sheet 既有 {len(existing)} 筆")

    # 解析全部 xls
    all_bookings = []
    seen_codes = set()
    for f in sorted(glob.glob(str(HERE / "*.xls"))):
        print(f"\n[*] 解析 {Path(f).name}")
        rows = parse_xls(f)
        print(f"    {len(rows)} 筆")
        for r in rows:
            if r["id"] in seen_codes:
                continue  # 跨檔去重
            seen_codes.add(r["id"])
            all_bookings.append(r)
    print(f"\n[i] 三檔合計去重後 {len(all_bookings)} 筆")

    # 過濾掉已存在的
    new_bookings = [b for b in all_bookings if b["id"] not in existing]
    print(f"[i] 排除已匯入的後,新增 {len(new_bookings)} 筆")

    if not new_bookings:
        print("[i] 沒有新資料,結束。")
        return

    rows_to_append = []
    for b in new_bookings:
        rows_to_append.append([
            b["id"], b["created_at"], b["theme_id"], b["theme_title"],
            b["date"], b["time"], b["people"],
            b["name"], b["phone"], b["email"], b["note"], b["status"]
        ])

    sheets.spreadsheets().values().append(
        spreadsheetId=SHEET_ID,
        range=f"{SHEET_NAME}!A:L",
        valueInputOption="RAW",
        insertDataOption="INSERT_ROWS",
        body={"values": rows_to_append},
    ).execute()
    print(f"[OK] 匯入 {len(rows_to_append)} 筆完成")

    # 列出按月分布
    by_month = {}
    for b in new_bookings:
        m = b["date"][:7]
        by_month[m] = by_month.get(m, 0) + 1
    print("\n[月份分布]")
    for m in sorted(by_month):
        print(f"  {m}: {by_month[m]} 筆")

    print("\n→ 接下來請到 Apps Script 編輯器跑 rebuildAll() 重畫月份分頁:")
    print("  https://script.google.com/d/1SO5TymfkeAoFY-vRatEHbLhAUQZbBT3uq8au1ZKnb98g3dx370t6MwPf/edit")


if __name__ == "__main__":
    main()
