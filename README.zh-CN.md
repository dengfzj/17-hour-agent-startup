# Local Growth OS：一次 17 小时 AI 自主商业开发实验

语言：**中文** | [English](./README.en.md)

> 我给 Codex / GPT-5.5 一个开放任务：
>
> “开启子代理，联网调研市场，选择两个能赚钱的项目，设计产品，开发、测试，直到形成可交付产品，不要 demo。”
>
> 然后它连续跑了大约 17 小时。
>
> 我主要做的事情不是写代码，而是观察、刹车、纠偏、验收和保留现场。光是让它停下来、收敛范围、不要继续膨胀，就用了大约 1 小时。

这个仓库是这次实验的原始产物。

我没有重新包装成一个漂亮的商业项目，也没有把它改造成一个正式创业产品。它更像是一个样本：当你让一个高级 AI 编程代理尽可能自主地做“商业调研 + 产品选择 + 工程实现 + 测试 + 文档 + 上线方案”时，它会产出什么。

## 这个实验是什么

这是一次关于 AI Agent 自主工作能力的实验。

我给它的目标大致是：

- 联网检索最新趋势和资料；
- 启动多个子代理做商业调研；
- 让另一批子代理做评估、审核和反驳；
- 从多个方向里选出 2 个更可能赚钱的项目；
- 设计产品；
- 开发前端、后端、数据模型和业务流程；
- 增加测试、文档、工作日志和最终交付说明；
- 给出真实世界投入赚钱的下一步方案；
- 不要只做 demo，要尽量做成可以走向真实付费试点的产品。

最后 AI 把项目收敛成了一个叫 **Local Growth OS** 的系统。

它不是一个单一小工具，而是一个面向本地商家的增长工作台，里面包含两个产品方向：

1. **BidFlow Local**
   面向本地服务商，处理线索评分、报价、提案、报价跟进、客户确认和付费试点交接。
2. **ReputeLoop**
   面向依赖评价和口碑的本地商家，处理评价风险识别、合规回复草稿、客户挽回、恢复链接和付费试点交接。

## 为什么开源

我把它直接开源，是因为我觉得它作为“AI 自主开发实验现场”比作为“商业 SaaS 成品”更有价值。

它可以让大家看到几个问题：

- AI 真的能连续做很长任务吗？
- AI 会如何拆解“赚钱项目”这种模糊目标？
- 它会选择什么市场？
- 它会怎么组织子代理？
- 它会不会无限扩大范围？
- 它能不能自己做产品、写代码、写测试、写文档？
- 人类在这个过程中到底需要做什么？
- “AI 自主创业”到底离现实有多远？

我的观察是：AI 很擅长快速扩展、组合、实现和写文档。但它也非常容易范围膨胀、过度工程化、把“产品形态”误当成“商业验证”。真正困难的部分仍然是：真实客户、真实销售、真实收款、真实交付和真实合规责任。

所以这个项目的价值不是“它已经帮我赚钱了”，而是“它完整记录了一次 AI 尝试构建赚钱系统的过程”。

## 项目产物

AI 最终产出了：

- React / TypeScript / Vite 前端；
- Express API；
- 本地 JSON workspace；
- Postgres JSONB 持久化桥接；
- BidFlow Local 工作流；
- ReputeLoop 工作流；
- Launch 页面；
- Buy 页面；
- Onboarding 页面；
- Recovery 页面；
- Legal 页面；
- Stripe Checkout / Webhook 相关边界；
- 订单表；
- 交付证据；
- 收入台账；
- 客户结果台账；
- 生产检查命令；
- Launch runbook；
- 中英文交付文档；
- 工作日志和审计说明。

文档中记录的最终质量门禁包括：

```bash
npm run lint
npx tsc --noEmit --pretty false
npm run build
npm test -- --run --reporter=dot
```

文档中记录的最终测试结果是：

- 17 个测试文件通过；
- 132 个测试通过。

## 它没有做什么

这个项目没有完成真实商业运营。

AI 没有：

- 部署公网；
- 配置真实 Stripe；
- 创建真实 Stripe 产品、价格或 webhook；
- 联系真实客户；
- 发送真实销售邮件；
- 投放广告；
- 收取真实付款；
- 修改真实 Google Business Profile；
- 发布真实评价回复；
- 完成真实客户交付。

所有客户、付款、webhook 和 provider 行为都停留在本地代码、测试、mock、fixture 或文档层。

所以请不要把它理解为“AI 已经自动创业成功”。更准确的理解是：

> AI 在 17 小时左右，生成了一个看起来可以进入付费试点阶段的商业产品工作台。

## 这个项目最有意思的地方

我认为最值得看的不是某一个页面，也不是某一个功能，而是它的整体结构：

```text
商业调研
  ↓
方向选择
  ↓
产品定义
  ↓
工程实现
  ↓
销售流程
  ↓
付款 handoff
  ↓
客户 onboarding
  ↓
首包交付
  ↓
结果记录
  ↓
续费证据
```

它没有只停留在“做个页面”。它试图把“从找客户到交付结果”的整个商业链条都结构化。

这也是它有趣的地方：AI 没有只写一个应用，而是在尝试搭一个小型公司的业务操作系统。

## 两个 AI 选择的赚钱方向

### BidFlow Local

目标用户：本地服务商。

典型问题：

- 客户来了但响应慢；
- 报价后没有跟进；
- 提案不清楚；
- 老板忘记二次触达；
- 高价值线索流失。

AI 设计的解决方案：

- 线索导入；
- 线索评分；
- estimate / proposal 生成；
- follow-up 建议；
- recovery link；
- 付费试点 handoff；
- onboarding；
- 首包交付；
- outcome ledger。

### ReputeLoop

目标用户：依赖评价和本地口碑的商家。

典型问题：

- 差评没有及时处理；
- 评价回复不专业；
- 客户流失没有恢复流程；
- 不知道哪些评价有风险；
- 本地口碑影响转化。

AI 设计的解决方案：

- 评价导入；
- 风险评分；
- 合规回复草稿；
- feedback case；
- recovery offer；
- Google Business Profile adapter；
- recovery link；
- onboarding；
- 首包交付；
- outcome ledger。

## 技术栈

- 前端：React 19、Vite、TypeScript、Zustand、Dexie、Recharts、Lucide React
- 后端：Node.js、Express 5、TypeScript、Zod、Jose、Stripe、pg
- 测试与质量：Vitest、Testing Library、Supertest、ESLint、Playwright

## 运行方式

要求：

- Node.js 20.19+、22.12+ 或 24+
- npm

安装依赖：

```bash
npm install
```

同时启动前端和 API：

```bash
npm run dev:full
```

也可以分别启动：

```bash
npm run dev
npm run api
```

前端默认地址：

```text
http://127.0.0.1:5173
```

API 默认地址：

```text
http://127.0.0.1:8787
```

生产风格单服务运行：

```bash
npm run build
npm run start
```

## 环境变量

复制示例文件并按需配置：

```bash
cp .env.example .env
```

本地开发可直接使用默认 JSON workspace。真实试点或部署前，请逐步配置 `PUBLIC_API_BASE_URL`、`APP_ORIGIN`、`DATABASE_URL`、生产 JWT、Stripe live key、Stripe webhook secret 和 `STRIPE_PRICE_*`。只有当你真的承诺自动邮件、短信或 Google 评价能力时，再配置对应 provider 变量。

## 质量检查

```bash
npm run lint
npm test
npm run build
npm run doctor:production
npm run launch:readiness
npm run launch:smoke -- https://your-public-app.example
npm run launch:packet
npm run stripe:bootstrap
```

注意：这些命令通过，并不等于项目已经真实赚钱。它只说明项目在工程层面更接近“可部署、可试点”的状态。

## 文档

- [产品手册](./docs/product-manual-zh.md)
- [真实上线计划](./docs/real-world-launch-plan-zh.md)
- [启动 Runbook](./docs/launch-runbook-zh.md)
- [收入运营 Playbook](./docs/revenue-ops-playbook-zh.md)
- [研究与选择备忘录](./docs/research-and-selection-zh.md)
- [数据库结构](./docs/database-schema-zh.md)
- [最终交付简报](./docs/final-delivery-zh.md)
- [文档索引](./docs/documentation-index-zh.md)

英文文档也保留在 `docs/*-en.md`。

## 开源说明

这个仓库按实验产物原样开放。

你可以把它当作：

- AI Agent 长任务样本；
- AI 自主产品开发案例；
- AI 商业调研和工程实现样本；
- 本地商家增长 SaaS 的半成品；
- 人机协作开发流程研究材料；
- Codex / GPT-5.5 长时间自主工作的观察样本。

你不应该直接把它当作：

- 已验证商业模式；
- 已经赚钱的产品；
- 可直接公开售卖的成熟 SaaS；
- 已完成合规审查的营销自动化系统；
- 可以无人值守运营的 AI 公司。

## 重要提醒

如果你要基于这个项目继续开发或部署，请先检查：

- `.env` 和密钥是否清理干净；
- Stripe 是否使用 live mode；
- webhook 是否真实可用；
- JWT / Auth 是否生产可用；
- Postgres 是否配置；
- 邮件、短信、Google Business Profile 是否有真实授权；
- 法律条款、隐私政策、退款政策是否适合你的地区；
- 是否存在测试数据、mock 数据、私人 token 或不该公开的信息。

## 合规边界

- 不生成虚假评价。
- 不只向满意客户发送评价请求。
- 不用折扣、退款或好处交换正面评价。
- 高风险公开回复必须经人工审核。
- 未取得同意和退订处理能力前，不发送短信或邮件营销。
- 公开 token 链接只用于客户安全视图，生产多实例部署应接入边缘/WAF/Redis 级限流。

## 我的结论

这次实验让我更清楚地看到：AI 已经可以长时间承担非常多“产品经理 + 研究员 + 工程师 + 文档员 + QA”的工作。但 AI 还不能替代真实商业里的责任主体。

它能帮你把一个模糊想法快速推到“像一个产品”的状态。但它不能自动替你完成市场验证、客户信任、真实收款、法律责任和持续运营。

这个仓库就是这条边界的一次现场记录。

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。
