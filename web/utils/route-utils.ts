import { basePath } from './var'

// 常用路由路径常量
export const ROUTE_PATHS = {
  HOME: '',
  SIGNIN: 'signin',
  SIGNUP: 'signup',
  APPS: 'apps',
  DATASETS: 'datasets',
  DATASETS_CREATE: 'datasets/create',
  TOOLS: 'tools',
  WORKFLOW: 'workflow',
  COMPLETION: 'completion',
  CHAT: 'chat',
  ACCOUNT: 'account',
  SETTINGS: 'settings',
  INSTALL: 'install',
  RESET_PASSWORD: 'reset-password',
  RESET_PASSWORD_CHECK_CODE: 'reset-password/check-code',
  RESET_PASSWORD_SET: 'reset-password/set-password'
} as const

type RoutePath = typeof ROUTE_PATHS[keyof typeof ROUTE_PATHS]

/**
 * 获取带有 basePath 的完整路径
 * @param path 不以斜杠开头的路径，例如 'webapp-signin'
 * @param params 可选的查询参数对象
 * @returns 完整的 URL 路径，包含 basePath 和查询参数
 */
export const getRoutePath = (path: string, params?: Record<string, string | number | boolean | null | undefined>): string => {
  // 确保 path 不以斜杠开头
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  
  // 处理查询参数
  const queryString = params 
    ? '?' + new URLSearchParams(
        Object.entries(params)
          .filter(([_, value]) => value != null) // 过滤掉 null 和 undefined
          .map(([key, value]) => [key, String(value)])
      ).toString()
    : ''
    
  return `${basePath}/${normalizedPath}${queryString}`
    .replace(/\/+/g, '/') // 移除连续的斜杠
    .replace(/([^:])\/+$/, '$1') // 移除路径末尾的斜杠
}

/**
 * 获取应用相关路径
 */
export const getAppPath = {
  // 应用概览
  overview: (appId: string) => getRoutePath(`app/${appId}/overview`),
  // 应用配置
  configuration: (appId: string) => getRoutePath(`app/${appId}/configuration`),
  // 应用日志
  logs: (appId: string, params?: Record<string, any>) => 
    getRoutePath(`app/${appId}/logs`, params),
  // 应用标注
  annotations: (appId: string) => getRoutePath(`app/${appId}/annotations`),
  // 工作流
  workflow: (appId: string) => getRoutePath(`app/${appId}/workflow`),
  // 调试
  debug: (appId: string) => getRoutePath(`app/${appId}/debug`),
  // API 访问
  api: (appId: string) => getRoutePath(`app/${appId}/api`)
}

/**
 * 获取数据集相关路径
 */
export const getDatasetPath = {
  // 数据集列表
  list: (params?: Record<string, any>) => getRoutePath(ROUTE_PATHS.DATASETS, params),
  // 创建数据集
  create: () => getRoutePath(ROUTE_PATHS.DATASETS_CREATE),
  // 数据集文档列表
  documents: (datasetId: string, params?: Record<string, any>) => 
    getRoutePath(`datasets/${datasetId}/documents`, params),
  // 创建文档
  createDocument: (datasetId: string) => 
    getRoutePath(`datasets/${datasetId}/documents/create`),
  // 文档详情
  documentDetail: (datasetId: string, documentId: string, tab?: string) => 
    getRoutePath(`datasets/${datasetId}/documents/${documentId}${tab ? `?tab=${tab}` : ''}`),
  // 文档设置
  documentSettings: (datasetId: string, documentId: string) =>
    getRoutePath(`datasets/${datasetId}/documents/${documentId}/settings`)
}

/**
 * 获取工具相关路径
 */
export const getToolPath = {
  // 工具列表
  list: (params?: Record<string, any>) => getRoutePath(ROUTE_PATHS.TOOLS, params),
  // 创建工作流工具
  createWorkflow: () => getRoutePath('tools/create/workflow')
}

/**
 * 获取账户相关路径
 */
export const getAccountPath = {
  // 账户设置
  settings: () => getRoutePath(ROUTE_PATHS.ACCOUNT),
  // 修改密码
  changePassword: () => getRoutePath('account/change-password'),
  // 修改邮箱
  changeEmail: () => getRoutePath('account/change-email'),
  // 删除账户
  deleteAccount: () => getRoutePath('account/delete-account')
}

// 导出常用路径的快捷方式
export const {
  HOME,
  SIGNIN,
  SIGNUP,
  APPS,
  DATASETS,
  TOOLS,
  WORKFLOW,
  COMPLETION,
  CHAT,
  ACCOUNT,
  SETTINGS,
  INSTALL,
  RESET_PASSWORD,
  RESET_PASSWORD_CHECK_CODE,
  RESET_PASSWORD_SET
} = ROUTE_PATHS

/**
 * 获取登录页面的完整路径
 * @param redirectUrl 登录后重定向的 URL
 * @param message 可选的错误消息
 * @param code 可选的状态码
 * @returns 完整的登录页面 URL
 */
export const getSigninPath = (
  redirectUrl: string = '',
  message?: string,
  code?: number
): string => {
  const baseNoSlash = basePath.replace(/^\/+/, '')

  const stripBasePrefix = (url: string): string => {
    if (!url) return url
    const trimmed = url.trim()
    // 移除一次性前缀 '/dnrai' 或 'dnrai'，仅当后面是结束或 '/'
    const pattern = new RegExp(`^(?:/${baseNoSlash}|${baseNoSlash})(?=$|/)`)
    return trimmed.replace(pattern, '')
  }

  const cleanedRedirect = stripBasePrefix(redirectUrl)

  const params: Record<string, string> = {}

  if (cleanedRedirect) {
    params.redirect_url = cleanedRedirect
  }

  if (message) {
    params.message = message
  }

  if (code !== undefined) {
    params.code = String(code)
  }

  return getRoutePath('webapp-signin', params)
}