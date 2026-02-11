import locales from './resource/zh.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: typeof locales
  }
}
