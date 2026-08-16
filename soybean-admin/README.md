# LeMan Admin - 乐曼同传运营管理后台

> 乐曼同传 SaaS 商业运营管理后台 (LeeMan Translate Management System)

## 技术栈

- **Vue 3.5** + **TypeScript 6.0**
- **Vite 8** 构建工具
- **Naive UI** UI 框架
- **UnoCSS** 原子化 CSS
- **Pinia** 状态管理
- **Vue Router** 路由系统

## 功能模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 首页仪表盘 | `/home` | 运营数据概览、实时统计 |
| 用户管理 | `/user` | 终端设备、代理商管理、角色权限 |
| 卡密管理 | `/license` | 激活码、卡密分配与查询 |
| 订单管理 | `/order` | 交易记录、支付状态 |
| 翻译统计 | `/stats/translation` | 翻译量分析、平台分布 |
| 系统设置 | `/settings` | 系统配置、主题设置 |

## 代理分销模式

支持多级代理商体系：
- **超级管理员** (super): 全功能权限，管理所有代理商和设备
- **代理商** (agent): 查看推广设备，管理自有客户

## 项目结构

```
src/
├── api/              # API 接口层
├── components/       # 公共组件
├── layouts/          # 布局组件
│   └── modules/
│       ├── global-footer/    # 页脚版权
│       └── global-logo/      # 侧边栏 Logo
├── locales/          # 国际化 (zh-CN, en-US)
├── router/           # 路由配置
├── store/            # Pinia 状态管理
├── theme/            # 主题配置 (蓝色 #3b82f6)
└── views/            # 页面视图
```

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build
```

## 访问地址

- **开发环境**: http://localhost:9527
- **默认账号**: admin / 123456

## 品牌信息

- **中文品牌**: 乐曼同传
- **英文品牌**: LeeMan Translate / LeMan Admin
- **主题色**: #3b82f6 (蓝色)
- **版权**: Copyright © 2026 乐曼同传. All Rights Reserved.
