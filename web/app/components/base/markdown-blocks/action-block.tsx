import * as React from 'react'
import { memo, useCallback, useEffect } from 'react'
import Button from '@/app/components/base/button'
import { Target04 } from '@/app/components/base/icons/src/vender/solid/general'

type ActionPayload = Record<string, unknown>

type ActionData = {
  action: string
  data?: ActionPayload
  label?: string
  autorun?: boolean
  debug?: boolean
  description?: string
  icon?: string
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost'
}

const ActionBlock = ({ content }: { content: string }) => {
  const handleActionClick = useCallback((actionData: ActionData) => {
    // 1. 首先推送数据给父页面（如果在iframe中）
    try {
      // 检查是否在iframe中
      if (window.parent && window.parent !== window) {
        // 向父窗口发送postMessage
        window.parent.postMessage({
          type: 'dify-action-click',
          data: actionData,
          timestamp: Date.now(),
          source: 'dify-chat',
        }, '*')
      }

      // 也发送给顶级窗口（防止多层iframe嵌套）
      if (window.top && window.top !== window) {
        window.top.postMessage({
          type: 'dify-action-click',
          data: actionData,
          timestamp: Date.now(),
          source: 'dify-chat',
        }, '*')
      }
    }
    catch (error) {
      console.warn('Failed to send message to parent window:', error)
    }

    // 2. 发送自定义DOM事件（用于当前页面内的组件通信）
    const event = new CustomEvent('actionButtonClick', {
      detail: actionData,
      bubbles: true,
    })
    document.dispatchEvent(event)

    // 3. 执行内置操作（可选，根据需要保留或移除）
    switch (actionData.action) {
      case 'navigate':
        if (typeof actionData.data?.url === 'string') {
          // 在iframe中可能需要让父页面处理导航
          if (window.parent === window)
            window.open(actionData.data.url, '_blank')
        }
        break
      case 'execute':
        break
      case 'copy':
        if (typeof actionData.data?.text === 'string') {
          navigator.clipboard.writeText(actionData.data.text)
            .catch(err => console.warn('Failed to copy text:', err))
        }
        break
    }
  }, [])

  const parseActionContent = useCallback((content: string): ActionData | null => {
    try {
      const trimmedContent = content.trim()
      const parsed = JSON.parse(trimmedContent)

      // 验证是否为有效的action格式
      if (typeof parsed === 'object' && parsed !== null && parsed.action)
        return parsed as ActionData

      return null
    }
    catch (error) {
      console.error('Failed to parse action content:', error)
      return null
    }
  }, [])

  const actionData = parseActionContent(content)

  // 如果 autorun 为 true，组件渲染后自动执行 action
  useEffect(() => {
    if (actionData && actionData.autorun)
      handleActionClick(actionData)
  }, [actionData, handleActionClick])

  if (!actionData) {
    return (
      <div className="bg-background-warning-subtle rounded-lg border border-divider-subtle p-4">
        <p className="text-sm text-text-warning">无效的action格式</p>
        <pre className="mt-2 overflow-auto text-xs text-text-tertiary">
          {content}
        </pre>
      </div>
    )
  }

  const getButtonVariant = () => {
    return actionData.variant || 'primary'
  }

  const getButtonIcon = () => {
    // 可以根据action类型返回不同图标
    return <Target04 className="h-4 w-4" />
  }

  return (
    <div className="rounded-lg border border-divider-subtle bg-background-default-subtle p-4">
      <div className="flex flex-col gap-3">
        {actionData.description && (
          <p className="text-sm text-text-secondary">
            {actionData.description}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant={getButtonVariant()}
            size="medium"
            onClick={() => handleActionClick(actionData)}
            className="flex items-center gap-2 rounded px-2 py-1"
          >
            {getButtonIcon()}
            {actionData.label || actionData.action}
          </Button>
        </div>

        {actionData.debug && (
          <details className="text-xs">
            <summary className="cursor-pointer text-text-tertiary hover:text-text-secondary">
              查看数据
            </summary>
            <pre className="mt-2 overflow-auto rounded bg-background-default-subtle p-2 text-text-tertiary">
              {JSON.stringify(actionData.data, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}

export default memo(ActionBlock)
