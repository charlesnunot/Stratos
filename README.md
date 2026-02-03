# Stratos Platform

一个集社交、电商、即时聊天于一体的综合平台，采用 Next.js 14 + Supabase 构建。

## 功能特性

- 🎨 **社交功能**: 帖子、点赞、评论、关注、话题、打赏
- 🛒 **电商功能**: 商品管理、购物车、订单系统、物流追踪
- 💬 **即时聊天**: 实时消息、群聊、客服系统
- 📢 **通知系统**: 实时通知、通知中心
- 👥 **订阅系统**: 卖家订阅、带货者订阅
- 🤝 **带货系统**: 带货中心、佣金计算
- 💳 **多支付方式**: Stripe、PayPal、支付宝、微信支付、银行转账
- 🚚 **物流系统**: 物流追踪、订单状态更新
- 🛡️ **审核系统**: 内容审核、商品审核
- 📊 **后台管理**: 用户管理、内容审核、举报处理
- 🎫 **客服系统**: 工单管理、客服聊天
- 🌍 **国际化**: 多语言支持

## 技术栈

- **前端**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **后端**: Supabase (PostgreSQL + Realtime + Storage + Auth)
- **UI组件**: shadcn/ui + Framer Motion
- **状态管理**: Zustand + React Query
- **实时通信**: Supabase Realtime Subscriptions

## 开始使用

1. 安装依赖:
```bash
npm install
```

2. 配置环境变量:
```bash
cp .env.example .env.local
# 编辑 .env.local 填入你的 Supabase 配置
```

3. 运行开发服务器:
```bash
npm run dev
```

4. 打开 [http://localhost:3000](http://localhost:3000)

## 项目结构

```
Stratos/
├── src/
│   ├── app/              # Next.js App Router
│   ├── components/       # React 组件
│   ├── lib/             # 工具函数和配置
│   ├── types/           # TypeScript 类型定义
│   └── store/           # Zustand 状态管理
├── supabase/
│   ├── migrations/      # 数据库迁移
│   └── functions/       # Edge Functions
└── public/              # 静态资源
```

## 开发计划

项目正在积极开发中，更多功能即将推出。

## 许可证

MIT
