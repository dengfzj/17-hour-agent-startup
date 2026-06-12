# Local Growth OS 最终交付说明

记录日期：2026-06-11

## 结论

本项目已经收敛为两个可赚钱方向的本地产品系统：

- BidFlow Local：面向本地服务商的线索评分、报价/提案生成、报价后跟进、客户确认与付费试点交接。
- ReputeLoop：面向本地商家的评价风险识别、合规回复草稿、客户挽回、恢复链接与付费试点交接。

当前产品不是演示页，而是可本地运行、可测试、可部署到生产环境的产品代码库。它已经具备销售线索导入、人工销售包生成、范围确认、付费试点订单表、Stripe Checkout 集成边界、Webhook 收款证据、客户材料提交、首包交付、客户确认和续费证据台账。

真实世界部署、推广、客户联系、真实收款由你或后续 AI 执行。本次工作没有替你触达客户、投广告、配置真实 Stripe、部署公网或收取真实资金。

## 商业思路

### 为什么选这两个方向

小企业正在采用 AI，但真正愿意付钱的是能直接减少漏单、提升成交、保护本地口碑的流程。BidFlow Local 更靠近直接收入，适合先卖高客单服务商；ReputeLoop 更靠近信任和本地发现，适合做持续订阅。

### 推荐卖法

先卖 managed paid pilot，不要先卖完全自助 SaaS。

- BidFlow Growth：建议以 `$499 setup + $149/month` 作为首批付费试点锚点。
- ReputeLoop Growth：建议以 `$399 setup + $99/month` 作为首批付费试点锚点。

销售承诺应是“人工审核的收入工作流”，不是“AI 自动赚钱”。第一批客户要用范围明确、人工审核、Stripe 付款、首包交付、客户确认、结果台账的闭环来证明价值。

## 工作原理

1. 导入目标商家或客户数据。
2. 系统对线索、评价、商家适配度进行评分。
3. AI/规则引擎生成销售包、报价包、回复包、恢复方案。
4. 操作者人工审核范围、价格、外发内容和合规风险。
5. 对合格 prospect 创建 scoped checkout handoff。
6. 系统导出 Paid Pilot Order Form，记录价格、范围、scope hash、付款入口和人工审核边界。
7. 客户通过 `/buy?handoff=<token>` 确认范围、人工审核、条款、隐私和退款政策后进入 Stripe。
8. 只有 Stripe webhook 确认 `payment_status=paid` 后，系统才创建收入台账、付费 onboarding、handoff paid 状态和 prospect won 状态。
9. 客户通过 onboarding 链接提交材料。
10. 操作者预览、导入、生成首包、QA 审核、发送并记录客户确认。
11. outcome ledger 记录追回报价、赢单、回复批准、客户恢复、复购或节省时间等续费证据。

## 技术路线

前端：

- React / TypeScript / Vite
- Launch、BidFlow、ReputeLoop、Buy、Onboarding、Recovery、Legal 页面
- 前端 API 默认生产同源调用，支持 hosted auth Bearer token 注入

后端：

- Express API
- JSON workspace 本地持久化
- Postgres JSONB repository 生产桥接
- 关键写操作使用 repository atomic update，降低并发丢写风险
- Stripe Checkout、Customer Portal、Webhook adapter
- Postmark / SendGrid / Twilio adapter
- Google Business Profile import/reply adapter

核心证据链：

- `SalesProspect`
- `SalesOutreachPack`
- `SalesCheckoutHandoff`
- `RevenuePayment`
- `OnboardingRecord`
- `OnboardingSubmission`
- `PilotOutcome`
- `AuditLog`

核心安全边界：

- 生产环境禁用完整 workspace overwrite/reset。
- 生产公共 checkout 默认必须使用 scoped handoff token。
- 订单表只从冻结的 handoff scope 和 `server/plans.ts` 价格表生成。
- 非活跃、已支付、取消或过期 handoff 不生成付款订单表。
- unpaid Checkout completion 不激活订阅、不创建 onboarding、不记收入。
- 公开 token 路由有轻量 rate limit。
- email/SMS/Google 自动动作未配置和未授权前不承诺。

## 已完成的赚钱需求

BidFlow Local 已支持：

- 导入服务线索。
- 评分和下一步建议。
- 生成 estimate、proposal、follow-up。
- 导出 proposal Markdown。
- 生成客户 recovery link。
- prospect 队列、销售活动、scope handoff、订单表、付款证据、onboarding、首包交付和 outcome ledger。

ReputeLoop 已支持：

- 导入评价。
- 风险评分和状态分类。
- 生成合规回复、feedback case、recovery offer。
- 导出 recovery pack Markdown。
- 生成客户 recovery link。
- Google Business Profile adapter。
- prospect 队列、销售活动、scope handoff、订单表、付款证据、onboarding、首包交付和 outcome ledger。

## 当前不能由产品自动替你做的事

- 不能自动部署公网。
- 不能自动找真实客户并发送销售邮件。
- 不能自动收真实款。
- 不能自动创建真实 Stripe 产品、税务、门户和 webhook。
- 不能自动发布 Google 评价回复，除非客户批准且 OAuth/location 配置完成。
- 不能自动发送 email/SMS，除非 consent、发送域名/号码和 webhook 配置完成。
- 不能承诺保证赚钱、保证追回收入、保证评价恢复。

## 下一步真实世界投入指挥

1. 推送代码到代码托管平台。
2. 用 `render.yaml` 或等效平台部署 Node 服务和 Postgres。
3. 配置 `PUBLIC_API_BASE_URL`、`APP_ORIGIN`、`DATABASE_URL`、JWT、Stripe live key、Stripe webhook secret、`STRIPE_PRICE_*`。
4. 执行：

```bash
npm run doctor:production
npm run launch:readiness
npm run launch:smoke -- https://your-public-app.example
npm run launch:packet
```

5. 先不要打开 broad self-serve checkout，保持 `ENABLE_PUBLIC_SELF_SERVE_CHECKOUT=false`。
6. 用 `docs/examples/prospect-list-template.csv` 准备 50-200 个目标商家。
7. 先卖 BidFlow 给高客单本地服务商，再卖 ReputeLoop 给评价依赖型商家。
8. 每个 prospect 必须先写 scope，再创建 checkout handoff，再下载订单表。
9. 只有 Stripe webhook paid 后才开始交付。
10. 首包交付后让客户确认，并记录 outcome ledger。

## 主要文档

- `README.md`
- `docs/product-manual.md`
- `docs/work-log.md`
- `docs/16-hour-work-record.md`
- `docs/ai-automation-money-paths-zh.md`
- `docs/final-delivery-en.md`
