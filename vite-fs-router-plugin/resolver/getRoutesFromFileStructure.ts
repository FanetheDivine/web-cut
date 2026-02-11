import type { Directory } from './getFileStructure.ts'

/** 路由的路径参数类型: 剩余参数、动态参数、无参数 */
export type pathType = 'rest' | 'dynamic' | 'common'

export type Route = {
  /** 文件路径 */
  path: string
  pathType: pathType
  children?: Route[]
  /**
   * 组件类型
   * layout loading error为wrapper 需要包裹其他组件
   * page为page 直接提供内容
   * 如果本级路由是剩余参数 则为rest
   */
  type: 'wrapper' | 'page' | 'rest'
  /** 当前路由的所有文件 */
  components: Directory['files']
}
/** 根据文件结构创建路由 */
export function getRoutesFromFileStructure(fileStructure: Directory): Route {
  const { path, pathType } = getPathFromDirName(fileStructure.dirName)
  if (pathType === 'rest') {
    // 剩余参数不继续向下构建 直接在本级设置组件
    const route: Route = {
      path,
      pathType,
      type: 'rest',
      components: fileStructure.files,
    }
    return route
  }

  // 依次向children中加入以下路由 page 静态子路由 动态子路由 剩余子路由
  const route: Route = {
    path,
    pathType,
    type: 'wrapper',
    components: fileStructure.files,
  }

  if (fileStructure.files.get('page')) {
    if (!route.children) route.children = []
    route.children.push({
      path: '',
      pathType: 'common',
      type: 'page',
      components: fileStructure.files,
    })
  }

  // 子文件夹(子路由) 按照 普通路由、动态参数、剩余参数排序 并递归生成路由
  const childrenRoutes = [...fileStructure.children.values()]
    .map(getRoutesFromFileStructure)
    .sort((route1, route2) => {
      const map = {
        common: 1,
        dynamic: 2,
        rest: 3,
      }
      const num1 = map[route1.pathType]
      const num2 = map[route2.pathType]
      return num1 - num2
    })
  if (childrenRoutes.length > 0) {
    if (!route.children) route.children = []
    route.children.push(...childrenRoutes)
  }

  return route
}

/** 将文件夹名转化路由path */
function getPathFromDirName(dirName: string): {
  path: string
  pathType: pathType
} {
  // [...]表示剩余参数
  if (dirName === '[...]') return { path: '*', pathType: 'rest' }
  // [id] => :id 动态参数
  const res = /^\[(.+)\]$/.exec(dirName)
  // 无参数
  if (res?.[1]) return { path: `:${res[1]}`, pathType: 'dynamic' }
  return { path: dirName, pathType: 'common' }
}
