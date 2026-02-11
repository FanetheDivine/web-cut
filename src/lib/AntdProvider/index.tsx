import { FC, PropsWithChildren, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { App, ConfigProvider } from 'antd'
import type { Locale } from 'antd/es/locale'
import antd_en_US from 'antd/es/locale/en_US'
import antd_zh_CN from 'antd/es/locale/zh_CN'
import { StyleProvider } from '@ant-design/cssinjs'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { Subject } from 'rxjs'
import { match } from 'ts-pattern'
import { SupportedLng } from '@/locales'

/** antd 首屏样式 样式兼容 本地化 主题等 */
export const AntdProvider: FC<PropsWithChildren> = (props) => {
  const { i18n } = useTranslation()
  const [local, setLocale] = useState<Locale>()
  const lng$ = useMemo(() => {
    const _lng$ = new Subject<SupportedLng>()
    _lng$.subscribe((lng) => {
      setLocale(
        match(lng)
          .with('zh', () => antd_zh_CN)
          .with('en', () => antd_en_US)
          .exhaustive(),
      )
      dayjs.locale(
        match(lng)
          .with('zh', () => 'zh-cn')
          .with('en', () => 'en')
          .exhaustive(),
      )
    })
    return _lng$
  }, [])
  useEffect(() => {
    lng$.next(i18n.language as SupportedLng)
    const onLanguageChanged = (lng: string) => {
      lng$.next(lng as SupportedLng)
    }
    i18n.on('languageChanged', onLanguageChanged)
    return () => {
      i18n.off('languageChanged', onLanguageChanged)
    }
  }, [i18n, lng$])
  return (
    <StyleProvider layer>
      <ConfigProvider locale={local}>
        <App className='app'> {props.children}</App>
      </ConfigProvider>
    </StyleProvider>
  )
}

export default AntdProvider
