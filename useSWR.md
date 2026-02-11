# useSWR的使用

`useSWR`用于简化数据获取流程

## 基本用法

```ts
const { data, error, isLoading, isValidating, mutate } = useSWR(key, fetcher, option)
```

`useSWR`的工作流程

- 以`key`查询全局缓存
- 如果没有命中缓存,则以`key`为参数调用`fetcher`
- 如果命中缓存,则返回缓存数据
- 如果缓存过期,调用`fetcher`获取最新数据,更新缓存和`data`
- 在页面聚焦等时刻,`useSWR`会自动调用`fetcher`更新缓存和`data`
- `useSWR`会自动处理竞态和防抖等,确保数据始终是最新的,且请求频率受限

更直观的工作流程请查看[文档](https://swr.vercel.app/zh-CN/docs/advanced/understanding)

对于`useSWR`返回值的说明

- 当`fetcher`抛出异常,它的错误会作为`error`出现
- 只要有一个`fetcher`正在执行中,`isValidating`为true
- 仅当数据未加载且有`fetcher`正在执行中,`isLoading`为true(即没命中缓存并调用`fetcher`的时候)
- `useSWR`的`key`变化后,`data`不会保留
- `useSWR`虽然返回多个值,但是只有被使用的值才会引起组件渲染
  ```ts
  const { data } = useSWR(xxx)
  ```
  这里只访问了返回值的`data`属性,那么`isLoading` `isValidating`等的变化不会引发组件的重新渲染.

对`mutate`的说明

- 无参数调用`mutate`会重新启用数据校验
- `mutate(newData,options)`,此时`data`会被立刻设置为`newData`(即使是`undefined`),并按照`options`执行后续
- 如果`newData`是`undefined`, 且`options.populateCache`是`true`(默认值),那么当前`key`的缓存会被清空,后续不会被命中

对`key`的说明:

- `key`可以是字符串、对象和数组,它会被转化为一个哈希值用于查询缓存.也可以是获取这些数据的`getter`函数.可以以api+参数的形式组装`key`
- `useSWR`会根据`key`的类型对`fetcher`的参数做自动推断,如果遇到不能推断的情况,可以尝试将`key`转化为相应的`getter`函数
- 如果`key`是`false` `null` `undefined`,则本次数据获取终止,既不查询缓存也不发起请求.如果`key`是`getter`函数,当它抛出异常,或者返回这些空值时,数据获取也会中止.(这种情况不会被视作loading)
- 基于上一条 衍生出一种依赖请求方式

  ```ts
  declare const data: Data | undefined

  useSWR(() => data!.id, fetcher)
  ```

  如果`data`为`undefined` 那么`getter`函数会爆出异常 `useSWR`便会知道请求的条件尚不满足  
  `data`可以是其他useSWR获取的数据

## suspense模式

```ts
const { data, error, isLoading, isValidating, mutate } = useSWR(key, fetcher, { suspense: true })
```

此时 `data`将始终有值 并将loading和error向外抛出 这个模式非常适合基于文件的路由

说明:

- 常规情况下`isLoading=true`时,suspense模式下会进入`Suspense`.即，仅在没有命中缓存的情况下进入`Suspense`
- 如果`key`是空值,或者`key`的`getter`函数返回空值、抛出异常,useSWR不会进入`loading`,无法进入`Suspense`.此时`data`可能为`undefined`
- 如果`keepPreviousData: true`,key变化的时候data保留上一次的值,此时不会进入suspense
- 调用`mutate`时,只有其参数1是`undefined`,且`options.populateCache`是`true`(默认值),才会进入suspense

## useSWRImmutable

默认的情况下,缓存过期、重新联网、重新聚焦网页时,都会重新请求数据,但这个`useSWRImmutable`不会如此.  
用于获取不需要更新的数据

```ts
import useSWRImmutable from 'swr/immutable'

useSWRImmutable(key, fetcher, options)
// 与上面的代码完全等效
useSWR(key, fetcher, {
  revalidateIfStale: false,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
})
```

## preload

预加载某些数据

## useSWRMutation

用于提交变更而非获取数据的场景

```ts
import useSWRMutation from 'swr/mutation'

const { trigger, data, error, isMutating, reset } = useSWRMutation(key, fetcher, options)
```

不会被自动获取数据,只能通过`trigger`手动获取  
没有suspense模式

对于返回值的说明:

- `useSWR`中,相同`key`的返回值都是相同的,但是`useSWRMutation`的返回值都各自独立
- `data` `error`与`useSWR`相同
- `isMutating`当前hook的`fetcher`是否正在被调用
- `reset`重置当前hook的状态
- `trigger`调用`fetcher`.参数1会被作为`fetcher`参数2的一部分,参数2是配置
- 虽然`data`是独立存在的,但是`useSWRMutation`可以访问`useSWR`的缓存,不会出现竞态问题

可以把这个hook理解为`fetcher`与`error`、`loading`两个state以及它们间逻辑的聚合
