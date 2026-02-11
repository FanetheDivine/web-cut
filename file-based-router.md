# 基于文件结构的路由

使用插件`vite-fs-router-plugin`,将`src/pages`转化为嵌套结构,再用`@/lib/createReactRoutes`会将其转化为`react-router`可用的路由.  
在项目开发中,不再需要构造路由对象,只需要按照转化规则摆放文件即可,完美适配`useSWR`的`Suspense`模式.

## 文件结构到路由的转化规则

### 合法的文件

文件名为`layout` `error` `loading` `page` `404`,拓展名为`tsx` `ts` `jsx` `js` `vue`的文件,会被插件收集.这些文件应当默认导出一个`react`组件.

`error.tsx`应当默认导出类型为`FC<FallbackProps>`的组件以接受`ErrorBoundary`提供的错误信息.不要使用`useRouteError`.

### 构造路由

上述的合法文件会形成这样的路由结构

```js
import Layout from 'layout'
import Error from 'error'
import Loading from 'loading'
import Page from 'page'

const routes = [
  path:'/'
  element:(
    <Layout>
      <ErrorBoundary FallbackComponent={Error}>
        <Suspense fallback={<Loading/>}>
          <Outlet/>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  ),
  children:[
    { index:true, element: <Page/> },
  ],
]
```

`layout`应当接受一个参数`children`,像`<Outlet/>`那样使用即可  
`error`则会由`ErrorBoundary`提供类型为`FallbackProps`的props  
如果没有相应的文件 就不会构造对应的层级.例如 没有`error`,`ErrorBoundary`就不存在,连`page`也可以没有  
`src/pages`对应于路由`/`其子文件夹的路由则是相对`src/pages`的路径

404页面在index.tsx中 全局唯一

### 动态参数和剩余参数

`src/pages/[id]/xxx`会被转化为 `{ path:':id',xxx }`,可以通过以下方式获取路径参数

```ts
import { useParams } from 'react-router'

const { id } = useParams()
```

`[...]/xxx`表示接受剩余全部的路径参数

```ts
import { useParams } from 'react-router'

const { '*': rest } = useParams()
```

### 功能性路由

用括号包裹的路由不会增加路径 例如 `src/pages/(withAuth)/test` 对应的路径依旧是 `/test`  
它的作用是在不增加url复杂度的情况下 做功能的聚合(鉴权等)
除了不改变url之外 功能性路由和常规路由完全一致 但它和它上一级路由的`page`会冲突

### 导入方式

只有`src/pages`的`layout` `error` `loading`是静态导入 其余是动态导入

### 默认error和loading

`@/lib/createReactRoutes`的第2、3个参数,用于指定默认的`error`和`loading`
