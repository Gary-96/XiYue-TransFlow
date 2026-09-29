"""
喜阅 TransFlow · Douyin 异常体系单元测试
职责：测试异常类的结构和行为。
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.collectors.douyin.exceptions import (
    DouyinCollectorError,
    DouyinConnectionError,
    DouyinConnectionRejectedError,
    DouyinAuthenticationError,
    DouyinProtocolError,
    DouyinParseError,
    DouyinSignatureError,
)


class TestDouyinExceptions:
    """Douyin 异常体系测试"""

    def test_base_exception(self):
        """测试基础异常"""
        exc = DouyinCollectorError("Test error")
        assert str(exc) == "Test error"
        assert exc.platform == "douyin"
        assert exc.identifier == ""

    def test_connection_error(self):
        """测试连接错误"""
        exc = DouyinConnectionError("Connection failed", status_code=404)
        assert exc.status_code == 404
        assert exc.handshake_message == ""

    def test_connection_rejected_error(self):
        """测试连接被拒绝（DEVICE_BLOCKED）"""
        exc = DouyinConnectionRejectedError(
            status_code=415,
            handshake_message="DEVICE_BLOCKED",
            identifier="644882972280",
        )
        assert exc.status_code == 415
        assert exc.handshake_message == "DEVICE_BLOCKED"
        assert exc.identifier == "644882972280"
        assert "DEVICE_BLOCKED" in str(exc)

    def test_authentication_error(self):
        """测试认证错误"""
        exc = DouyinAuthenticationError("Invalid cookie")
        assert "Invalid cookie" in str(exc)

    def test_parse_error(self):
        """测试解析错误"""
        exc = DouyinParseError("Failed to parse protobuf")
        assert "Failed to parse protobuf" in str(exc)

    def test_signature_error(self):
        """测试签名错误"""
        exc = DouyinSignatureError("a_bogus generation failed")
        assert "a_bogus generation failed" in str(exc)

    def test_exception_hierarchy(self):
        """测试异常继承关系"""
        # DouyinConnectionRejectedError 应该是 DouyinConnectionError 的子类
        assert issubclass(DouyinConnectionRejectedError, DouyinConnectionError)
        assert issubclass(DouyinConnectionError, DouyinCollectorError)
        
        # DouyinParseError 应该是 DouyinProtocolError 的子类
        assert issubclass(DouyinParseError, DouyinProtocolError)
        assert issubclass(DouyinProtocolError, DouyinCollectorError)

