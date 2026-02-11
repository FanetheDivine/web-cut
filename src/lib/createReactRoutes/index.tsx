import { ComponentType, ReactNode } from 'react'
import { FallbackProps } from 'react-error-boundary'
import { Outlet, RouteObject } from 'react-router'
import { match, P } from 'ts-pattern'
import type { RouteMap } from '~pages'
import { withErrorBoundary, withSuspense } from '@/utils'

/**
 * 创建react-router路由
 * @param routeMap 由vite-fs-router-plugin生成的路由信息
 * @param config 配置项
 * @example
 * ```
 * import { BrowserRouter, useRoutes } from 'react-router'
 * import { createReactRoutes } from '@/lib/createReactRoutes'
 * import routeMap from '~pages'
 *
 * const App = () => useRoutes(createReactRoutes(routeMap))
 * createRoot(document.getElementById('root')!).render(<BrowserRouter><App /></BrowserRouter>)
 * ```
 */
export function createReactRoutes(
  routeMap: RouteMap,
  config: {
    /** 默认的ErrorBoundary fallback组件 */
    defaultErrorComponent?: ComponentType<FallbackProps>
    /** 默认的Suspense fallback */
    defaultLoading?: ReactNode
  } = {},
): RouteObject[] {
  function convertRouteMap(routeMap?: RouteMap): RouteObject[] | undefined {
    const { defaultErrorComponent, defaultLoading } = config
    if (!routeMap || routeMap.length === 0) return undefined
    const res: RouteObject[] = routeMap.map(function (item): RouteObject {
      const element = createComboCompElement(item.components, defaultErrorComponent, defaultLoading)

      if (!item.path) {
        return {
          index: true,
          element,
        }
      }
      const children = convertRouteMap(item.children)
      if (/^\(.*\)$/.test(item.path)) {
        // 形如 (withAuth) 不影响url
        return {
          element,
          children,
        }
      }
      return {
        path: item.path,
        element,
        children,
      }
    })
    return res
  }
  const routes = convertRouteMap(routeMap)
  return routes ?? []
}

/**
 * 做如下转换\
 * [Comp1,Comp2] -> `<Comp1><Comp2><Outlet/></Comp2><Comp1>`\
 * 对于key为error的组件 使用ErrorBoundary\
 * 对于key为loading的组件 使用Suspense\
 * 对于key为layout的组件 直接包裹\
 * 其他组件不会包裹<Outlet/> 而是仅仅构造该组件对应的ReactNode
 */
function createComboCompElement(
  comps?: RouteMap[number]['components'],
  defaultErrorComponent?: ComponentType<FallbackProps>,
  defaultLoading?: ReactNode,
): ReactNode {
  if (!comps || comps.length === 0) return null

  let ResultComp: ReactNode = <Outlet />
  // 数组头是外部组件 尾是内部组件 需要自内向外构造组件包裹关系
  comps.toReversed().forEach((item) => {
    match(item)
      // key为layout 值存在 用当前组件包裹ResultComp
      .with({ key: 'layout', value: P.nonNullable.select() }, (CurrentComp) => {
        ResultComp = <CurrentComp>{ResultComp}</CurrentComp>
      })
      // key为error 有fallback组件的 使用errorboundary包裹ResultComp
      .with({ key: 'error', value: P.select() }, (CurrentComp) => {
        const FallbackComponent = CurrentComp ?? defaultErrorComponent
        if (FallbackComponent) {
          ResultComp = withErrorBoundary(ResultComp, { FallbackComponent })
        }
      })
      // key为loading 有fallback的 使用suspense包裹ResultComp
      .with({ key: 'loading', value: P.select() }, (CurrentComp) => {
        const fallback = CurrentComp ? <CurrentComp /> : defaultLoading
        if (fallback) {
          ResultComp = withSuspense(ResultComp, fallback)
        }
      })
      // 其他类型的 使用当前组件替换子组件
      .with({ value: P.nonNullable.select() }, (CurrentComp) => {
        ResultComp = <CurrentComp />
      })
      .otherwise(() => {})
  })

  return ResultComp
}
