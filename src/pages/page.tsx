import { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { App, Button, DatePicker, Input, Space } from 'antd'
import useSWR from 'swr'
import { loadFile, sleep, cn } from '@/utils'

let count = 0
const Page: FC = () => {
  const { t, i18n } = useTranslation()
  const { modal } = App.useApp()
  const [text, setText] = useState('')
  const [type, setType] = useState<'v1' | 'v2' | 'error'>('v1')
  const { data, mutate, isValidating } = useSWR(
    () => type,
    async (type) => {
      await sleep(2000)
      if (type !== 'error') return `type=${type} ${count++}`
      throw new Error('page-error')
    },
    {
      suspense: true,
    },
  )
  return (
    <div className={cn('flex h-full w-full flex-col overflow-auto')}>
      <div className='flex flex-none flex-col'>
        <span>test i18n :{t('common.retry')}</span>
        <span>current lng:{i18n.language}</span>
        <Input value={text} onChange={(e) => setText(e.target.value)} />
        <Button onClick={() => i18n.changeLanguage(text)}>set lng</Button>
        <Button
          onClick={() => {
            modal.info({
              content: <DatePicker />,
            })
          }}
        >
          confirm
        </Button>
      </div>
      <div className='flex min-h-[1000px] flex-col'>
        <Button
          onClick={async () => {
            const files = await loadFile({ webkitdirectory: false })
            console.log(files)
          }}
        >
          loadFile
        </Button>
        <span>result:{data}</span>
        <Space.Compact>
          <Button onClick={() => setType('v1')}>set v1</Button>
          <Button onClick={() => setType('v2')}>set v2</Button>
          <Button onClick={() => setType('error')}>set error</Button>
          <Button onClick={() => mutate(undefined)}>{isValidating ? 'fetching' : 'refetch'}</Button>
          <Link to={'/404'}>
            <Button>to 404</Button>
          </Link>
        </Space.Compact>
      </div>
    </div>
  )
}

export default Page
