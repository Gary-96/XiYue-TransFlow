import ctypes
from builder.header import HeaderBuilder
from utils.dy_util import generate_webid, generate_msToken, splice_url, generate_a_bogus, generate_fake_webid


def _get_screen_resolution():
    """动态获取屏幕分辨率，避免硬编码
    优先使用 screeninfo，降级使用 ctypes（Windows 原生）
    """
    # 尝试使用 screeninfo
    try:
        import screeninfo
        monitors = screeninfo.get_monitors()
        if monitors:
            primary = max(monitors, key=lambda m: m.is_primary)
            return primary.width, primary.height
    except Exception:
        pass

    # Windows 原生 API
    try:
        user32 = ctypes.windll.user32
        # SM_CXSCREEN = 0, SM_CYSCREEN = 1
        width = user32.GetSystemMetrics(0)
        height = user32.GetSystemMetrics(1)
        if width > 0 and height > 0:
            return width, height
    except Exception:
        pass

    return 1920, 1080  # 默认值


class Params:
    def __init__(self):
        self.params = {}

    def with_platform(self):
        # 动态获取屏幕分辨率
        sw, sh = _get_screen_resolution()
        params = {
            'device_platform': 'webapp',
            'aid': '6383',
            'channel': 'channel_pc_web',
            'pc_client_type': '1',
            'update_version_code': '170400',
            'version_code': '170400',
            'version_name': '17.4.0',
            'cookie_enabled': 'true',
            'screen_width': str(sw),
            'screen_height': str(sh),
            'browser_language': 'zh-CN',
            'browser_platform': 'Win32',
            'browser_name': 'Edge',
            'browser_version': '125.0.0.0',
            'browser_online': 'true',
            'engine_name': 'Blink',
            'engine_version': '125.0.0.0',
            'os_name': 'Windows',
            'os_version': '10',
            'cpu_core_num': '32',
            'device_memory': '8',
            'platform': 'PC',
            'downlink': '10',
            'effective_type': '4g',
            'round_trip_time': '100',
        }
        self.params.update(params)
        return self

    def update_params(self, params):
        self.params.update(params)
        return self

    def with_web_id(self, auth=None, url="", fake=False):
        webid = generate_fake_webid() if fake else generate_webid(auth, url)
        self.params['webid'] = webid
        return self

    def with_a_bogus(self, data=None):
        query = splice_url(self.get())
        if data is not None:
            data = splice_url(data)
        else:
            data = ''
        abogus = generate_a_bogus(query, data)
        self.add_param('a_bogus', abogus)
        return self

    def with_ms_token(self):
        msToken = generate_msToken()
        self.params['msToken'] = msToken
        return self

    def add_param(self, key, value):
        self.params[key] = value
        return self

    def get(self):
        return self.params

    def sort(self):
        order = ['device_platform', 'aid', 'channel', 'publish_video_strategy_type', 'source', 'sec_user_id',
                 'personal_center_strategy', 'update_version_code', 'pc_client_type', 'version_code', 'version_name',
                 'cookie_enabled', 'screen_width', 'screen_height', 'browser_language', 'browser_platform',
                 'browser_name', 'browser_version', 'browser_online', 'engine_name', 'engine_version', 'os_name',
                 'os_version', 'cpu_core_num', 'device_memory', 'platform', 'downlink', 'effective_type',
                 'round_trip_time', 'webid', 'verifyFp', 'fp', 'msToken', 'a_bogus']
        # 按照 order 排序的字段
        sorted_params = {key: self.params[key] for key in order if key in self.params}
        # 不在 order 中的字段
        remaining_params = {key: self.params[key] for key in self.params if key not in order}
        # 合并两个字典
        sorted_params.update(remaining_params)
        self.params = sorted_params

    def toString(self):
        # 按url参数格式拼接参数
        return "&".join([f"{k}={v}" for k, v in self.params.items()])
