import { initReactI18next } from 'react-i18next'
import i18n, { ReadCallback } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { pick } from 'lodash-es'

/** 支持的语言 */
export const supportedLngs = ['zh', 'en'] as const

/** 支持的语言 */
export type SupportedLng = (typeof supportedLngs)[number]

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .use({
    type: 'backend',
    // lng已经被i18n转化过
    // ns==='translation'表示全部命名空间
    read: async (lng: SupportedLng, ns: string, cb: ReadCallback) => {
      import(`./resource/${lng}.json`)
        .then((res) => res.default)
        .then((data) => (ns === 'translation' ? data : pick(data, ns)))
        .then((resource) => cb(null, resource))
        .catch((e) => cb(e, null))
    },
  })
  .init({
    // 会将字符串自动转化到supportedLngs
    supportedLngs,
    nonExplicitSupportedLngs: false,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
      skipOnVariables: false,
    },
    detection: {
      // 缓存相关
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18n_lang',
    },
  })
