"""
喜阅 TransFlow · Douyin 签名器
职责：生成 a_bogus 签名参数。
"""
from __future__ import annotations

import logging
import os

import execjs

logger = logging.getLogger(__name__)

# JS 签名脚本路径
_JS_PATHS = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "static", "dy_ab.js"),
]


def _load_js_script(script_name: str = "dy_ab.js") -> str:
    """加载 JS 签名脚本"""
    for path in _JS_PATHS:
        js_path = os.path.join(path, script_name)
        if os.path.exists(js_path):
            with open(js_path, "r", encoding="utf-8") as f:
                return f.read()
    raise FileNotFoundError(f"JS signature script not found: {script_name}")


def generate_a_bogus(url: str, data: str = "") -> str:
    """
    生成 a_bogus 签名。
    
    Args:
        url: 请求 URL
        data: 请求数据
    
    Returns:
        a_bogus 签名字符串
    
    Raises:
        RuntimeError: 签名生成失败
    """
    js_code = _load_js_script("dy_ab.js")
    ctx = execjs.compile(js_code)
    result = ctx.call("get_ab", url, data or "")
    if not result:
        raise RuntimeError("a_bogus generation failed: empty result from JavaScript")
    return result

