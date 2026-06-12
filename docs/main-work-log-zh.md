# 主要工作日志摘要

记录日期：2026-06-11

这是 `docs/work-log.md` 的中文交付摘要。完整原始工程日志仍保留在 `docs/work-log.md`。

## 阶段 1：商业研究与方向选择

- 联网调研小企业 AI 采用、评价管理、销售自动化、本地服务商付费意愿和合规风险。
- 子代理分别从市场、产品、工程、安全、收入运营角度评估。
- 最终选择两个方向：BidFlow Local 和 ReputeLoop。

## 阶段 2：产品设计

- 定义两个产品的商业定位、目标客户、定价锚点和首批 paid pilot 路线。
- 明确“AI 起草 + 人工审核 + Stripe 付款证据 + 交付证据 + outcome ledger”的产品原则。
- 设计前端页面：Portfolio、BidFlow、ReputeLoop、Launch、Buy、Onboarding、Recovery、Legal。

## 阶段 3：核心开发

- 实现线索、评价、客户、销售 prospect、handoff、onboarding、revenue payment、pilot outcome 等核心类型。
- 实现 lead scoring、estimate/proposal generation、review response generation、recovery offer、sales outreach pack。
- 实现 API、CSV import、workspace persistence、JSON/Postgres repository、atomic update。

## 阶段 4：收款与交付闭环

- 实现 Stripe Checkout、Customer Portal、webhook 处理和 revenue ledger。
- 实现 prospect-specific checkout handoff 和 `/buy?handoff=<token>`。
- 实现 `payment_status=paid` 门槛，防止未付款 checkout 触发交付或收入。
- 实现 paid-pilot order form，锁定价格、范围、scope hash、付款入口和人工审核边界。
- 实现 onboarding、材料提交、首包生成、QA、发送、客户确认和 outcome ledger。

## 阶段 5：生产准备和风险收紧

- 生产环境禁用 full workspace overwrite/reset。
- scoped pilot 下默认禁用 broad public self-serve checkout。
- production doctor 区分 blocker 和 advisory。
- launch readiness、launch smoke、launch packet 帮助上线前检查。
- public token 路由增加轻量 rate limit。
- Webhook、public write、operator write 改用 atomic repository update。

## 阶段 6：文档与最终收敛

- 更新 README、产品手册、工作日志、launch runbook、revenue ops playbook。
- 新增最终交付说明中文/英文版。
- 新增 AI 自动化赚钱路径中文/英文版。
- 新增 16 小时工作记录中文/英文版。

## 最终验证

- `npm run lint` 通过。
- `npx tsc --noEmit --pretty false` 通过。
- `npm run build` 通过。
- `npm test -- --run --reporter=dot` 通过。
- 17 个测试文件、132 个测试通过。
