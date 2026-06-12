# 产品手册摘要

记录日期：2026-06-11

## 产品组成

Local Growth OS 包含两个可赚钱产品：

- BidFlow Local：本地服务商线索评分、报价、提案、报价跟进、客户确认和收入恢复。
- ReputeLoop：评价风险识别、合规回复、客户挽回、恢复链接和口碑运营。

## 主要页面

- Portfolio：展示选择两个方向的依据。
- BidFlow：处理线索、报价、提案和报价恢复。
- ReputeLoop：处理评价风险、回复草稿和客户恢复。
- Launch：管理 prospect、销售活动、checkout handoff、订单表和收入指挥中心。
- Buy：客户通过 handoff 确认 scope 并进入 Stripe。
- Onboarding：客户提交材料，操作者交付首包。
- Recovery：客户审批、要求修改、要求回电或拒绝恢复方案。
- Legal：试点条款、隐私和退款政策页面。

## 核心 API

- `GET /api/health`
- `GET /api/plans`
- `POST /api/import/leads`
- `POST /api/import/reviews`
- `POST /api/import/prospects`
- `POST /api/sales-prospects/:prospectId/outreach-pack`
- `GET /api/sales-prospects/:prospectId/outreach-pack/download`
- `POST /api/sales-prospects/:prospectId/checkout-handoff`
- `GET /api/sales-prospects/:prospectId/checkout-handoff/order-form`
- `POST /api/public/checkout`
- `POST /api/billing/webhook`
- `GET /api/onboarding`
- `POST /api/public/onboarding/:token/submissions`
- `POST /api/onboarding/submissions/:submissionId/first-pack`
- `POST /api/onboarding/:recordId/outcomes`

## 收款与交付规则

- 生产环境默认只允许 scoped checkout handoff。
- 每个 handoff 带有冻结 scope、scope hash、推荐 plan 和过期时间。
- 订单表只使用 handoff scope 和 `server/plans.ts` 定价。
- 已支付、过期、取消或非活跃 handoff 不能导出付款订单表。
- 只有 Stripe webhook 确认 `payment_status=paid` 后，才会创建收入台账和 onboarding。
- 首包必须经过人工 QA 后才能视为交付证据。

## 运行命令

```bash
npm install
npm run dev
npm run api
npm run build
npm run start
npm run lint
npm test
```

## 生产检查命令

```bash
npm run doctor:production
npm run launch:readiness
npm run launch:smoke -- https://your-public-app.example
npm run launch:packet
npm run stripe:bootstrap
```
