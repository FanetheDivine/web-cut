import { FC } from 'react'
import { FallbackProps } from 'react-error-boundary'
import { useRouteError } from 'react-router'
import { Button } from 'antd'

const Error: FC<FallbackProps> = (props) => {
  const error1 = useRouteError()
  console.log(error1)
  const { resetErrorBoundary, error } = props
  return (
    <div className='flex flex-col gap-2'>
      error:{error.message}
      <Button onClick={resetErrorBoundary}>reset</Button>
    </div>
  )
}

export default Error
