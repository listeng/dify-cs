import { useCallback, useEffect, useMemo, useState } from 'react'
import Chat from '../chat'
import type {
  ChatConfig,
  ChatItem,
  ChatItemInTree,
  OnSend,
} from '../types'
import { useChat } from '../chat/hooks'
import { getLastAnswer, isValidGeneratedAnswer } from '../utils'
import { useEmbeddedChatbotContext } from './context'
import { isDify } from './utils'
import { InputVarType } from '@/app/components/workflow/types'
import { TransferMethod } from '@/types/app'
import InputsForm from '@/app/components/base/chat/embedded-chatbot/inputs-form'
import {
  fetchSuggestedQuestions,
  getUrl,
  stopChatMessageResponding,
} from '@/service/share'
import AppIcon from '@/app/components/base/app-icon'
import LogoAvatar from '@/app/components/base/logo/logo-embedded-chat-avatar'
import AnswerIcon from '@/app/components/base/answer-icon'
import SuggestedQuestions from '@/app/components/base/chat/chat/answer/suggested-questions'
import { Markdown } from '@/app/components/base/markdown'
import cn from '@/utils/classnames'
import type { FileEntity } from '../../file-uploader/types'
import Avatar from '../../avatar'

const ChatWrapper = () => {
  const {
    appData,
    appParams,
    appPrevChatList,
    currentConversationId,
    currentConversationItem,
    currentConversationInputs,
    inputsForms,
    newConversationInputs,
    newConversationInputsRef,
    handleNewConversationCompleted,
    isMobile,
    isInstalledApp,
    appId,
    appMeta,
    handleFeedback,
    currentChatInstanceRef,
    themeBuilder,
    clearChatList,
    setClearChatList,
    setIsResponding,
    allInputsHidden,
    initUserVariables,
    setAutoSendCallback,
    systemVariables,
  } = useEmbeddedChatbotContext()
  const appConfig = useMemo(() => {
    const config = appParams || {}

    return {
      ...config,
      file_upload: {
        ...(config as any).file_upload,
        fileUploadConfig: (config as any).system_parameters,
      },
      supportFeedback: true,
      opening_statement: currentConversationId ? currentConversationItem?.introduction : (config as any).opening_statement,
    } as ChatConfig
  }, [appParams, currentConversationItem?.introduction, currentConversationId])
  // 决定使用哪个inputs：当hideparams=1和isnew=1时，优先使用newConversationInputs（来自URL）
  const shouldAlwaysUseUrlInputs = systemVariables.hideparams === '1' && systemVariables.isnew === '1'
  const effectiveInputs = shouldAlwaysUseUrlInputs
    ? newConversationInputs
    : (currentConversationId ? currentConversationInputs : newConversationInputs)

  const {
    chatList,
    setTargetMessageId,
    handleSend,
    handleStop,
    isResponding: respondingState,
    suggestedQuestions,
  } = useChat(
    appConfig,
    {
      inputs: effectiveInputs as any,
      inputsForm: inputsForms,
    },
    appPrevChatList,
    taskId => stopChatMessageResponding('', taskId, isInstalledApp, appId),
    clearChatList,
    setClearChatList,
  )
  const inputsFormValue = currentConversationId ? currentConversationInputs : newConversationInputsRef?.current
  const inputDisabled = useMemo(() => {
    // hideparams=1 时不禁用输入框（允许继续发送）
    if (systemVariables.hideparams === '1')
      return false

    if (allInputsHidden)
      return false

    let hasEmptyInput = ''
    let fileIsUploading = false
    const requiredVars = inputsForms.filter(({ required }) => required)
    if (requiredVars.length) {
      requiredVars.forEach(({ variable, label, type }) => {
        if (hasEmptyInput)
          return

        if (fileIsUploading)
          return

        if (!inputsFormValue?.[variable])
          hasEmptyInput = label as string

        if ((type === InputVarType.singleFile || type === InputVarType.multiFiles) && inputsFormValue?.[variable]) {
          const files = inputsFormValue[variable]
          if (Array.isArray(files))
            fileIsUploading = files.find(item => item.transferMethod === TransferMethod.local_file && !item.uploadedId)
          else
            fileIsUploading = files.transferMethod === TransferMethod.local_file && !files.uploadedId
        }
      })
    }
    if (hasEmptyInput)
      return true

    if (fileIsUploading)
      return true
    return false
  }, [inputsFormValue, inputsForms, allInputsHidden, systemVariables.hideparams])

  useEffect(() => {
    if (currentChatInstanceRef.current)
      currentChatInstanceRef.current.handleStop = handleStop
  }, [currentChatInstanceRef, handleStop])
  useEffect(() => {
    setIsResponding(respondingState)
  }, [respondingState, setIsResponding])

  const doSend: OnSend = useCallback(async (message, files, isRegenerate = false, parentAnswer: ChatItem | null = null) => {
    console.log('[ChatWrapper] doSend called', { message, currentConversationId, isRegenerate })
    // 当hideparams=1和isnew=1时，始终从URL获取inputs参数
    const shouldAlwaysUseUrlInputs = systemVariables.hideparams === '1' && systemVariables.isnew === '1'
    let inputs
    if (shouldAlwaysUseUrlInputs) {
      // 从URL获取最新的inputs参数
      const { getProcessedInputsFromUrlParams } = await import('../utils')
      inputs = await getProcessedInputsFromUrlParams()
      console.log(`Using URL inputs due to hideparams=1 and isnew=1: ${JSON.stringify(inputs)}`)
    }
    else {
      inputs = currentConversationId ? currentConversationInputs : newConversationInputs
    }

    const data: any = {
      query: message,
      files,
      inputs,
      conversation_id: currentConversationId,
      parent_message_id: (isRegenerate ? parentAnswer?.id : getLastAnswer(chatList)?.id) || null,
    }

    console.log('[ChatWrapper] calling handleSend with data:', data)
    handleSend(
      getUrl('chat-messages', isInstalledApp, appId || ''),
      data,
      {
        onGetSuggestedQuestions: responseItemId => fetchSuggestedQuestions(responseItemId, isInstalledApp, appId),
        onConversationComplete: currentConversationId ? undefined : handleNewConversationCompleted,
        isPublicAPI: !isInstalledApp,
      },
    )
  }, [currentConversationId, currentConversationInputs, newConversationInputs, chatList, handleSend, isInstalledApp, appId, handleNewConversationCompleted, systemVariables.hideparams, systemVariables.isnew])

  // 注册doSend回调供postMessage使用
  useEffect(() => {
    setAutoSendCallback(doSend)
  }, [doSend, setAutoSendCallback])

  const doRegenerate = useCallback((chatItem: ChatItemInTree, editedQuestion?: { message: string, files?: FileEntity[] }) => {
    const question = editedQuestion ? chatItem : chatList.find(item => item.id === chatItem.parentMessageId)!
    const parentAnswer = chatList.find(item => item.id === question.parentMessageId)
    doSend(editedQuestion ? editedQuestion.message : question.content,
      editedQuestion ? editedQuestion.files : question.message_files,
      true,
      isValidGeneratedAnswer(parentAnswer) ? parentAnswer : null,
    )
  }, [chatList, doSend])

  const messageList = useMemo(() => {
    if (currentConversationId)
      return chatList
    return chatList.filter(item => !item.isOpeningStatement)
  }, [chatList, currentConversationId])

  const [collapsed, setCollapsed] = useState(!!currentConversationId)

  // 当systemVariables更新时，检查hideparams并更新collapsed状态
  useEffect(() => {
    const hideParams = systemVariables.hideparams === '1'
    console.log(`Collapsed state update: hideParams=${hideParams}, systemVariables=${JSON.stringify(systemVariables)}`)
    if (hideParams) {
      console.log('Setting collapsed=true due to hideparams=1')
      setCollapsed(true)
    }
  }, [systemVariables.hideparams])

  const chatNode = useMemo(() => {
    if (allInputsHidden || !inputsForms.length)
      return null
    if (isMobile) {
      if (!currentConversationId)
        return <InputsForm collapsed={collapsed} setCollapsed={setCollapsed} />
      return <div className='mb-4'></div>
    }
    else {
      return <InputsForm collapsed={collapsed} setCollapsed={setCollapsed} />
    }
  }, [inputsForms.length, isMobile, currentConversationId, collapsed, allInputsHidden])

  const welcome = useMemo(() => {
    const welcomeMessage = chatList.find(item => item.isOpeningStatement)
    if (respondingState)
      return null
    if (currentConversationId)
      return null
    if (!welcomeMessage)
      return null
    if (!collapsed && inputsForms.length > 0 && !allInputsHidden)
      return null
    if (welcomeMessage.suggestedQuestions && welcomeMessage.suggestedQuestions?.length > 0) {
      return (
        <div className={cn('flex items-center justify-center px-4 py-12', isMobile ? 'min-h-[30vh] py-0' : 'h-[50vh]')}>
          <div className='flex max-w-[720px] grow gap-4'>
            <AppIcon
              size='xl'
              iconType={appData?.site.icon_type}
              icon={appData?.site.icon}
              background={appData?.site.icon_background}
              imageUrl={appData?.site.icon_url}
            />
            <div className='body-lg-regular grow rounded-2xl bg-chat-bubble-bg px-4 py-3 text-text-primary'>
              <Markdown content={welcomeMessage.content} />
              <SuggestedQuestions item={welcomeMessage} />
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className={cn('flex h-[50vh] flex-col items-center justify-center gap-3 py-12', isMobile ? 'min-h-[30vh] py-0' : 'h-[50vh]')}>
        <AppIcon
          size='xl'
          iconType={appData?.site.icon_type}
          icon={appData?.site.icon}
          background={appData?.site.icon_background}
          imageUrl={appData?.site.icon_url}
        />
        <div className='max-w-[768px] px-4'>
          <Markdown className='!body-2xl-regular !text-text-tertiary' content={welcomeMessage.content} />
        </div>
      </div>
    )
  }, [appData?.site.icon, appData?.site.icon_background, appData?.site.icon_type, appData?.site.icon_url, chatList, collapsed, currentConversationId, inputsForms.length, respondingState, allInputsHidden])

  const answerIcon = isDify()
    ? <LogoAvatar className='relative shrink-0' />
    : (appData?.site && appData.site.use_icon_as_answer_icon)
      ? <AnswerIcon
        iconType={appData.site.icon_type}
        icon={appData.site.icon}
        background={appData.site.icon_background}
        imageUrl={appData.site.icon_url}
      />
      : null

  return (
    <Chat
      appData={appData}
      config={appConfig}
      chatList={messageList}
      isResponding={respondingState}
      chatContainerInnerClassName={cn('mx-auto w-full max-w-full pt-4 tablet:px-4', isMobile && 'px-4')}
      chatFooterClassName={cn('pb-4', !isMobile && 'rounded-b-2xl')}
      chatFooterInnerClassName={cn('mx-auto w-full max-w-full px-4', isMobile && 'px-2')}
      onSend={doSend}
      inputs={currentConversationId ? currentConversationInputs as any : newConversationInputs}
      inputsForm={inputsForms}
      onRegenerate={doRegenerate}
      onStopResponding={handleStop}
      chatNode={
        <>
          {chatNode}
          {welcome}
        </>
      }
      allToolIcons={appMeta?.tool_icons || {}}
      onFeedback={handleFeedback}
      suggestedQuestions={suggestedQuestions}
      answerIcon={answerIcon}
      hideProcessDetail
      themeBuilder={themeBuilder}
      switchSibling={siblingMessageId => setTargetMessageId(siblingMessageId)}
      inputDisabled={inputDisabled}
      isMobile={isMobile}
      questionIcon={
        initUserVariables?.avatar_url
          ? <Avatar
            avatar={initUserVariables.avatar_url}
            name={initUserVariables.name || 'user'}
            size={40}
          /> : undefined
      }
    />
  )
}

export default ChatWrapper
