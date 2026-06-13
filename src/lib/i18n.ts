import { useEffect } from 'react'

export type UiLanguage = 'en' | 'zh'

export const languageStorageKey = 'local-growth-os-language'

type PatternTranslation = {
  pattern: RegExp
  translate: (...matches: string[]) => string
}

const zhTranslations: Record<string, string> = {
  'Local Growth OS': '本地增长操作系统',
  'Product views': '产品视图',
  Portfolio: '产品组合',
  BidFlow: '报价流',
  ReputeLoop: '口碑闭环',
  Onboarding: '入驻',
  Launch: '发布',
  'Commercial Guardrails': '商业护栏',
  'Human approval remains required for binding quotes, public review replies, SMS sends, and recovery offers.':
    '具有约束力的报价、公开评价回复、短信发送和挽回优惠仍需人工审批。',
  'Revenue operations cockpit': '收入运营驾驶舱',
  'Business metrics': '业务指标',
  'Open pipeline': '进行中的商机',
  'Quoted value': '已报价金额',
  'Review risk queue': '评价风险队列',
  'Campaign upside': '活动增收潜力',
  'Export workspace JSON': '导出工作区 JSON',
  'Reset sample workspace': '重置示例工作区',
  'Switch to Chinese': '切换到中文',
  'Switch to English': '切换到英文',

  'Selection memo': '选择备忘录',
  'Two products chosen for immediate paid pilots': '两个适合立即付费试点的产品',
  'The portfolio favors narrow B2B workflows with measurable revenue impact, low compliance exposure, and fast owner-led sales cycles.':
    '产品组合优先选择范围清晰、收入影响可衡量、合规暴露低、且业主主导销售周期较短的 B2B 工作流。',
  Target: '目标客户',
  'Price anchor': '价格锚点',
  Market: '市场',
  Payment: '付费意愿',
  Build: '构建难度',
  Compliance: '合规',
  Rejected: '已拒绝',
  'Directions deliberately avoided': '刻意避开的方向',
  Evidence: '证据',
  'Research sources': '研究来源',
  Traceability: '可追溯性',
  'Working log': '工作日志',
  'Generic AI writing tools: weak switching cost and platform feature risk.':
    '通用 AI 写作工具：切换成本弱，且容易被平台功能替代。',
  'Medical, legal, tax, hiring, credit, or insurance decision automation: high liability and compliance load.':
    '医疗、法律、税务、招聘、信贷或保险决策自动化：责任与合规负担过高。',
  'Fake review generation, review gating, or paid positive reviews: directly conflicts with FTC enforcement.':
    '生成虚假评价、筛选评价或付费好评：直接冲突 FTC 执法要求。',
  'Crypto trading signals or return-promise products: trust cost and regulatory risk are too high for this build.':
    '加密交易信号或收益承诺类产品：信任成本和监管风险过高。',

  'BidFlow Local': '本地报价流',
  'Turn service requests into approved work': '把服务请求转化为已批准订单',
  'Score the lead, draft an estimate, produce a proposal, and schedule follow-up before the customer cools down.':
    '在客户热度下降前，对线索评分、起草估价、生成方案并安排跟进。',
  'Pipeline value': '商机金额',
  'Won value': '成交金额',
  'Avg. deal target': '平均订单目标',
  'Monthly lead goal': '月线索目标',
  'Lead queue': '线索队列',
  'Prioritized opportunities': '优先商机',
  'No lead': '无线索',
  Hot: '热门',
  Qualified: '合格',
  Nurture: '培育',
  Verify: '待核验',
  'Hot lead': '热门线索',
  'Qualified lead': '合格线索',
  'Nurture lead': '培育线索',
  'Verify lead': '待核验线索',
  'Generate revenue pack': '生成收入包',
  'Mark won': '标记成交',
  'Export proposal': '导出方案',
  'Recovery link': '挽回链接',
  'Creating link': '正在创建链接',
  'Customer action link': '客户操作链接',
  Estimate: '估价',
  Proposal: '方案',
  'No estimate generated yet.': '尚未生成估价。',
  'No proposal generated yet.': '尚未生成方案。',
  Capture: '采集',
  'Add a new paid opportunity': '新增付费商机',
  Customer: '客户',
  'Service category': '服务类别',
  'Emergency plumbing repair': '紧急管道维修',
  'Job description': '工作描述',
  'Describe scope, urgency, property, and constraints.': '描述范围、紧急程度、房产情况和约束。',
  'Min budget': '最低预算',
  'Max budget': '最高预算',
  Urgency: '紧急程度',
  Low: '低',
  Normal: '正常',
  High: '高',
  Emergency: '紧急',
  'In service area': '在服务区域内',
  'Repeat customer': '复购客户',
  'Add and score lead': '新增并评分线索',
  'Follow-up': '跟进',
  'Sequence for selected lead': '所选线索跟进序列',
  'Add a lead to start the BidFlow pipeline.': '添加线索以启动 BidFlow 流水线。',
  'Recovery link created.': '挽回链接已创建。',
  'Unable to create recovery link.': '无法创建挽回链接。',
  'Call within 5 minutes and send a premium estimate today.': '5 分钟内电话联系，并在今天发送高优先级估价。',
  'Qualify details, prepare an estimate, and schedule a 24-hour follow-up.': '核验细节，准备估价，并安排 24 小时跟进。',
  'Send a discovery note and move into a nurture sequence.': '发送需求探询说明，并进入培育序列。',
  'Hold for manual verification before investing sales time.': '先人工核验，再投入销售时间。',

  'Protect reviews and recover lost customers': '保护评价转化并挽回流失客户',
  'Detect public risk, draft compliant responses, open recovery cases, and estimate repeat revenue from approved campaigns.':
    '识别公开风险、起草合规回复、开启挽回案例，并估算已批准活动带来的复购收入。',
  'Average rating': '平均评分',
  'High-risk reviews': '高风险评价',
  'Monthly review goal': '月评价目标',
  Inbox: '收件箱',
  'Manager approval required. Keep the response public-safe and move the conversation offline.':
    '需要经理审批。保持公开回复安全，并将沟通转到线下。',
  'Draft may be approved after checking customer consent and platform policy.':
    '核查客户同意和平台政策后，可批准该草稿。',
  'Generate response pack': '生成回复包',
  'Approve reply': '批准回复',
  'Export recovery pack': '导出挽回包',
  'Public reply draft': '公开回复草稿',
  'No response generated yet.': '尚未生成回复。',
  'Recovery offer': '挽回优惠',
  'No recovery case required for this review.': '该评价无需挽回案例。',
  Import: '导入',
  'Add a customer review': '新增客户评价',
  'Reviewer name': '评价人姓名',
  'Public reviewer name': '公开评价人姓名',
  Rating: '评分',
  '5 stars': '5 星',
  '4 stars': '4 星',
  '3 stars': '3 星',
  '2 stars': '2 星',
  '1 star': '1 星',
  'Review body': '评价内容',
  'Paste the public review text.': '粘贴公开评价文本。',
  'Import and analyze': '导入并分析',
  'Operating rules': '运营规则',
  'Ask every customer for honest feedback without filtering unhappy customers out.':
    '向每位客户请求真实反馈，不筛掉不满意客户。',
  'Never offer discounts, refunds, or gifts in exchange for a positive review.':
    '绝不以折扣、退款或礼品换取正面评价。',
  'Keep legal, safety, discrimination, and refund disputes in a manager approval queue.':
    '法律、安全、歧视和退款争议必须进入经理审批队列。',
  'Respect email and SMS consent before sending winback or repeat-purchase campaigns.':
    '发送挽回或复购活动前，必须尊重邮件和短信同意状态。',
  'Import a review to start ReputeLoop.': '导入评价以启动 ReputeLoop。',

  'Paid pilot checkout': '付费试点结账',
  'Start a managed local growth pilot': '启动托管式本地增长试点',
  'Choose one focused workflow, pay setup plus the first monthly plan through Stripe, then complete onboarding.':
    '选择一个聚焦工作流，通过 Stripe 支付设置费和首月套餐，然后完成入驻。',
  'Prospect-specific checkout': '特定潜客结账',
  'Recover missed quote revenue with scored leads, estimate drafts, proposals, and follow-up packs.':
    '通过线索评分、估价草稿、方案和跟进包，追回错失的报价收入。',
  'Protect review conversion with risk scoring, compliant response drafts, and winback recovery packs.':
    '通过风险评分、合规回复草稿和挽回包，保护评价转化。',
  'Business profile': '业务资料',
  'Checkout details': '结账信息',
  'Accepted pilot scope': '已接受试点范围',
  Business: '商家',
  'Owner email': '负责人邮箱',
  Website: '网站',
  Industry: '行业',
  City: '城市',
  State: '州/省',
  'Checkout acknowledgements': '结账确认事项',
  'I accept the pilot scope displayed above for this paid handoff.': '我接受上方为此次付费交接显示的试点范围。',
  'I have a written pilot scope or qualified fit conversation for this workflow.': '我已有该工作流的书面试点范围或合格适配沟通。',
  'I understand submitted materials are operator-reviewed before import, sending, or public replies.':
    '我理解提交材料在导入、发送或公开回复前会由运营人员审核。',
  'I accept the': '我接受',
  'pilot terms': '试点条款',
  'for setup, monthly subscription, deliverables, and manual approval.': '关于设置、月订阅、交付物和人工审批的规定。',
  'privacy handling': '隐私处理',
  'for submitted lead, review, and business materials.': '关于提交的线索、评价和业务材料的规定。',
  'refund and cancellation policy': '退款和取消政策',
  'for a managed pilot.': '关于托管式试点的规定。',
  'Opening Checkout': '正在打开结账',
  'After payment': '付款后',
  'What happens next': '接下来会发生什么',
  'Stripe webhook confirms payment and creates a private onboarding link.':
    'Stripe webhook 确认付款并创建私密入驻链接。',
  'You submit lead or review materials for operator review.': '你提交线索或评价材料供运营人员审核。',
  'The first pack is reviewed before any public reply, SMS, or binding quote is sent.':
    '在发送公开回复、短信或约束性报价前，会先审核第一个交付包。',
  'Unable to load checkout handoff.': '无法加载结账交接。',
  'Unable to start checkout.': '无法启动结账。',
  'Stripe did not return a Checkout URL.': 'Stripe 未返回结账 URL。',

  'Customer onboarding': '客户入驻',
  'Paid pilot activation': '付费试点激活',
  'Track payment-confirmed setup, materials submitted for review, and the first human-approved pilot pack.':
    '跟踪已确认付款的设置、待审核材料，以及第一个人工批准的试点包。',
  'Onboarding connected': '入驻已连接',
  'API offline': 'API 离线',
  'Loading onboarding': '正在加载入驻',
  'Start the API to continue': '启动 API 后继续',
  'No paid pilot onboarding is waiting yet.': '当前没有等待处理的付费试点入驻。',
  'steps complete': '项已完成',
  'Pilot is ready for first delivery': '试点已准备好首次交付',
  'Confirm this only after the requested materials or first-pack review are actually complete.':
    '仅在所需材料或首个交付包审核确实完成后确认。',
  'Review the first approved pack with the customer before turning on broader automation.':
    '开启更广泛自动化前，先与客户复核第一个已批准交付包。',
  'Delivery owner': '交付负责人',
  'SLA due': 'SLA 截止',
  'Delivery status': '交付状态',
  'Recording QA': '正在记录 QA',
  'QA approve': 'QA 批准',
  'Recording sent': '正在记录已发送',
  'Mark sent': '标记已发送',
  'Verified from payment or workspace setup.': '已通过付款或工作区设置核验。',
  'Confirmed and waiting for operator review where required.': '已确认，必要时等待运营审核。',
  'Waiting for submitted materials or first-pack review.': '等待提交材料或首包审核。',
  Undo: '撤销',
  'Confirm submitted': '确认已提交',
  'Confirm reviewed': '确认已审核',
  Materials: '材料',
  'Submit materials for review': '提交材料供审核',
  Email: '邮箱',
  Type: '类型',
  'Lead CSV': '线索 CSV',
  'Review CSV': '评价 CSV',
  Notes: '备注',
  Title: '标题',
  'June leads export': '6 月线索导出',
  Details: '详情',
  'Paste CSV rows, review exports, or access notes.': '粘贴 CSV 行、评价导出或访问说明。',
  Submitting: '正在提交',
  'Submit for review': '提交审核',
  'First delivery': '首次交付',
  'Respond to delivery': '回应交付',
  Response: '回应',
  'Accept delivery': '接受交付',
  'Request revision': '请求修改',
  'Schedule call': '预约电话',
  Note: '备注',
  'Add acceptance note, revision request, or preferred callback time.': '添加接受说明、修改请求或期望回电时间。',
  Recording: '正在记录',
  'Send delivery response': '发送交付回应',
  'Submitted materials': '已提交材料',
  'Submitted': '已提交',
  'Reviewed': '已审核',
  'Imported': '已导入',
  Previewing: '正在预览',
  Preview: '预览',
  Importing: '正在导入',
  Generating: '正在生成',
  'First pack': '首包',
  Downloading: '正在下载',
  'Download pack': '下载交付包',
  'No customer materials have been submitted yet.': '尚未提交客户材料。',
  'Customer-safe actions': '客户安全操作',
  'What can be confirmed here': '这里可确认的事项',
  'Customer lead or review data has been submitted for review.': '客户线索或评价数据已提交审核。',
  'The first revenue or reputation pack has been reviewed with the customer.': '第一个收入或口碑交付包已与客户复核。',
  'Contact details and service scope are ready for human-managed delivery.': '联系方式和服务范围已准备好由人工管理交付。',
  Guardrails: '护栏',
  'Still requires human approval': '仍需人工审批',
  'Binding quotes, public review replies, SMS sends, and refund offers.': '约束性报价、公开评价回复、短信发送和退款优惠。',
  'Google Business Profile access and provider credentials.': 'Google 商家资料访问权限和服务商凭据。',
  'Claims about recovered revenue before attribution is verified.': '在归因验证前宣称已追回收入。',
  'Checkout started': '已开始结账',
  'Payment received': '已收到付款',
  'Workspace activated': '工作区已激活',
  'Materials submitted for review': '材料已提交审核',
  'Ready for pilot delivery': '已准备试点交付',
  'Not started': '未开始',
  'Materials waiting': '等待材料',
  'Pack ready': '交付包就绪',
  'QA approved': 'QA 已批准',
  'Sent to customer': '已发送给客户',
  'Customer accepted': '客户已接受',
  'Revision requested': '已请求修改',
  'Call requested': '已请求电话',
  'Renewal ready': '续约就绪',
  Blocked: '受阻',
  'Materials submitted for operator review.': '材料已提交给运营人员审核。',
  'Unable to submit materials.': '无法提交材料。',
  'Unable to update onboarding.': '无法更新入驻。',
  'Unable to update submission.': '无法更新提交。',
  'Unable to preview submission import.': '无法预览提交导入。',
  'Unable to import submission.': '无法导入提交。',
  'Generated first pack and advanced onboarding checks.': '已生成首包并推进入驻检查。',
  'Unable to generate first pack.': '无法生成首包。',
  'Downloaded first delivery pack.': '已下载首次交付包。',
  'Unable to download delivery pack.': '无法下载交付包。',
  'First delivery pack reviewed against the operator QA checklist.': '已按运营 QA 清单审核首次交付包。',
  'QA approval recorded for first delivery.': '首次交付 QA 批准已记录。',
  'Unable to record QA approval.': '无法记录 QA 批准。',
  'First approved revenue pack sent for customer review and quote action.': '首个已批准收入包已发送给客户审核并处理报价。',
  'First approved response and recovery pack sent for customer review.': '首个已批准回复与挽回包已发送给客户审核。',
  'Delivery sent evidence recorded.': '交付发送证据已记录。',
  'Unable to mark delivery sent.': '无法标记交付已发送。',
  'Delivery response recorded for the operator.': '交付回应已记录给运营人员。',
  'Unable to record delivery response.': '无法记录交付回应。',

  'Go-to-market command': '上市指挥台',
  'First 30 days to real revenue': '前 30 天获得真实收入',
  'The product should be sold as a managed revenue system first, then converted into pure SaaS as the repeatable workflow hardens.':
    '产品应先作为托管式收入系统销售，待可复制工作流稳定后再转为纯 SaaS。',
  'API connected': 'API 已连接',
  'Checking API': '正在检查 API',
  'Start npm run api for live readiness checks': '启动 npm run api 进行实时就绪检查',
  'Sales period': '销售周期',
  'Email sent': '邮件已发送',
  'Calls logged': '已记录电话',
  'Reply / call / scope / checkout': '回复 / 电话 / 范围 / 结账',
  'Recommended focus': '建议关注',
  'Active / stale': '活跃 / 停滞',
  'Estimated pipeline': '预计商机',
  'Win / checkout-to-win': '成交 / 结账到成交',
  'Stripe evidence': 'Stripe 证据',
  'Paid revenue': '已付收入',
  'Live MRR': '实时 MRR',
  'Gross collected': '总收款',
  'Revenue command': '收入指挥',
  'Next revenue actions': '下一步收入动作',
  'No command actions are available yet.': '暂时没有可用指挥动作。',
  'Manual sales desk': '人工销售台',
  'Import prospects': '导入潜客',
  'Paste prospect CSV rows here.': '在此粘贴潜客 CSV 行。',
  'Import prospects CSV': '导入潜客 CSV',
  'Sales prospects': '销售潜客',
  'No prospects imported yet. Start with the 200-business list template.': '尚未导入潜客。请从 200 家商家列表模板开始。',
  'Live plans': '线上套餐',
  'API pricing catalog': 'API 价格目录',
  'Start Stripe Checkout': '启动 Stripe 结账',
  Opening: '正在打开',
  Checkout: '结账',
  'Live plan data appears when the API is running.': 'API 运行后会显示线上套餐数据。',
  Readiness: '就绪状态',
  'Revenue integration status': '收入集成状态',
  Configured: '已配置',
  'Start the API to see Stripe, email, SMS, database, and Google readiness.':
    '启动 API 后可查看 Stripe、邮件、短信、数据库和 Google 就绪状态。',
  'Billing state': '计费状态',
  'Active subscriptions': '活跃订阅',
  'Open Stripe billing portal': '打开 Stripe 计费门户',
  Manage: '管理',
  'No period end yet': '尚无周期结束时间',
  'No Stripe subscription events have been received yet.': '尚未收到 Stripe 订阅事件。',
  'Start the API to see subscription state.': '启动 API 后可查看订阅状态。',
  'Revenue evidence': '收入证据',
  'Payment ledger': '付款账本',
  Setup: '设置费',
  MRR: '月经常收入',
  Gross: '总额',
  'No Stripe-paid revenue evidence yet. Checkout-sent prospects are not counted here.':
    '尚无 Stripe 已付收入证据。已发送结账的潜客不计入这里。',
  'Start the API to see verified payment evidence.': '启动 API 后可查看已验证付款证据。',
  'Paid pilot onboarding': '付费试点入驻',
  'Workspace activation queue': '工作区激活队列',
  Delivery: '交付',
  owner: '负责人',
  'activation checks': '项激活检查',
  'Mark incomplete': '标记未完成',
  'Mark complete': '标记完成',
  Done: '完成',
  'No paid pilot onboarding records have been created yet.': '尚未创建付费试点入驻记录。',
  'Start the API to see onboarding activation state.': '启动 API 后可查看入驻激活状态。',
  'Pilot proof': '试点证明',
  'Record customer outcome': '记录客户结果',
  'Paid pilot': '付费试点',
  'Choose onboarding record': '选择入驻记录',
  Outcome: '结果',
  'Won job': '赢得订单',
  'Revived quote': '恢复报价',
  'Approved review reply': '批准评价回复',
  'Recovered customer': '挽回客户',
  'Repeat booking': '复购预约',
  'Hours saved': '节省工时',
  Other: '其他',
  Value: '价值',
  'Recorded by': '记录人',
  'Customer approved proposal, won job invoice, approved review reply, recovered conversation, or time-savings note.':
    '客户批准方案、成交发票、已批准评价回复、挽回沟通或节省时间说明。',
  'Next action': '下一步动作',
  'Renew, ask for case study, deliver next pack, or schedule review.': '续约、请求案例、交付下一包或安排复盘。',
  'Record outcome': '记录结果',
  'Outcome ledger': '结果台账',
  'Renewal evidence': '续约证据',
  'No pilot outcomes recorded yet. Do not claim recovered revenue until this ledger has evidence.':
    '尚未记录试点结果。在台账有证据前，不要宣称已追回收入。',
  'Start the API to see outcome evidence.': '启动 API 后可查看结果证据。',
  'Board decision': '决策记录',
  'Why these two remain the active bets': '为什么仍押注这两个产品',
  Product: '产品',
  'Weighted score': '加权评分',
  Monetization: '变现',
  'Risk handling': '风险处理',
  Trace: '轨迹',
  'Recent operating log': '近期运营日志',
  'Pick one beachhead city and vertical': '选择一个切入城市和垂直行业',
  'Start with Austin home services because the seed workflow already models emergency repair, office maintenance, and seasonal work.':
    '从奥斯汀家庭服务开始，因为种子工作流已经覆盖紧急维修、办公室维护和季节性工作。',
  'Sell paid pilots before broad launch': '大范围发布前先销售付费试点',
  'Offer a 14-day setup sprint with a monthly plan. Charge setup to filter serious customers and fund integration work.':
    '提供 14 天设置冲刺和月套餐。收取设置费用以筛选认真客户并资助集成工作。',
  'Connect outbound channels': '连接外呼渠道',
  'Use Google Maps, local SEO agencies, trade groups, and cold email to find owners with weak review response or slow quote flow.':
    '使用 Google Maps、本地 SEO 机构、行业社群和冷邮件寻找评价回复弱或报价流程慢的业主。',
  'Install integrations after contract': '签约后安装集成',
  'Connect Stripe, email, SMS, Google Business Profile, and calendar only for the first paying vertical to avoid waste.':
    '只为首个付费垂直行业连接 Stripe、邮件、短信、Google 商家资料和日历，避免浪费。',
  'Authentication, organization isolation, roles, and billing owner permissions.':
    '身份认证、组织隔离、角色和计费负责人权限。',
  'Stripe subscriptions, invoices, customer portal, tax settings, and failed payment handling.':
    'Stripe 订阅、发票、客户门户、税务设置和付款失败处理。',
  'Postmark or SendGrid for email with unsubscribe; Twilio for SMS with consent and STOP handling.':
    '使用 Postmark 或 SendGrid 发送带退订的邮件；使用 Twilio 发送具备同意和 STOP 处理的短信。',
  'Google Business Profile review import/reply and customer-safe webhook logging.':
    'Google 商家资料评价导入/回复，以及客户安全的 webhook 日志。',
  'Server database, encrypted secrets, backup/restore, audit logs, and admin support tooling.':
    '服务器数据库、加密密钥、备份/恢复、审计日志和管理员支持工具。',
  'Terms, privacy policy, acceptable use policy, review compliance policy, and human approval SOP.':
    '条款、隐私政策、可接受使用政策、评价合规政策和人工审批 SOP。',

  'BidFlow approval link': 'BidFlow 批准链接',
  'ReputeLoop recovery link': 'ReputeLoop 挽回链接',
  'Estimated value': '预计价值',
  Expires: '过期时间',
  Status: '状态',
  'Recommended action': '建议操作',
  Approve: '批准',
  Decline: '拒绝',
  'Contact email': '联系邮箱',
  'Add timing, revision details, or decline reason.': '添加时间、修改细节或拒绝原因。',
  'Response already recorded': '回应已记录',
  'Loading recovery link...': '正在加载挽回链接...',
  'Unable to load recovery link.': '无法加载挽回链接。',
  'Unable to record response.': '无法记录回应。',
  'Response recorded. The operator will follow up from this recovery record.':
    '回应已记录。运营人员会基于该挽回记录跟进。',

  'Managed Pilot Terms': '托管式试点条款',
  'Pilot terms': '试点条款',
  'Privacy and Consent': '隐私与同意',
  'Data handling': '数据处理',
  'Refund and Cancellation Policy': '退款与取消政策',
  'Billing policy': '计费政策',
  'Back to checkout': '返回结账',
  'Pilot Scope': '试点范围',
  'Human Approval': '人工审批',
  Billing: '计费',
  'Data Collected': '收集的数据',
  'Use and Protection': '使用与保护',
  Consent: '同意',
  'Setup Fee': '设置费',
  'Monthly Subscription': '月订阅',
  Disputes: '争议',
  'Policy references': '政策参考',
  'These terms describe the managed BidFlow Local and ReputeLoop pilot workflow: setup, subscription, onboarding, human review, and delivery boundaries.':
    '这些条款说明托管式 BidFlow Local 和 ReputeLoop 试点工作流：设置、订阅、入驻、人工审核和交付边界。',
  'This page describes how pilot data is handled during onboarding, lead/review import, generated packs, and messaging consent workflows.':
    '本页说明试点数据在入驻、线索/评价导入、生成交付包和消息同意工作流中的处理方式。',
  'This policy keeps the paid pilot commercially clear while leaving room for written customer-specific agreements.':
    '该政策保持付费试点商业规则清晰，同时为客户特定书面协议保留空间。',
  'Operator note: broad self-serve launch still requires counsel-approved terms, privacy policy, refund language, and consent copy.':
    '运营提示：大范围自助发布仍需要律师批准的条款、隐私政策、退款措辞和同意文案。',
}

const zhPatterns: PatternTranslation[] = [
  {
    pattern: /^(.+)\/mo \+ (.+) setup$/,
    translate: (_full, monthly, setup) => `${monthly}/月 + ${setup} 设置费`,
  },
  {
    pattern: /^(.+) setup$/,
    translate: (_full, setup) => `${setup} 设置费`,
  },
  {
    pattern: /^Checkout for (.+)$/,
    translate: (_full, product) => `为 ${product} 结账`,
  },
  {
    pattern: /^Submit: (.+)$/,
    translate: (_full, action) => `提交：${translateStaticText(action, 'zh')}`,
  },
  {
    pattern: /^(\d+) stars on (.+)$/,
    translate: (_full, stars, platform) => `${stars} 星 · ${platform}`,
  },
  {
    pattern: /^(\d+) ready · (\d+) skipped · (\d+) errors$/,
    translate: (_full, ready, skipped, errors) => `${ready} 条就绪 · ${skipped} 条跳过 · ${errors} 个错误`,
  },
  {
    pattern: /^Row (\d+): (.+)$/,
    translate: (_full, row, error) => `第 ${row} 行：${error}`,
  },
  {
    pattern: /^Imported (\d+) records from submitted materials\.$/,
    translate: (_full, count) => `已从提交材料导入 ${count} 条记录。`,
  },
  {
    pattern: /^Imported (\d+) prospects with (\d+) row errors\.$/,
    translate: (_full, imported, errors) => `已导入 ${imported} 个潜客，其中 ${errors} 行有错误。`,
  },
  {
    pattern: /^(\d+) paid pilot records$/,
    translate: (_full, count) => `${count} 条付费试点记录`,
  },
  {
    pattern: /^(\d+) customer submissions$/,
    translate: (_full, count) => `${count} 条客户提交`,
  },
  {
    pattern: /^(\d+)\/(\d+) production integrations configured$/,
    translate: (_full, ready, total) => `${ready}/${total} 个生产集成已配置`,
  },
  {
    pattern: /^(\d+)\/(\d+) activation checks$/,
    translate: (_full, done, total) => `${done}/${total} 项激活检查`,
  },
  {
    pattern: /^(\d+) hours$/,
    translate: (_full, hours) => `${hours} 小时`,
  },
  {
    pattern: /^Renews (.+)$/,
    translate: (_full, date) => `${date} 续费`,
  },
  {
    pattern: /^Delivery: (.+) · owner (.+) · SLA (.+)$/,
    translate: (_full, status, owner, sla) => `交付：${translateStaticText(status, 'zh')} · 负责人 ${owner} · SLA ${sla}`,
  },
]

const originalTextNodes = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()
const localizedAttributes = ['aria-label', 'placeholder', 'title'] as const

export function readInitialLanguage(): UiLanguage {
  if (typeof window === 'undefined') return 'en'
  const stored = window.localStorage.getItem(languageStorageKey)
  if (stored === 'zh' || stored === 'en') return stored
  return window.navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function translateStaticText(value: string, language: UiLanguage): string {
  if (language === 'en') return value
  const normalized = normalizeText(value)
  if (!normalized) return value
  const exact = zhTranslations[normalized]
  if (exact) return exact
  for (const translation of zhPatterns) {
    const match = normalized.match(translation.pattern)
    if (match) return translation.translate(...match)
  }
  return value
}

export function useRuntimeLocalization(language: UiLanguage) {
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.getElementById('root')
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    document.title = language === 'zh' ? '本地增长操作系统' : 'Local Growth OS'
    if (!root) return

    localizeTree(root, language)

    if (typeof MutationObserver === 'undefined') return
    let scheduled = false
    const observer = new MutationObserver(() => {
      if (scheduled) return
      scheduled = true
      window.queueMicrotask(() => {
        scheduled = false
        localizeTree(root, language)
      })
    })
    observer.observe(root, {
      attributes: true,
      attributeFilter: [...localizedAttributes],
      characterData: true,
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  }, [language])
}

function localizeTree(root: Element, language: UiLanguage) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent || shouldSkipElement(parent)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const textNodes: Text[] = []
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }
  textNodes.forEach((node) => localizeTextNode(node, language))

  root.querySelectorAll('*').forEach((element) => {
    if (shouldSkipElementAttributes(element)) return
    localizeAttributes(element, language)
  })
}

function localizeTextNode(node: Text, language: UiLanguage) {
  const current = node.nodeValue ?? ''
  if (!current.trim()) return
  const previousOriginal = originalTextNodes.get(node)
  const original =
    previousOriginal && isKnownRenderedText(current, previousOriginal, language)
      ? previousOriginal
      : current
  originalTextNodes.set(node, original)
  const translated = translateStaticText(original.trim(), language)
  const next = withOriginalWhitespace(original, translated)
  if (node.nodeValue !== next) node.nodeValue = next
}

function localizeAttributes(element: Element, language: UiLanguage) {
  localizedAttributes.forEach((attribute) => {
    if (!element.hasAttribute(attribute)) return
    const current = element.getAttribute(attribute) ?? ''
    const stored = originalAttributes.get(element) ?? new Map<string, string>()
    const previousOriginal = stored.get(attribute)
    const original =
      previousOriginal && isKnownRenderedText(current, previousOriginal, language)
        ? previousOriginal
        : current
    stored.set(attribute, original)
    originalAttributes.set(element, stored)
    const translated = translateStaticText(original, language)
    if (current !== translated) element.setAttribute(attribute, translated)
  })
}

function isKnownRenderedText(current: string, original: string, language: UiLanguage) {
  const trimmedCurrent = current.trim()
  const trimmedOriginal = original.trim()
  if (language === 'en') return trimmedCurrent === trimmedOriginal || trimmedCurrent === translateStaticText(trimmedOriginal, 'zh')
  return trimmedCurrent === trimmedOriginal || trimmedCurrent === translateStaticText(trimmedOriginal, 'zh')
}

function shouldSkipElement(element: Element) {
  const tag = element.tagName
  return tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT'
}

function shouldSkipElementAttributes(element: Element) {
  const tag = element.tagName
  return tag === 'SCRIPT' || tag === 'STYLE'
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function withOriginalWhitespace(original: string, translated: string) {
  const leading = original.match(/^\s*/)?.[0] ?? ''
  const trailing = original.match(/\s*$/)?.[0] ?? ''
  return `${leading}${translated}${trailing}`
}
