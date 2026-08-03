/**
 * 乐曼同传 i18n 多语言配置
 * 支持：简体中文、越南语、英语
 */
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN/translation.json'
import viVN from './locales/vi-VN/translation.json'
import en from './locales/en/translation.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'vi-VN', label: 'Tiếng Việt' },
  { code: 'en',    label: 'English' },
] as const

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { translation: zhCN },
      'vi-VN': { translation: viVN },
      en:      { translation: en },
    },
    fallbackLng: 'zh-CN',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    load: 'currentOnly',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'leman:lang',
      caches: ['localStorage'],
    },
  })

export default i18n
