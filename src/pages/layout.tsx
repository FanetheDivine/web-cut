import { FC, PropsWithChildren } from 'react'

const Layout: FC<PropsWithChildren> = (props) => {
  return (
    <div className={'flex h-full w-full flex-col'}>
      <div className='h-20 bg-black text-white'>layout</div>
      <div className={'mt-20 flex-1 overflow-auto'}>{props.children}</div>
    </div>
  )
}

export default Layout
