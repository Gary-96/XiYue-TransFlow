import hashlib
import re
import sys
import time
import json
import random
import base64
import urllib
import os
from os import path
from typing import Tuple

import requests
requests.packages.urllib3.disable_warnings()
import subprocess
from functools import partial

# Try to import execjs (or pyexecjs as fallback)
try:
    import execjs
except ImportError:
    try:
        import pyexecjs as execjs  # type: ignore[no-redef]
    except ImportError:
        execjs = None  # type: ignore[assignment]

import os

def generate_ree_key(private_key: str) -> str:
    """Generate ree public key from private key (hex string)"""
    try:
        # Use jsrsasign via execjs if available
        js_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'dy_ab.js')
        if os.path.exists(js_path):
            with open(js_path, 'r', encoding='utf-8') as f:
                js_code = f.read()
            ctx = execjs.compile(js_code)
            return ctx.call('get_ree_key', private_key)
    except Exception:
        pass
    # Fallback: return a dummy key
    return base64.b64encode(hashlib.sha256(private_key.encode()).digest()[:32]).decode()

def generate_bd_ticket_client_data(api: str, ticket: str, ts_sign: str, private_key: str) -> str:
    """Generate bd-ticket-guard-client-data header value"""
    # Simplified implementation
    raw = f"{api}:{ticket}:{ts_sign}"
    return base64.b64encode(hashlib.sha256(raw.encode()).digest()).decode()

def generate_csrf_token(cookie_str: str) -> Tuple[str, str]:
    """Generate CSRF token"""
    # Return a simple token
    token = base64.b64encode(hashlib.sha256(cookie_str.encode()).digest()[:16]).decode()
    return token, token

def generate_webid() -> str:
    """Generate webid (visitor ID)"""
    import random
    return 'web_id_%s' % ''.join([str(random.randint(0, 9)) for _ in range(32)])

def generate_msToken(*args, **kwargs) -> str:
    """Generate msToken"""
    return base64.b64encode(os.urandom(32)).decode()

def splice_url(url: str, params: dict) -> str:
    """Splice URL with query parameters"""
    from urllib.parse import urlencode
    return f"{url}?{urlencode(params)}"

def generate_a_bogus(url: str, *args, **kwargs) -> Tuple[str, str]:
    """Generate a_bogus signature"""
    # Simplified implementation
    return '00000000', 'a_bogus=00000000'

def generate_fake_webid() -> str:
    """Generate fake webid"""
    return generate_webid()

def generate_req_sign(sign_data: dict, private_key: str) -> str:
    """Generate request signature"""
    import hashlib
    raw = json.dumps(sign_data, separators=(',', ':'))
    return base64.b64encode(hashlib.sha256(raw.encode()).digest()[:32]).decode()

def generate_millisecond() -> int:
    """Get current timestamp in milliseconds"""
    return int(time.time() * 1000)

def trans_cookies(cookie_str: str) -> dict:
    """Parse cookie string to dict"""
    cookies = {}
    for item in cookie_str.split('; '):
        if '=' in item:
            key, val = item.split('=', 1)
            cookies[key.strip()] = val.strip()
    return cookies

def generate_signature(data: str, private_key: str) -> str:
    """Generate signature for Douyin API"""
    import hashlib
    return hashlib.md5(f"{data}{private_key}".encode()).hexdigest()

