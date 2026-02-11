import { ComponentType } from 'react'
import type { Route } from './getRoutesFromFileStructure.ts'

/** 字符串路由的结构 */
export type RouteMap = {
  path: string
  components: { key: string; value: ComponentType<any> | null }[]
  children?: RouteMap
}[]

type RouteImports = Map<
  string,
  {
    code: string
    target: string
  }
>
/** 将路由转化为JS代码 */
export function convertRoutes2String(routes: Route[], routeImports?: RouteImports) {
  /** path=>import信息 */
  const currentRouteImports: RouteImports = routeImports ?? new Map()
  const stringRoutes =
    '[' +
    routes
      .map((route) => convertSingleRoute(route, currentRouteImports))
      .filter(Boolean)
      .join(',') +
    ']'
  return {
    /** 路由中需要的导入 */
    routeImports: currentRouteImports,
    /**
     * 字符串化的路由
     * 其类型会被解析为RouteMap
     */
    stringRoutes,
  }
}

/** 将其中一项路由转化为JS代码 */
function convertSingleRoute(route: Route, routeImports: RouteImports): string {
  return (
    '{' +
    [
      `path:'${route.path}'`,
      convertRouteComponent(route, routeImports),
      convertRouteChildren(route, routeImports),
    ]
      .filter(Boolean)
      .join(',') +
    '}'
  )
}

/** 将一项路由的children转化为JS代码 */
function convertRouteChildren(route: Route, routeImports: RouteImports) {
  if (!route.children) return null
  return `children:${convertRoutes2String(route.children, routeImports).stringRoutes}`
}

/** 将一项路由的component转化为JS代码 */
function convertRouteComponent(route: Route, routeImports: RouteImports) {
  // 根据路由类型跳转指定的文件
  const componentKeys = (() => {
    switch (route.type) {
      case 'wrapper':
        return ['layout', 'error', 'loading']
      case 'page':
        return ['page']
      case 'rest':
        return ['layout', 'error', 'loading', 'page']
    }
  })()
  const mode = getImportMode(route)
  const components = componentKeys
    .map((key) => ({ key, filePath: route.components.get(key) }))
    .map((item) => {
      // 所有可选组件都展示出来 缺失的用null填补
      const value = item.filePath
        ? convertImportCode(mode, item.filePath, routeImports)
        : 'undefined'
      return `{key:'${item.key}',value: ${value}}`
    })
  if (components.length === 0) return null
  return `components:[${components.join(',')}]`
}

type ImportMode = 'sync' | 'async'

/** 获取导入语句 */
function convertImportCode(mode: ImportMode, filePath: string, routeImports: RouteImports) {
  if (!routeImports.has(filePath)) {
    const target = `Target${routeImports.size}`
    const code =
      mode === 'sync'
        ? `import ${target} from '${filePath}';`
        : `const ${target} = lazy(()=>import('${filePath}'));`
    routeImports.set(filePath, { code, target })
  }
  const target = routeImports.get(filePath)!.target
  return `${target}`
}

/**
 * 导入策略
 * '/'路径的layout error loading才会被静态导入
 */
function getImportMode(route: Route): ImportMode {
  // pages/下的所有组件全部动态导入 由全局suspense处理
  return 'async'
  if (route.path === '/' && route.type === 'wrapper') {
    return 'sync'
  }
  return 'async'
}
