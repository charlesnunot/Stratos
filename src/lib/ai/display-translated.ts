/**
 * 仅中英双语：按当前 locale 选择显示原文或译文。
 * 用于帖子 content、评论 content、商品 name/description。
 *
 * 约定：content_lang 始终表示「原文 content 的语言」；content_translated 为审核后翻译到另一种语言的结果。
 * 若 content_lang 为空（老数据/漏写），则用正文启发式推断原文语言，避免与界面语言相反。
 */

import { detectContentLanguage } from '@/lib/ai/detect-language'

export type ContentLang = 'zh' | 'en' | null

/**
 * 根据 locale 与 content_lang 返回应展示的文本（原文或译文）。
 * 无译文或老数据时回退到原文。
 * 语义：locale 为当前界面语言，content_lang 为原文语言；界面语言与原文一致则显示原文，否则显示译文。
 * 当 content_lang 为 null 时，用 detectContentLanguage(content) 推断原文语言，保证与顶栏语言切换一致。
 */
export function getDisplayContent(
  locale: string,
  contentLang: ContentLang | string | null,
  content: string | null | undefined,
  contentTranslated: string | null | undefined
): string {
  const raw = content?.trim() ?? ''
  if (!raw) return ''
  const translated = contentTranslated?.trim()
  if (!translated) return raw
  // 当前界面希望显示的语言（zh / en）
  const wantZh = locale === 'zh'
  // 原文语言：以 content_lang 为准，为空时用正文推断（避免与界面语言相反）
  const isZh =
    contentLang === 'zh'
      ? true
      : contentLang === 'en'
        ? false
        : detectContentLanguage(raw) === 'zh'
  // 界面语言与原文一致 → 显示原文；否则显示译文
  if (wantZh === isZh) return raw
  return translated
}
