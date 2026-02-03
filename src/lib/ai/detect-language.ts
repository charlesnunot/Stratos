/**
 * 轻量语言检测：用于卡片「仅当内容语言 ≠ locale 时显示翻译」。
 * 启发式：CJK 字符占比 > 阈值视为中文，否则英文。
 */

const CJK_RANGE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/

/** 判定为「中文」的 CJK 占比阈值（> 此值视为中文） */
const CJK_THRESHOLD_ZH = 0.2

/**
 * 计算非空白字符中 CJK 占比，0~1。无有效字符返回 0。
 */
export function getCjkRatio(text: string): number {
  if (!text?.trim()) return 0
  let cjkCount = 0
  let total = 0
  for (const char of text) {
    if (/\s/.test(char)) continue
    total++
    if (CJK_RANGE.test(char)) cjkCount++
  }
  return total === 0 ? 0 : cjkCount / total
}

export function detectContentLanguage(text: string): 'zh' | 'en' {
  return getCjkRatio(text) > CJK_THRESHOLD_ZH ? 'zh' : 'en'
}

export function shouldShowTranslate(contentLang: 'zh' | 'en', locale: string): boolean {
  const localeLang = locale.startsWith('zh') ? 'zh' : 'en'
  return contentLang !== localeLang
}

/**
 * 根据正文实际语言解析 content_lang，用于创建/更新时写入数据库。
 * 空文本返回 null；有内容时用 CJK 占比推断 zh/en。
 */
export function resolveContentLang(text: string | null | undefined): 'zh' | 'en' | null {
  const trimmed = text?.trim()
  if (!trimmed) return null
  return detectContentLanguage(trimmed)
}

/** 中文页：要求正文以中文为主，CJK 占比 >= 此值（允许少量英文如专业名词） */
const LOCALE_ZH_MIN_CJK = 0.25
/** 英文页：要求正文以英文为主，CJK 占比 <= 此值 */
const LOCALE_EN_MAX_CJK = 0.2

export type ContentLanguageValidation = { valid: true } | { valid: false; messageKey: 'contentLanguageMustBeZh' | 'contentLanguageMustBeEn' }

/**
 * 按页面语言强制输入语种：中文页以中文为主（可含少量英文），英文页以英文为主。
 * 用于发帖、评论、商品名称/描述等提交前校验。
 */
export function validateContentLanguageForLocale(
  text: string | null | undefined,
  locale: string
): ContentLanguageValidation {
  const trimmed = text?.trim()
  if (!trimmed) return { valid: true }
  const cjkRatio = getCjkRatio(trimmed)
  const isZhPage = locale.startsWith('zh')
  if (isZhPage) {
    if (cjkRatio >= LOCALE_ZH_MIN_CJK) return { valid: true }
    return { valid: false, messageKey: 'contentLanguageMustBeZh' }
  }
  if (cjkRatio <= LOCALE_EN_MAX_CJK) return { valid: true }
  return { valid: false, messageKey: 'contentLanguageMustBeEn' }
}
