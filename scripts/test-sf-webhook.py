#!/usr/bin/env python3
"""本地或正式環境測試順豐 webhook。用法:
  python3 scripts/test-sf-webhook.py
  BACKEND_URL=https://kesh-backend-production.up.railway.app python3 scripts/test-sf-webhook.py
"""
import hashlib
import hmac
import json
import os
import urllib.request

BACKEND = os.environ.get(
    "BACKEND_URL", "https://kesh-backend-production.up.railway.app"
).rstrip("/")
SIGN_KEY = os.environ.get(
    "SF_ROUTE_SIGN_KEY",
    "c12df913b9d91948eae3ef4ed2a96aa6c025ce3d3cb6410a14ba862420a77ba4",
)
URL = f"{BACKEND}/sf-webhook"

BODY = json.dumps(
    {
        "mailNo": "TEST-WEBHOOK-001",
        "remark": "測試路由推送",
        "acceptTime": "2026-05-30 12:00:00",
    },
    ensure_ascii=False,
).encode("utf-8")

sign = hmac.new(SIGN_KEY.encode(), BODY, hashlib.sha256).hexdigest()


def post(headers: dict) -> None:
    req = urllib.request.Request(URL, data=BODY, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"HTTP {resp.status}")
            print(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}")
        print(e.read().decode())


print("=== 1. 無簽名（應回 code:1 / error，但 HTTP 200）===")
post({"Content-Type": "application/json; charset=UTF-8"})

print("\n=== 2. 帶 x-sf-signature（應回 code:0 / success）===")
post(
    {
        "Content-Type": "application/json; charset=UTF-8",
        "x-sf-signature": sign,
    }
)

print(f"\nWebhook URL: {URL}")
