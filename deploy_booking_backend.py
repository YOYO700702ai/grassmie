"""
一鍵部署草咩咩預約系統後端

流程:
  1. 建立新的 Google Sheet (草咩咩預約管理)
  2. 建立綁在這張 Sheet 上的 Apps Script 專案
  3. 推送 apps-script.gs 程式碼 + manifest (含 webapp 設定)
  4. 建立版本 + 部署為 Web App (任何人可存取,以你身分執行)
  5. 把部署 URL 寫進 booking.js 的 API_URL

token.json / credentials.json 重用:
  C:\\Users\\USER\\Desktop\\學員與課程管理\\token.json
"""

import os
import sys
import json
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

HERE = Path(__file__).parent
TOKEN_FILE = Path(r"C:\Users\USER\Desktop\學員與課程管理\token.json")
APPS_SCRIPT_FILE = HERE / "apps-script.gs"
BOOKING_JS = HERE / "booking.js"

SHEET_TITLE = "草咩咩預約管理"
SCRIPT_TITLE = "草咩咩預約後端"

MANIFEST = {
    "timeZone": "Asia/Taipei",
    "exceptionLogging": "STACKDRIVER",
    "runtimeVersion": "V8",
    "webapp": {
        "executeAs": "USER_DEPLOYING",
        "access": "ANYONE_ANONYMOUS",
    },
    "oauthScopes": [
        "https://www.googleapis.com/auth/spreadsheets.currentonly",
        "https://www.googleapis.com/auth/script.send_mail",
        "https://www.googleapis.com/auth/script.scriptapp",
    ],
}


def get_creds():
    creds = Credentials.from_authorized_user_file(str(TOKEN_FILE))
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds


def create_sheet(creds):
    sheets = build("sheets", "v4", credentials=creds)
    body = {
        "properties": {"title": SHEET_TITLE, "locale": "zh_TW", "timeZone": "Asia/Taipei"},
        "sheets": [{"properties": {"title": "Bookings"}}],
    }
    res = sheets.spreadsheets().create(body=body).execute()
    sid = res["spreadsheetId"]
    url = res["spreadsheetUrl"]
    print(f"[1/5] Sheet 建立: {url}")

    headers = [["id", "created_at", "theme_id", "theme_title",
                "date", "time", "people",
                "name", "phone", "email", "note", "status"]]
    sheets.spreadsheets().values().update(
        spreadsheetId=sid,
        range="Bookings!A1",
        valueInputOption="RAW",
        body={"values": headers},
    ).execute()
    sheets.spreadsheets().batchUpdate(spreadsheetId=sid, body={
        "requests": [{
            "repeatCell": {
                "range": {"sheetId": res["sheets"][0]["properties"]["sheetId"], "startRowIndex": 0, "endRowIndex": 1},
                "cell": {"userEnteredFormat": {"textFormat": {"bold": True}}},
                "fields": "userEnteredFormat.textFormat.bold",
            },
        }, {
            "updateSheetProperties": {
                "properties": {"sheetId": res["sheets"][0]["properties"]["sheetId"],
                               "gridProperties": {"frozenRowCount": 1}},
                "fields": "gridProperties.frozenRowCount",
            },
        }]
    }).execute()
    print("      標題列已寫入並凍結")
    return sid, url


def create_script(creds, parent_sheet_id):
    script = build("script", "v1", credentials=creds)
    res = script.projects().create(body={"title": SCRIPT_TITLE, "parentId": parent_sheet_id}).execute()
    sid = res["scriptId"]
    print(f"[2/5] Apps Script 專案建立 (script_id: {sid})")
    return sid, script


def push_code(script_service, script_id):
    code = APPS_SCRIPT_FILE.read_text(encoding="utf-8")
    body = {"files": [
        {"name": "Booking", "type": "SERVER_JS", "source": code},
        {"name": "appsscript", "type": "JSON", "source": json.dumps(MANIFEST, ensure_ascii=False)},
    ]}
    script_service.projects().updateContent(scriptId=script_id, body=body).execute()
    print("[3/5] 程式碼已推送")


def deploy_webapp(script_service, script_id):
    ver = script_service.projects().versions().create(
        scriptId=script_id,
        body={"description": "initial"},
    ).execute()
    version_number = ver["versionNumber"]
    print(f"[4/5] 版本 v{version_number} 建立")

    dep = script_service.projects().deployments().create(
        scriptId=script_id,
        body={"versionNumber": version_number,
              "manifestFileName": "appsscript",
              "description": "草咩咩預約系統 Web App"},
    ).execute()
    web_url = None
    for entry in dep.get("entryPoints", []):
        if entry.get("entryPointType") == "WEB_APP":
            web_url = entry["webApp"]["url"]
            break
    if not web_url:
        raise RuntimeError(f"部署成功但找不到 Web App URL: {json.dumps(dep, ensure_ascii=False)}")
    print(f"[5/5] Web App 部署完成: {web_url}")
    return web_url, dep["deploymentId"]


def write_url_to_booking_js(url):
    text = BOOKING_JS.read_text(encoding="utf-8")
    new = text.replace(
        'const API_URL = ""; // ← 貼上 Apps Script 部署後的 Web App URL',
        f'const API_URL = "{url}";',
        1,
    )
    if new == text:
        print("[!] booking.js 找不到 API_URL 預設行,請手動貼: " + url)
        return
    BOOKING_JS.write_text(new, encoding="utf-8")
    print(f"      booking.js 的 API_URL 已寫入")


def main():
    if not TOKEN_FILE.exists():
        print(f"[X] 找不到 token: {TOKEN_FILE}")
        sys.exit(1)
    if not APPS_SCRIPT_FILE.exists():
        print(f"[X] 找不到 apps-script.gs: {APPS_SCRIPT_FILE}")
        sys.exit(1)

    creds = get_creds()

    sheet_id, sheet_url = create_sheet(creds)
    script_id, script_service = create_script(creds, sheet_id)
    push_code(script_service, script_id)

    try:
        web_url, dep_id = deploy_webapp(script_service, script_id)
        write_url_to_booking_js(web_url)
        out = {
            "sheet_id": sheet_id,
            "sheet_url": sheet_url,
            "script_id": script_id,
            "script_url": f"https://script.google.com/d/{script_id}/edit",
            "deployment_id": dep_id,
            "web_app_url": web_url,
        }
        (HERE / "deployment.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print()
        print("=" * 60)
        print("完成!後端已部署,booking.js 已自動填入 API URL。")
        print(f"  Sheet:    {sheet_url}")
        print(f"  Script:   https://script.google.com/d/{script_id}/edit")
        print(f"  Web App:  {web_url}")
        print("=" * 60)
    except HttpError as e:
        print(f"[!] 部署為 Web App 失敗: {e}")
        print(f"    程式碼已推送,請手動到下列網址完成部署:")
        print(f"    https://script.google.com/d/{script_id}/edit")
        print(f"    [部署] → [新增部署] → 類型選 Web App → 任何人 → 部署")


if __name__ == "__main__":
    main()
