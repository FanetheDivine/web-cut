import Pages, { PageContext } from 'vite-plugin-pages'
import { convertRoutes2String } from './resolver/convertRoutes2String.js'
import { getFileStructure } from './resolver/getFileStructure.js'
import { getRoutesFromFileStructure } from './resolver/getRoutesFromFileStructure.js'

/** 可被解析为路由的文件名 */
const legalFileNames = ['page', 'loading', 'error', 'layout']

export type PagesPluginOptions = {
  /**
   * 从这个路径获取文件结构解析结果
   * @example '~react-pages'
   */
  module?: string
  /**
   * 页面文件的根目录
   * @example '/src/pages'
   */
  pageSrc?: string
  /**
   * 可被解析为路由的文件拓展名
   * @example ['tsx', 'jsx', 'ts', 'js', 'vue']
   */
  extensions?: string[]
  /**
   * lazy函数的导入语句
   * @example "import { lazy } from 'react';"
   */
  lazyImport?: string
}
export default function PagesPlugin(options: PagesPluginOptions = {}) {
  const {
    module = '~pages',
    pageSrc = '/src/pages',
    extensions = ['tsx', 'jsx', 'ts', 'js', 'vue'],
    lazyImport = "import { lazy } from 'react';",
  } = options

  /** 将文件结构解析为路由 */
  function getComputedRoutes(ctx: PageContext) {
    /**
     * src所处的目录
     * @example '/workspaces/solid-template'
     */
    const root = ctx.root
    /**
     * Map类型 key是所有src/pages下的所有.tsx文件的绝对路径
     * 例如'/workspaces/solid-template/src/pages/page.tsx'
     */
    const pageRouteMap = ctx.pageRouteMap
    const paths = [...pageRouteMap.keys()]
      .map((path) => path.replaceAll(root, ''))
      .filter((path) => {
        // 名称必须在legalFileNames中 拓展名必须在extensions中
        return legalFileNames.some((name) => {
          return extensions.some((ex) => path.endsWith(`${name}.${ex}`))
        })
      })
    paths.forEach((path) => {
      if (path.includes("'")) throw new Error(`${path}文件路径不能包含单引号(')`)
    })
    const fileStructure = getFileStructure(paths, pageSrc)
    const routes = getRoutesFromFileStructure(fileStructure)
    return [routes]
  }

  /** 将解析结果转化为合法的js文件 */
  function resolveRoutes(ctx: PageContext) {
    // 获取路由
    const routes = getComputedRoutes(ctx)
    // 生成文件内容
    const baseImport = [lazyImport]
    const { routeImports, stringRoutes } = convertRoutes2String(routes)
    const importCodes = Array.from(routeImports.values())
      .map((item) => item.code)
      .sort((code1, code2) => {
        const [num1, num2] = [code1, code2].map((code) => (code.startsWith('import') ? 0 : 1))
        return num1 - num2
      })
    const codes = [
      ...baseImport,
      ...importCodes,
      `const routeMap = ${stringRoutes};`,
      'export default routeMap',
    ]
    const fileContent = codes.join('\n')
    return fileContent
  }

  return Pages({
    resolver: {
      resolveModuleIds: () => [module],
      resolveExtensions: () => extensions,
      resolveRoutes: resolveRoutes,
      getComputedRoutes: getComputedRoutes,
    },
  })
}
