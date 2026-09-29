# Douyin Parser Fixtures

本目录包含用于测试 DouyinParser 的合成数据。

## 标记说明

所有文件均为 **synthetic fixture**（合成数据），不是从真实抖音服务器抓取的。

用途：
- 测试 Protobuf 解析逻辑
- 测试异常处理
- 测试边界条件

## 文件结构

```
fixtures/
├── comment/      # 评论消息测试数据
├── gift/         # 礼物消息测试数据
├── like/         # 点赞消息测试数据
├── member/       # 成员加入消息测试数据
├── social/       # 关注消息测试数据
└── malformed/    # 损坏数据测试
```

## 使用说明

在测试中直接构造期望的 dict 结构，无需加载二进制文件。

示例：
```python
from app.collectors.douyin.parser import DouyinParser

parser = DouyinParser()
# 由于没有真实 protobuf 二进制数据，使用 mock 数据测试
expected = {
    "type": "comment",
    "user": "test_user",
    "text": "Hello",
}
```

## 真实 Fixture 获取

要获取真实 PushFrame 二进制数据，需要：
1. 使用浏览器开发者工具抓取 WebSocket 流量
2. 或运行真实连接测试并保存原始消息

**当前状态**: REAL_PUSHFRAME_FIXTURE: NOT_AVAILABLE
