import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Result, Button } from 'antd'
import { RollbackOutlined, HomeOutlined } from '@ant-design/icons'
import { AbsoluteCenter } from '@/styles'

export const GlobalNotFound: FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <Result
      className={AbsoluteCenter}
      status={'404'}
      title={t('common.page404')}
      extra={[
        <Button
          key='goback'
          type='primary'
          icon={<RollbackOutlined />}
          onClick={() => navigate(-1)}
        >
          {t('common.goback')}
        </Button>,
        <a href='/' key='homepage'>
          <Button icon={<HomeOutlined />}>{t('common.toHomepage')}</Button>
        </a>,
      ]}
    />
  )
}

export default GlobalNotFound
