import { describe, expect, it } from 'vitest'
import { translateStaticText } from './i18n'

describe('runtime UI localization', () => {
  it('translates exact UI copy to Chinese', () => {
    expect(translateStaticText('Revenue operations cockpit', 'zh')).toBe('收入运营驾驶舱')
    expect(translateStaticText('Revenue operations cockpit', 'en')).toBe('Revenue operations cockpit')
  })

  it('translates common dynamic labels without changing numbers or product names', () => {
    expect(translateStaticText('$149/mo + $499 setup', 'zh')).toBe('$149/月 + $499 设置费')
    expect(translateStaticText('Checkout for BidFlow Local', 'zh')).toBe('为 BidFlow Local 结账')
    expect(translateStaticText('Submit: Request revision', 'zh')).toBe('提交：请求修改')
  })

  it('translates operational counters', () => {
    expect(translateStaticText('4 ready · 1 skipped · 2 errors', 'zh')).toBe('4 条就绪 · 1 条跳过 · 2 个错误')
    expect(translateStaticText('3 paid pilot records', 'zh')).toBe('3 条付费试点记录')
  })
})
