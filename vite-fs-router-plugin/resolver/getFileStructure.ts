export type Directory = {
  /** 文件夹名 */
  dirName: string
  /** 本文件夹内的文件名及其路径 fileName=>path */
  files: Map<string, string>
  /** 子文件夹名及其路径 dirName=>dir */
  children: Map<string, Directory>
}
/**
 * 根据路径数组创建文件结构
 * @param paths 路径数组
 * @param pageSrc 不参与解析的根路径
 */
export function getFileStructure(paths: readonly string[], pageSrc: string): Directory {
  const fileStructure: Directory = {
    dirName: '/',
    files: new Map(),
    children: new Map(),
  }
  paths.forEach((path) => {
    const pathSplitList = path.replace(pageSrc, '').split('/')
    const dirNames = pathSplitList.slice(0, -1)
    const fileName = pathSplitList.at(-1)!.split('.')[0]
    let currentDir = fileStructure
    let currentIndex = 1
    while (currentIndex < dirNames.length) {
      const dirName = dirNames[currentIndex]
      if (!currentDir.children.has(dirName)) {
        currentDir.children.set(dirName, {
          dirName,
          files: new Map(),
          children: new Map(),
        })
      }
      currentDir = currentDir.children.get(dirName)!
      ++currentIndex
    }
    currentDir.files.set(fileName, path)
  })
  return fileStructure
}
