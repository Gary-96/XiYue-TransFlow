"""
喜阅 TransFlow · Douyin Auth 单元测试
职责：测试认证数据模型，无需真实 Cookie。
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.collectors.douyin.models import AuthConfig


class TestDouyinAuth:
    """Douyin Auth 测试"""

    def test_auth_config_default(self):
        """测试 AuthConfig 默认值"""
        auth = AuthConfig()
        assert auth.cookie == {}
        assert auth.cookie_str == ""
        assert auth.msToken == ""
        assert auth.uid is None

    def test_auth_config_with_values(self):
        """测试 AuthConfig 带值初始化"""
        auth = AuthConfig(
            cookie={"sessionid": "test123"},
            cookie_str="sessionid=test123",
            msToken="test_token",
            uid="12345"
        )
        assert auth.cookie["sessionid"] == "test123"
        assert auth.cookie_str == "sessionid=test123"
        assert auth.msToken == "test_token"
        assert auth.uid == "12345"

    def test_auth_config_importable(self):
        """测试模块可导入"""
        from app.collectors.douyin import models
        assert hasattr(models, 'AuthConfig')

