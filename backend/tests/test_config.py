"""
喜阅 TransFlow — 配置模块测试套件
使用标准库 unittest，无需第三方依赖
"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock


class TestKeyManager(unittest.TestCase):
    """测试 KeyManager 类"""

    def test_get_api_key(self):
        from config.keys import KeyManager
        km = KeyManager({"gemini": "test-key"})
        self.assertEqual(km.get_api_key("gemini"), "test-key")
        self.assertEqual(km.get_api_key("unknown"), "")

    def test_get_safe_key(self):
        from config.keys import KeyManager
        km = KeyManager({"gemini": "test-gemini-key-12345"})
        safe = km.get_safe_key("gemini")
        self.assertTrue(safe.startswith("test"))
        self.assertTrue(safe.endswith("345"))
        self.assertIn("****", safe)

    def test_has_key(self):
        from config.keys import KeyManager
        km = KeyManager({"gemini": "key", "groq": ""})
        self.assertTrue(km.has_key("gemini"))
        self.assertFalse(km.has_key("groq"))

    def test_set_and_clear_key(self):
        from config.keys import KeyManager
        km = KeyManager({})
        self.assertTrue(km.set_key("gemini", "new-key"))
        self.assertEqual(km.get_api_key("gemini"), "new-key")
        self.assertTrue(km.clear_key("gemini"))
        self.assertEqual(km.get_api_key("gemini"), "")


class TestAudioConfig(unittest.TestCase):
    """测试 AudioConfig 类"""

    def test_get_device(self):
        from config.audio import AudioConfig
        ac = AudioConfig({"mic_input": 1, "translation_output": 2})
        self.assertEqual(ac.get_device("mic_input"), 1)
        self.assertIsNone(ac.get_device("unknown"))

    def test_set_device(self):
        from config.audio import AudioConfig
        ac = AudioConfig({})
        self.assertTrue(ac.set_device("mic_input", 5))
        self.assertEqual(ac.get_mic_input(), 5)

    def test_invalid_device_key(self):
        from config.audio import AudioConfig
        ac = AudioConfig({})
        self.assertFalse(ac.set_device("invalid", 1))

    def test_get_all_devices(self):
        from config.audio import AudioConfig
        ac = AudioConfig({"mic_input": 1, "remote_input": 3})
        devices = ac.get_all_devices()
        self.assertEqual(devices["mic_input"], 1)
        self.assertEqual(devices["remote_input"], 3)


class TestLocalLLMConfig(unittest.TestCase):
    """测试 LocalLLMConfig 类"""

    def test_get_backend(self):
        from config.local_llm import LocalLLMConfig
        cfg = LocalLLMConfig({"local_backend": "ollama"})
        self.assertEqual(cfg.get_backend(), "ollama")
        self.assertTrue(cfg.is_ollama())
        self.assertFalse(cfg.is_cuda())

    def test_set_backend(self):
        from config.local_llm import LocalLLMConfig
        cfg = LocalLLMConfig({"local_backend": "ollama"})
        self.assertTrue(cfg.set_backend("cuda"))
        self.assertTrue(cfg.is_cuda())

    def test_invalid_backend(self):
        from config.local_llm import LocalLLMConfig
        cfg = LocalLLMConfig({})
        self.assertFalse(cfg.set_backend("invalid"))


class TestConfigLoading(unittest.TestCase):
    """测试配置加载"""

    def test_load_config_with_valid_file(self):
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from config.base import load_config

        config = {
            "current_provider": "gemini",
            "keys": {"gemini": "test-key"},
            "mode": "auto",
        }
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write(json.dumps(config))
            temp_path = Path(f.name)

        try:
            with patch("config.base.CONFIG_PATH", temp_path):
                loaded = load_config()
                self.assertEqual(loaded["current_provider"], "gemini")
                self.assertEqual(loaded["mode"], "auto")
        finally:
            temp_path.unlink(missing_ok=True)

    def test_load_config_missing_file(self):
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from config.base import load_config, DEFAULT_CONFIG

        missing_path = Path("/tmp/nonexistent_config_xyz.json")
        missing_path.unlink(missing_ok=True)

        with patch("config.base.CONFIG_PATH", missing_path):
            loaded = load_config()
            self.assertEqual(loaded, DEFAULT_CONFIG)


class TestConfigIntegration(unittest.TestCase):
    """测试配置集成"""

    def test_audio_config_integration(self):
        from config.audio import AudioConfig
        ac = AudioConfig({"mic_input": 2, "translation_output": 3})
        self.assertEqual(ac.get_mic_input(), 2)
        self.assertEqual(ac.get_translation_output(), 3)

    def test_key_manager_integration(self):
        from config.keys import KeyManager
        km = KeyManager({"deepseek": "sk-123456"})
        self.assertTrue(km.has_key("deepseek"))
        self.assertEqual(km.get_api_key("deepseek"), "sk-123456")

    def test_local_llm_config_integration(self):
        from config.local_llm import LocalLLMConfig
        cfg = LocalLLMConfig({"local_backend": "ollama", "local_model_dir": "/models"})
        self.assertTrue(cfg.is_ollama())
        self.assertEqual(cfg.get_model_dir(), "/models")


if __name__ == "__main__":
    unittest.main()

