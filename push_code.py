"""推送 apps-script.gs 到既有的 Apps Script 專案。"""
import json, sys
from pathlib import Path

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

HERE = Path(__file__).parent
TOKEN = Path(r"C:\Users\USER\Desktop\學員與課程管理\token.json")
SCRIPT_ID = "1SO5TymfkeAoFY-vRatEHbLhAUQZbBT3uq8au1ZKnb98g3dx370t6MwPf"

MANIFEST = {
    "timeZone": "Asia/Taipei",
    "exceptionLogging": "STACKDRIVER",
    "runtimeVersion": "V8",
    "webapp": {"executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS"},
    "oauthScopes": [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/script.send_mail",
        "https://www.googleapis.com/auth/script.scriptapp",
        "https://www.googleapis.com/auth/script.external_request",
    ],
}

creds = Credentials.from_authorized_user_file(str(TOKEN))
if creds.expired and creds.refresh_token:
    creds.refresh(Request())

script = build("script", "v1", credentials=creds)
code = (HERE / "apps-script.gs").read_text(encoding="utf-8")
script.projects().updateContent(scriptId=SCRIPT_ID, body={"files": [
    {"name": "Booking", "type": "SERVER_JS", "source": code},
    {"name": "appsscript", "type": "JSON", "source": json.dumps(MANIFEST, ensure_ascii=False)},
]}).execute()
print(f"[OK] 程式碼已推送 (script_id: {SCRIPT_ID})")
print("→ 請到 https://script.google.com/d/" + SCRIPT_ID + "/edit")
print("  右上「部署 → 管理部署作業 → 編輯(鉛筆) → 版本選『新版本』 → 部署」")
print("  URL 不會變,只是把線上版本更新到最新程式碼。")
