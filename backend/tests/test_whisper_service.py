"""
喜阅 TransFlow — Whisper 服务测试套件
使用标准库 unittest
"""
import unittest
from unittest.mock import patch, MagicMock


class TestDependencyCheck(unittest.TestCase):
    """测试依赖检查逻辑"""

    def test_check_dependencies_all_ok(self):
        """所有依赖都正常时，返回 True"""
        from app.services.whisper_service import _check_dependencies

        with patch("builtins.__import__", side_effect=lambda name, *args, **kwargs: MagicMock()):
            ok, msg = _check_dependencies()
            self.assertTrue(ok)
            self.assertEqual(msg, "")


class TestWhisperService(unittest.TestCase):
    """测试 WhisperService 类"""

    def test_get_dependency_status(self):
        """获取依赖状态"""
        from app.services.whisper_service import WhisperService

        status = WhisperService.get_dependency_status()
        self.assertIsInstance(status, dict)
        self.assertIn("dependencies_ok", status)
        self.assertIn("model_loaded", status)
        self.assertIn("message", status)


class TestModelLoaded(unittest.TestCase):
    """测试模块级变量"""

    def test_model_loaded_type(self):
        """验证 _model_loaded 是布尔类型"""
        from app.services.whisper_service import _model_loaded
        self.assertIsInstance(_model_loaded, bool)


if __name__ == "__main__":
    unittest.main()

