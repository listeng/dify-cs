import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { useLocalStorageState } from 'ahooks'
import produce from 'immer'
import type {
  ChatConfig,
  ChatItem,
  Feedback,
} from '../types'
import { CONVERSATION_ID_INFO } from '../constants'
import { buildChatItemTree, getProcessedInputsFromUrlParams, getProcessedSystemVariablesFromUrlParams, getProcessedUserVariablesFromUrlParams } from '../utils'
import { getProcessedFilesFromResponse } from '../../file-uploader/utils'
import {
  fetchAppInfo,
  fetchAppMeta,
  fetchAppParams,
  fetchChatList,
  fetchConversations,
  generationConversationName,
  updateFeedback,
} from '@/service/share'
import type {
  // AppData,
  ConversationItem,
} from '@/models/share'
import { useToastContext } from '@/app/components/base/toast'
import { changeLanguage } from '@/i18n-config/i18next-config'
import { InputVarType } from '@/app/components/workflow/types'
import { TransferMethod } from '@/types/app'
import { addFileInfos, sortAgentSorts } from '@/app/components/tools/utils'
import { noop } from 'lodash-es'
import { useGetUserCanAccessApp } from '@/service/access-control'
import { useGlobalPublicStore } from '@/context/global-public-context'

function getFormattedChatList(messages: any[]) {
  const newChatList: ChatItem[] = []
  messages.forEach((item) => {
    const questionFiles = item.message_files?.filter((file: any) => file.belongs_to === 'user') || []
    newChatList.push({
      id: `question-${item.id}`,
      content: item.query,
      isAnswer: false,
      message_files: getProcessedFilesFromResponse(questionFiles.map((item: any) => ({ ...item, related_id: item.id }))),
      parentMessageId: item.parent_message_id || undefined,
    })
    const answerFiles = item.message_files?.filter((file: any) => file.belongs_to === 'assistant') || []
    newChatList.push({
      id: item.id,
      content: item.answer,
      agent_thoughts: addFileInfos(item.agent_thoughts ? sortAgentSorts(item.agent_thoughts) : item.agent_thoughts, item.message_files),
      feedback: item.feedback,
      isAnswer: true,
      citation: item.retriever_resources,
      message_files: getProcessedFilesFromResponse(answerFiles.map((item: any) => ({ ...item, related_id: item.id }))),
      parentMessageId: `question-${item.id}`,
    })
  })
  return newChatList
}

export const useEmbeddedChatbot = () => {
  const isInstalledApp = false
  const systemFeatures = useGlobalPublicStore(s => s.systemFeatures)
  const { data: appInfo, isLoading: appInfoLoading, error: appInfoError } = useSWR('appInfo', fetchAppInfo)
  const { isPending: isCheckingPermission, data: userCanAccessResult } = useGetUserCanAccessApp({
    appId: appInfo?.app_id,
    isInstalledApp,
  })

  const appData = useMemo(() => {
    return appInfo
  }, [appInfo])
  const appId = useMemo(() => appData?.app_id, [appData])

  const [userId, setUserId] = useState<string>()
  const [conversationId, setConversationId] = useState<string>()
  const [systemVariables, setSystemVariables] = useState<Record<string, any>>({})
  useEffect(() => {
    // 先检查原始URL参数
    const urlParams = new URLSearchParams(window.location.search)
        console.log(`Raw URL params: ${JSON.stringify(Object.fromEntries(urlParams))}`)

    getProcessedSystemVariablesFromUrlParams().then((vars) => {
      console.log(`SystemVariables parsed from URL: ${JSON.stringify(vars)}`)
      const { user_id, conversation_id, ...otherVars } = vars
      console.log(`SystemVariables after extraction: otherVars=${JSON.stringify(otherVars)}, user_id=${user_id}, conversation_id=${conversation_id}`)
      setUserId(user_id)
      setConversationId(conversation_id)
      setSystemVariables(otherVars)
    })
  }, [])

  useEffect(() => {
    const setLanguageFromParams = async () => {
      // Check URL parameters for language override
      const urlParams = new URLSearchParams(window.location.search)
      const localeParam = urlParams.get('locale')

      // Check for encoded system variables
      const systemVariables = await getProcessedSystemVariablesFromUrlParams()
      const localeFromSysVar = systemVariables.locale

      if (localeParam) {
        // If locale parameter exists in URL, use it instead of default
        changeLanguage(localeParam)
      }
      else if (localeFromSysVar) {
        // If locale is set as a system variable, use that
        changeLanguage(localeFromSysVar)
      }
      else if (appInfo?.site.default_language) {
        // Otherwise use the default from app config
        changeLanguage(appInfo.site.default_language)
      }
    }

    setLanguageFromParams()
  }, [appInfo])

  const [conversationIdInfo, setConversationIdInfo] = useLocalStorageState<Record<string, Record<string, string>>>(CONVERSATION_ID_INFO, {
    defaultValue: {},
  })
  const allowResetChat = !conversationId
  const currentConversationId = useMemo(() => {
    const effectiveAppId = appId || 'DEFAULT_APP'
    const result = conversationIdInfo?.[effectiveAppId]?.[userId || 'DEFAULT'] || conversationId || ''
    console.log(`currentConversationId calculation: conversationIdInfo=${conversationIdInfo?.[effectiveAppId]?.[userId || 'DEFAULT']}, urlConversationId=${conversationId}, result=${result}, appId=${appId}, userId=${userId}`)
    return result
  }, [appId, conversationIdInfo, userId, conversationId])
  const handleConversationIdInfoChange = useCallback((changeConversationId: string) => {
    console.log(`handleConversationIdInfoChange called: changeConversationId=${changeConversationId}, appId=${appId}, userId=${userId}`)
    if (appId) {
      let prevValue = conversationIdInfo?.[appId]
      if (typeof prevValue === 'string')
        prevValue = {}
      const newConversationIdInfo = {
        ...conversationIdInfo,
        [appId]: {
          ...prevValue,
          [userId || 'DEFAULT']: changeConversationId,
        },
      }
      console.log(`Setting conversationIdInfo: old=${JSON.stringify(conversationIdInfo)}, new=${JSON.stringify(newConversationIdInfo)}`)
      setConversationIdInfo(newConversationIdInfo)
    }
 else {
      console.log('Skipping conversationIdInfo update: appId is not available')
    }
  }, [appId, conversationIdInfo, setConversationIdInfo, userId])

  const [newConversationId, setNewConversationId] = useState('')
  const chatShouldReloadKey = useMemo(() => {
    if (currentConversationId === newConversationId)
      return ''

    return currentConversationId
  }, [currentConversationId, newConversationId])

  const { data: appParams } = useSWR(['appParams', isInstalledApp, appId], () => fetchAppParams(isInstalledApp, appId))
  const { data: appMeta } = useSWR(['appMeta', isInstalledApp, appId], () => fetchAppMeta(isInstalledApp, appId))
  const { data: appPinnedConversationData } = useSWR(['appConversationData', isInstalledApp, appId, true], () => fetchConversations(isInstalledApp, appId, undefined, true, 100))
  const { data: appConversationData, isLoading: appConversationDataLoading, mutate: mutateAppConversationData } = useSWR(['appConversationData', isInstalledApp, appId, false], () => fetchConversations(isInstalledApp, appId, undefined, false, 100))
  const { data: appChatListData, isLoading: appChatListDataLoading } = useSWR(chatShouldReloadKey ? ['appChatList', chatShouldReloadKey, isInstalledApp, appId] : null, () => fetchChatList(chatShouldReloadKey, isInstalledApp, appId))

  const [clearChatList, setClearChatList] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const appPrevChatList = useMemo(
    () => (currentConversationId && appChatListData?.data.length)
      ? buildChatItemTree(getFormattedChatList(appChatListData.data))
      : [],
    [appChatListData, currentConversationId],
  )

  const [showNewConversationItemInList, setShowNewConversationItemInList] = useState(false)

  const pinnedConversationList = useMemo(() => {
    return appPinnedConversationData?.data || []
  }, [appPinnedConversationData])
  const { t } = useTranslation()
  const newConversationInputsRef = useRef<Record<string, any>>({})
  const [newConversationInputs, setNewConversationInputs] = useState<Record<string, any>>({})
  const [initInputs, setInitInputs] = useState<Record<string, any>>({})
  const [initUserVariables, setInitUserVariables] = useState<Record<string, any>>({})
  const handleNewConversationInputsChange = useCallback((newInputs: Record<string, any>) => {
    newConversationInputsRef.current = newInputs
    setNewConversationInputs(newInputs)
  }, [])
    const inputsForms = useMemo(() => {
    // 当hideparams=1和isnew=1时，使用newConversationInputs作为default值源，确保表单不会被清空
    const shouldUseNewConversationInputs = systemVariables.hideparams === '1' && systemVariables.isnew === '1'
    const inputsSource = shouldUseNewConversationInputs ? newConversationInputs : initInputs

    console.log(`InputsForms calculation: shouldUseNewConversationInputs=${shouldUseNewConversationInputs}, inputsSource=${JSON.stringify(inputsSource)}, systemVariables=${JSON.stringify(systemVariables)}`)

    return (appParams?.user_input_form || []).filter((item: any) => !item.external_data_tool).map((item: any) => {
      if (item.paragraph) {
        let value = inputsSource[item.paragraph.variable]
        if (value && item.paragraph.max_length && value.length > item.paragraph.max_length)
          value = value.slice(0, item.paragraph.max_length)

        return {
          ...item.paragraph,
          default: value || item.default,
          type: 'paragraph',
        }
      }
      if (item.number) {
        const convertedNumber = Number(inputsSource[item.number.variable]) ?? undefined
        return {
          ...item.number,
          default: convertedNumber || item.default,
          type: 'number',
        }
      }
      if (item.select) {
        const isInputInOptions = item.select.options.includes(inputsSource[item.select.variable])
        return {
          ...item.select,
          default: (isInputInOptions ? inputsSource[item.select.variable] : undefined) || item.select.default,
          type: 'select',
        }
      }

      if (item['file-list']) {
        return {
          ...item['file-list'],
          type: 'file-list',
        }
      }

      if (item.file) {
        return {
          ...item.file,
          type: 'file',
        }
      }

      let value = inputsSource[item['text-input'].variable]
      if (value && item['text-input'].max_length && value.length > item['text-input'].max_length)
        value = value.slice(0, item['text-input'].max_length)

      return {
        ...item['text-input'],
        default: value || item.default,
        type: 'text-input',
      }
    })
  }, [initInputs, appParams, systemVariables.hideparams, systemVariables.isnew, newConversationInputs])

  const allInputsHidden = useMemo(() => {
    return inputsForms.length > 0 && inputsForms.every(item => item.hide === true)
  }, [inputsForms])

  useEffect(() => {
    // init inputs from url params
    (async () => {
      const inputs = await getProcessedInputsFromUrlParams()
      const userVariables = await getProcessedUserVariablesFromUrlParams()
      setInitInputs(inputs)
      setInitUserVariables(userVariables)
    })()
  }, [])
  // 直接使用 useMemo 计算 conversationInputs，避免 useEffect 中的状态更新
  const defaultConversationInputs = useMemo(() => {
    const conversationInputs: Record<string, any> = {}
    inputsForms.forEach((item: any) => {
      conversationInputs[item.variable] = item.default || null
    })
    return conversationInputs
  }, [inputsForms])

  // 只在 defaultConversationInputs 真正改变时才更新
  useEffect(() => {
    // 当hideparams=1和isnew=1时，不要重置newConversationInputs，保持URL参数
    if (systemVariables.hideparams === '1' && systemVariables.isnew === '1') {
      console.log('Skipping newConversationInputs reset due to hideparams=1 and isnew=1')
      return
    }

    const currentInputsStr = JSON.stringify(newConversationInputsRef.current)
    const newInputsStr = JSON.stringify(defaultConversationInputs)

    if (currentInputsStr !== newInputsStr) {
      console.log(`Updating newConversationInputs: from ${currentInputsStr} to ${newInputsStr}`)
      // 直接调用状态更新函数，避免依赖 handleNewConversationInputsChange
      newConversationInputsRef.current = defaultConversationInputs
      setNewConversationInputs(defaultConversationInputs)
    }
  }, [defaultConversationInputs, systemVariables.hideparams, systemVariables.isnew])

  const { data: newConversation } = useSWR(newConversationId ? [isInstalledApp, appId, newConversationId] : null, () => generationConversationName(isInstalledApp, appId, newConversationId), { revalidateOnFocus: false })
  const [originConversationList, setOriginConversationList] = useState<ConversationItem[]>([])
  useEffect(() => {
    if (appConversationData?.data && !appConversationDataLoading)
      setOriginConversationList(appConversationData?.data)
  }, [appConversationData, appConversationDataLoading])
  const conversationList = useMemo(() => {
    const data = originConversationList.slice()

    if (showNewConversationItemInList && data[0]?.id !== '') {
      data.unshift({
        id: '',
        name: t('share.chat.newChatDefaultName'),
        inputs: {},
        introduction: '',
      })
    }
    return data
  }, [originConversationList, showNewConversationItemInList, t])

  useEffect(() => {
    if (newConversation) {
      setOriginConversationList(produce((draft) => {
        const index = draft.findIndex(item => item.id === newConversation.id)

        if (index > -1)
          draft[index] = newConversation
        else
          draft.unshift(newConversation)
      }))
    }
  }, [newConversation])

  const currentConversationItem = useMemo(() => {
    let conversationItem = conversationList.find(item => item.id === currentConversationId)

    if (!conversationItem && pinnedConversationList.length)
      conversationItem = pinnedConversationList.find(item => item.id === currentConversationId)

    return conversationItem
  }, [conversationList, currentConversationId, pinnedConversationList])

  const currentConversationLatestInputs = useMemo(() => {
    if (!currentConversationId || !appChatListData?.data.length)
      return {}
    return appChatListData.data.slice().pop().inputs || {}
  }, [appChatListData, currentConversationId])
  const [currentConversationInputs, setCurrentConversationInputs] = useState<Record<string, any>>(currentConversationLatestInputs || {})
  useEffect(() => {
    // 当 hideparams=1 且 isnew=1 时，优先保留现有的 inputs，只有当后端返回的 latestInputs 非空时才合并更新
    if (systemVariables.hideparams === '1' && systemVariables.isnew === '1') {
      if (currentConversationLatestInputs && Object.keys(currentConversationLatestInputs).length > 0)
        setCurrentConversationInputs(prev => ({ ...prev, ...currentConversationLatestInputs }))
      return
    }
    if (currentConversationItem)
      setCurrentConversationInputs(currentConversationLatestInputs || {})
  }, [currentConversationItem, currentConversationId, currentConversationLatestInputs, systemVariables.hideparams, systemVariables.isnew]) // 使用currentConversationId而不是currentConversationLatestInputs避免循环

  const { notify } = useToastContext()
  const checkInputsRequired = useCallback((silent?: boolean) => {
    // 当hideparams=1时，跳过输入验证，直接返回true
    if (systemVariables.hideparams === '1') {
      console.log('Skipping input validation due to hideparams=1')
      return true
    }

    if (allInputsHidden)
      return true

    let hasEmptyInput = ''
    let fileIsUploading = false
    const requiredVars = inputsForms.filter(({ required }) => required)
    if (requiredVars.length) {
      requiredVars.forEach(({ variable, label, type }) => {
        if (hasEmptyInput)
          return

        if (fileIsUploading)
          return

        if (!newConversationInputsRef.current[variable] && !silent)
          hasEmptyInput = label as string

        if ((type === InputVarType.singleFile || type === InputVarType.multiFiles) && newConversationInputsRef.current[variable] && !silent) {
          const files = newConversationInputsRef.current[variable]
          if (Array.isArray(files))
            fileIsUploading = files.find(item => item.transferMethod === TransferMethod.local_file && !item.uploadedId)
          else
            fileIsUploading = files.transferMethod === TransferMethod.local_file && !files.uploadedId
        }
      })
    }

    if (hasEmptyInput) {
      notify({ type: 'error', message: t('appDebug.errorMessage.valueOfVarRequired', { key: hasEmptyInput }) })
      return false
    }

    if (fileIsUploading) {
      notify({ type: 'info', message: t('appDebug.errorMessage.waitForFileUpload') })
      return
    }

    return true
  }, [inputsForms, notify, t, allInputsHidden, systemVariables.hideparams])
  const handleStartChat = useCallback((callback?: any) => {
    if (checkInputsRequired()) {
      setShowNewConversationItemInList(true)
      callback?.()
    }
  }, [setShowNewConversationItemInList, checkInputsRequired])
  const currentChatInstanceRef = useRef<{ handleStop: () => void }>({ handleStop: noop })
  const handleChangeConversation = useCallback((conversationId: string) => {
    currentChatInstanceRef.current.handleStop()
    setNewConversationId('')
    handleConversationIdInfoChange(conversationId)
    if (conversationId)
      setClearChatList(false)
  }, [handleConversationIdInfoChange, setClearChatList])
  const handleNewConversation = useCallback(async () => {
    console.log('handleNewConversation called')
    currentChatInstanceRef.current.handleStop()
    setShowNewConversationItemInList(true)
    console.log('Calling handleChangeConversation with empty string')
    handleChangeConversation('')
    // 异步获取输入参数，使用getProcessedInputsFromUrlParams以支持压缩参数
    const inputs = await getProcessedInputsFromUrlParams()
    // 直接更新状态，避免循环依赖
    newConversationInputsRef.current = inputs
    setNewConversationInputs(inputs)
    setClearChatList(true)
    console.log('handleNewConversation completed')
  }, [handleChangeConversation, setShowNewConversationItemInList, setClearChatList])

  const handleNewConversationCompleted = useCallback((newConversationId: string) => {
    console.log(`handleNewConversationCompleted called: newConversationId=${newConversationId}`)
    console.log(`Setting currentConversationInputs to: ${JSON.stringify(newConversationInputsRef.current)}`)
    setNewConversationId(newConversationId)
    handleConversationIdInfoChange(newConversationId)
    setShowNewConversationItemInList(false)
    // 将newConversationInputs的值设置到currentConversationInputs中，确保后续消息发送时使用正确的inputs
    setCurrentConversationInputs(newConversationInputsRef.current || {})
    mutateAppConversationData()
  }, [mutateAppConversationData, handleConversationIdInfoChange, newConversationInputsRef, setCurrentConversationInputs])

  const handleFeedback = useCallback(async (messageId: string, feedback: Feedback) => {
    await updateFeedback({ url: `/messages/${messageId}/feedbacks`, body: { rating: feedback.rating } }, isInstalledApp, appId)
    notify({ type: 'success', message: t('common.api.success') })
  }, [isInstalledApp, appId, t, notify])

          // 自动开始对话：当hideparams=1时，在输入参数设置完成后自动开始对话
  useEffect(() => {
    const hideParams = systemVariables.hideparams === '1'
    console.log(`HideParams auto-start check: hideParams=${hideParams}, systemVariables=${JSON.stringify(systemVariables)}, inputsFormsLength=${inputsForms.length}, currentConversationId=${currentConversationId}`)

    if (hideParams && inputsForms.length > 0 && !currentConversationId) {
      console.log('Starting auto chat due to hideparams=1')
      // 延迟执行以确保所有参数都已设置完成
      const timer = setTimeout(() => {
        handleStartChat(() => {
          // 对话开始后的回调，这里可以添加额外的逻辑
        })
      }, 500)

      return () => clearTimeout(timer)
    }
  }, [inputsForms.length, currentConversationId, handleStartChat, systemVariables.hideparams])

  // PostMessage auto-send functionality
  const autoSendCallbackRef = useRef<((message: string, files?: any[]) => void) | null>(null)
  // Queue messages if callback not ready yet
  const pendingMessagesRef = useRef<Array<{ message: string, files?: any[] }>>([])
  const setAutoSendCallback = useCallback((callback: ((message: string, files?: any[]) => void) | null) => {
    autoSendCallbackRef.current = callback
    // flush queued messages once callback becomes available
    if (callback && pendingMessagesRef.current.length > 0) {
      const queued = pendingMessagesRef.current.slice()
      pendingMessagesRef.current = []
      for (const item of queued) {
        try {
          callback(item.message, item.files)
        }
 catch (err) {
          // swallow to avoid breaking subsequent flushes
          console.error('Auto-send queued message failed:', err)
        }
      }
    }
  }, [])

  // 使用useRef存储最新的检查函数，避免useEffect依赖频繁变化的值
  const checkInputsRef = useRef<() => boolean>(() => true)
  checkInputsRef.current = () => {
    // 已有会话时，允许直接发送
    if (currentConversationId) return true
    // hideparams=1 时跳过校验
    if (systemVariables.hideparams === '1') return true
    if (allInputsHidden) return true

    const requiredVars = inputsForms.filter(({ required }) => required)
    if (requiredVars.length) {
      return requiredVars.every(({ variable }) => {
        return newConversationInputsRef.current[variable]
      })
    }
    return true
  }

  useEffect(() => {
    const handlePostMessage = (event: MessageEvent) => {
      // 验证消息来源的安全性（可选）
      // if (event.origin !== 'https://trusted-parent-domain.com') return

      if (event.data && event.data.type === 'DIFY_CHAT_SEND_MESSAGE') {
        const { message, files = [] } = event.data
        console.log('[EmbeddedChatbot] received DIFY_CHAT_SEND_MESSAGE', {
          origin: event.origin,
          hasCallback: !!autoSendCallbackRef.current,
          currentConversationId,
          hideparams: systemVariables.hideparams,
        })
        const callback = autoSendCallbackRef.current
        if (message && typeof message === 'string' && callback) {
          // 使用ref中的最新检查函数
          const canSend = checkInputsRef.current?.() ?? true

          if (canSend) {
            console.log('[EmbeddedChatbot] auto-sending message via callback')
            callback(message, files)
          }
          else {
            console.warn('[EmbeddedChatbot] blocked by inputs requirement; message not sent')
          }
        }
        else if (message && typeof message === 'string' && !callback) {
          // Callback 尚未就绪时，排队等待 ChatWrapper 注册完成
          pendingMessagesRef.current.push({ message, files })
          console.log('[EmbeddedChatbot] queued message because callback not ready', { queueLength: pendingMessagesRef.current.length })
          // 尝试触发一次新会话初始化（在隐藏参数时无校验）
          if (systemVariables.hideparams === '1')
            handleStartChat()
        }
      }
    }

    window.addEventListener('message', handlePostMessage)
    return () => window.removeEventListener('message', handlePostMessage)
  }, [])

  return {
    appInfoError,
    appInfoLoading: appInfoLoading || (systemFeatures.webapp_auth.enabled && isCheckingPermission),
    userCanAccess: systemFeatures.webapp_auth.enabled ? userCanAccessResult?.result : true,
    isInstalledApp,
    allowResetChat,
    appId,
    currentConversationId,
    currentConversationItem,
    handleConversationIdInfoChange,
    appData,
    appParams: appParams || {} as ChatConfig,
    appMeta,
    appPinnedConversationData,
    appConversationData,
    appConversationDataLoading,
    appChatListData,
    appChatListDataLoading,
    appPrevChatList,
    pinnedConversationList,
    conversationList,
    setShowNewConversationItemInList,
    newConversationInputs,
    newConversationInputsRef,
    handleNewConversationInputsChange,
    inputsForms,
    handleNewConversation,
    handleStartChat,
    handleChangeConversation,
    handleNewConversationCompleted,
    newConversationId,
    chatShouldReloadKey,
    handleFeedback,
    currentChatInstanceRef,
    clearChatList,
    setClearChatList,
    isResponding,
    setIsResponding,
    currentConversationInputs,
    setCurrentConversationInputs,
    allInputsHidden,
    initUserVariables,
    setAutoSendCallback,
    systemVariables,
  }
}
