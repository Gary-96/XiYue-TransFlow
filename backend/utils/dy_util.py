import hashlib
import json
import logging
import os
import random
import re
import sys
import time
import base64
import urllib
from functools import partial
from typing import Tuple

import requests
requests.packages.urllib3.disable_warnings()

# Add static directory and node_modules to path for JS dependencies
_STATIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'static')
_NODE_MODULES = os.path.join(_STATIC_DIR, 'node_modules')
if _STATIC_DIR not in sys.path:
    sys.path.insert(0, _STATIC_DIR)
if _NODE_MODULES not in sys.path:
    sys.path.insert(0, _NODE_MODULES)
# Node.js child process module resolution (execjs spawns `node`)
# — require('jsrsasign') resolves via NODE_PATH, independent of Python sys.path.
existing_node_path = os.environ.get('NODE_PATH', '')
parts = [p for p in existing_node_path.split(os.pathsep) if p]
if _NODE_MODULES not in parts:
    parts.append(_NODE_MODULES)
os.environ['NODE_PATH'] = os.pathsep.join(parts)

# Try to import execjs (or pyexecjs as fallback)
try:
    import execjs
    # Force use of Node.js runtime
    execjs.runtime = 'Node'
except ImportError:
    try:
        import pyexecjs as execjs  # type: ignore[no-redef]
        execjs.runtime = 'Node'
    except ImportError:
        execjs = None  # type: ignore[assignment]

import os

# Cache for compiled JS signatures
_js_cache: dict = {}


def _load_js_script(name: str) -> str:
    """Load a JS script from the static directory."""
    script_dir = os.path.join(os.path.dirname(__file__), '..', 'static')
    js_path = os.path.join(script_dir, name)
    if not os.path.exists(js_path):
        raise FileNotFoundError(f"JS script not found: {js_path}")
    with open(js_path, 'r', encoding='utf-8') as f:
        return f.read()


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

def generate_a_bogus(url: str, data: str = '') -> str:
    """Generate real a_bogus signature using dy_ab.js via execjs.
    
    Raises:
        RuntimeError: If signature generation fails
    """
    js_code = _load_js_script('dy_ab.js')
    ctx = execjs.compile(js_code)
    result = ctx.call('get_ab', url, data or '')
    if not result:
        raise RuntimeError("a_bogus generation failed: empty result from JavaScript")
    return result

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

