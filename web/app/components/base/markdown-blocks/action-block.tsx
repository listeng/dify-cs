import React, { memo, useCallback } from 'react'
import Button from '@/app/components/base/button'
import { Target04 } from '@/app/components/base/icons/src/vender/solid/general'

interface ActionData {
  action: string
  data?: any
  label?: string
  autorun?: boolean
  debug?: boolean
  description?: string
  icon?: string
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost'
}

const ActionBlock = ({ content }: { content: string }) => {
  const handleActionClick = useCallback((actionData: ActionData) => {
    console.log('Action clicked:', actionData)
    
    // 1. 首先推送数据给父页面（如果在iframe中）
    try {
      // 检查是否在iframe中
      if (window.parent && window.parent !== window) {
        // 向父窗口发送postMessage
        window.parent.postMessage({
          type: 'dify-action-click',
          data: actionData,
          timestamp: Date.now(),
          source: 'dify-chat'
        }, '*')
        
        console.log('Action data sent to parent window:', actionData)
      }
      
      // 也发送给顶级窗口（防止多层iframe嵌套）
      if (window.top && window.top !== window) {
        window.top.postMessage({
          type: 'dify-action-click',
          data: actionData,
          timestamp: Date.now(),
          source: 'dify-chat'
        }, '*')
      }
    } catch (error) {
      console.warn('Failed to send message to parent window:', error)
    }
    
    // 2. 发送自定义DOM事件（用于当前页面内的组件通信）
    const event = new CustomEvent('actionButtonClick', {
      detail: actionData,
      bubbles: true
    })
    document.dispatchEvent(event)
    
    // 3. 执行内置操作（可选，根据需要保留或移除）
    switch (actionData.action) {
      case 'navigate':
        if (actionData.data?.url) {
          // 在iframe中可能需要让父页面处理导航
          if (window.parent && window.parent !== window) {
            // 已通过postMessage发送，让父页面决定如何处理
            console.log('Navigation request sent to parent')
          } else {
            window.open(actionData.data.url, '_blank')
          }
        }
        break
      case 'execute':
        // 执行特定操作 - 通常应该由父页面处理
        console.log('Execute action - should be handled by parent:', actionData.data)
        break
      case 'copy':
        if (actionData.data?.text) {
          navigator.clipboard.writeText(actionData.data.text)
            .then(() => console.log('Text copied to clipboard'))
            .catch(err => console.warn('Failed to copy text:', err))
        }
        break
      default:
        // 其他自定义操作已通过postMessage和事件发送
        console.log('Custom action sent to parent:', actionData.action)
    }
  }, [])

  const parseActionContent = useCallback((content: string): ActionData | null => {
    try {
      const trimmedContent = content.trim()
      const parsed = JSON.parse(trimmedContent)
      
      // 验证是否为有效的action格式
      if (typeof parsed === 'object' && parsed !== null && parsed.action) {
        return parsed as ActionData
      }
      
      return null
    } catch (error) {
      console.error('Failed to parse action content:', error)
      return null
    }
  }, [])

  const actionData = parseActionContent(content)

  if (!actionData) {
    return (
      <div className="p-4 bg-background-warning-subtle border border-divider-subtle rounded-lg">
        <p className="text-text-warning text-sm">无效的action格式</p>
        <pre className="text-xs text-text-tertiary mt-2 overflow-auto">
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
    return <Target04 className="w-4 h-4" />
  }

  return (
    <div className="p-4 bg-background-default-subtle border border-divider-subtle rounded-lg">
      <div className="flex flex-col gap-3">
        {actionData.description && (
          <p className="text-sm text-text-secondary">
            {actionData.description}
          </p>
        )}
        
        <div className="flex items-center gap-2">
          <Button
            variant={getButtonVariant()}
            size="md"
            onClick={() => handleActionClick(actionData)}
            className="flex items-center gap-2 p-2"
          >
            {getButtonIcon()}
            {actionData.label || actionData.action}
          </Button>
        </div>

        {actionData.debug (
          <details className="text-xs">
            <summary className="text-text-tertiary cursor-pointer hover:text-text-secondary">
              查看数据
            </summary>
            <pre className="mt-2 p-2 bg-background-default-subtle rounded text-text-tertiary overflow-auto">
              {JSON.stringify(actionData.data, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}

export default memo(ActionBlock)