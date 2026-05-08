"""
建立「草咩咩現場收款」Google Sheet。

結構:
  - 收款明細  一列一筆預約;欄位含日期/時間/主題/姓名/人數/應收/現金/文化幣/備註/預約ID
                右側 K-L 欄是即時儀表板(今日筆數/現金/文化幣)
  - 定價      4 主題各人數區段的單價(可手動微調)

完成後印出 SHEET_ID,接著要把它寫進 apps-script.gs 並重推。
"""
import sys, json
from pathlib import Path

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

TOKEN = Path(r"C:\Users\USER\Desktop\學員與課程管理\token.json")

PRICES = [
    ["daughter", "不存在的女兒", 2, 2, 850],
    ["daughter", "不存在的女兒", 3, 4, 680],
    ["daughter", "不存在的女兒", 5, 6, 600],
    ["hamel",    "哈梅爾寺",     2, 2, 650],
    ["hamel",    "哈梅爾寺",     3, 4, 580],
    ["ai",       "這是 AI 做的密室", 2, 2, 650],
    ["ai",       "這是 AI 做的密室", 3, 4, 550],
    ["ai",       "這是 AI 做的密室", 5, 6, 500],
    ["geppetto", "杰佩多先生",   3, 4, 580],
    ["geppetto", "杰佩多先生",   5, 6, 500],
]

DETAIL_HEADERS = ["日期", "時間", "主題", "姓名", "人數", "應收",
                  "現金實收", "文化幣", "備註", "預約 ID"]
PRICE_HEADERS = ["theme_id", "主題", "人數下限", "人數上限", "每人單價"]


def main():
    creds = Credentials.from_authorized_user_file(str(TOKEN))
    if creds.expired:
        creds.refresh(Request())
    sheets = build("sheets", "v4", credentials=creds)

    body = {
        "properties": {
            "title": "草咩咩現場收款",
            "locale": "zh_TW",
            "timeZone": "Asia/Taipei",
        },
        "sheets": [
            {"properties": {"title": "收款明細", "sheetId": 100}},
            {"properties": {"title": "定價", "sheetId": 101}},
        ],
    }
    res = sheets.spreadsheets().create(body=body).execute()
    sid = res["spreadsheetId"]
    url = res["spreadsheetUrl"]
    print(f"[1/4] Sheet 建立: {url}")

    # 收款明細 標題列 + 儀表板
    sheets.spreadsheets().values().update(
        spreadsheetId=sid,
        range="收款明細!A1",
        valueInputOption="USER_ENTERED",
        body={"values": [DETAIL_HEADERS]},
    ).execute()
    sheets.spreadsheets().values().update(
        spreadsheetId=sid,
        range="收款明細!K1:L3",
        valueInputOption="USER_ENTERED",
        body={"values": [
            ["今日筆數",   '=COUNTIFS(A:A, TEXT(TODAY(),"yyyy-mm-dd"))'],
            ["今日現金",   '=SUMIFS(G:G, A:A, TEXT(TODAY(),"yyyy-mm-dd"))'],
            ["今日文化幣", '=SUMIFS(H:H, A:A, TEXT(TODAY(),"yyyy-mm-dd"))'],
        ]},
    ).execute()
    print("[2/4] 收款明細 標題與儀表板就位")

    # 定價
    sheets.spreadsheets().values().update(
        spreadsheetId=sid,
        range="定價!A1",
        valueInputOption="USER_ENTERED",
        body={"values": [PRICE_HEADERS] + PRICES},
    ).execute()
    print("[3/4] 定價表寫入完成")

    # 樣式: 凍結首列 / 標題粗體 / 欄寬 / 儀表板背景
    sheets.spreadsheets().batchUpdate(spreadsheetId=sid, body={
        "requests": [
            {"updateSheetProperties": {
                "properties": {"sheetId": 100, "gridProperties": {"frozenRowCount": 1}},
                "fields": "gridProperties.frozenRowCount",
            }},
            {"repeatCell": {
                "range": {"sheetId": 100, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 10},
                "cell": {"userEnteredFormat": {"textFormat": {"bold": True}, "backgroundColor": {"red": 0.95, "green": 0.95, "blue": 0.95}}},
                "fields": "userEnteredFormat(textFormat,backgroundColor)",
            }},
            {"repeatCell": {
                "range": {"sheetId": 100, "startRowIndex": 0, "endRowIndex": 3, "startColumnIndex": 10, "endColumnIndex": 12},
                "cell": {"userEnteredFormat": {"textFormat": {"bold": True}, "backgroundColor": {"red": 0.99, "green": 0.92, "blue": 0.6}}},
                "fields": "userEnteredFormat(textFormat,backgroundColor)",
            }},
            # 欄寬
            *[{"updateDimensionProperties": {
                "range": {"sheetId": 100, "dimension": "COLUMNS", "startIndex": i, "endIndex": i+1},
                "properties": {"pixelSize": w},
                "fields": "pixelSize",
            }} for i, w in enumerate([100, 70, 130, 100, 60, 80, 100, 90, 130, 130, 90, 90])],
            # 定價樣式
            {"updateSheetProperties": {
                "properties": {"sheetId": 101, "gridProperties": {"frozenRowCount": 1}},
                "fields": "gridProperties.frozenRowCount",
            }},
            {"repeatCell": {
                "range": {"sheetId": 101, "startRowIndex": 0, "endRowIndex": 1},
                "cell": {"userEnteredFormat": {"textFormat": {"bold": True}, "backgroundColor": {"red": 0.95, "green": 0.95, "blue": 0.95}}},
                "fields": "userEnteredFormat(textFormat,backgroundColor)",
            }},
        ]
    }).execute()
    print("[4/4] 樣式套用完成")

    print()
    print("=" * 60)
    print("完成!")
    print(f"  Sheet URL: {url}")
    print(f"  Sheet ID : {sid}")
    print("=" * 60)
    print()
    print("→ 下一步:")
    print(f"  1) 把 ONSITE_SHEET_ID 寫進 apps-script.gs")
    print(f"  2) 跑 push_code.py")
    print(f"  3) 在 Apps Script 編輯器重新部署 + 跑 syncAllToOnsite() 回填既有 65 筆")

    # 把 ID 存檔讓後續腳本用
    Path(__file__).parent.joinpath("onsite_deployment.json").write_text(
        json.dumps({"sheet_id": sid, "url": url}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
