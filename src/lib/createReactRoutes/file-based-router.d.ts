declare module '~pages' {
  import { ComponentType } from 'react'

  export type RouteMap = {
    path: string
    components: { key: string; value: ComponentType<any> | null }[]
    children?: RouteMap
  }[]

  /** vite-fs-router-plugin收集的文件路由信息 */
  const routeMap: RouteMap

  export default routeMap
}
