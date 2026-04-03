'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Loader2, Mic, Send, Sparkles, Square, X } from 'lucide-react'

import { useAuth } from '@/app/context/AuthContext'
import {
  ChatRole,
  getChatPlaceholder,
  getChatQuickPrompts,
  getChatWelcomeMessage,
  isChatRole,
} from '@/app/support/chat-config'

type ChatMessage = {
  sender: 'user' | 'bot'
  text: string
}

export function StPeterBuddyChat({
  variant = 'page',
  onClose,
}: {
  variant?: 'page' | 'widget'
  onClose?: () => void
}) {
  const { user } = useAuth()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null)
  const [chatRole, setChatRole] = useState<ChatRole | null>(user?.user_role ?? null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'bot',
      text: getChatWelcomeMessage(user?.user_role ?? null),
    },
  ])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    const resolvedRole = user?.user_role ?? null
    setChatRole(resolvedRole)
    setMessages((prev) => {
      if (prev.length !== 1 || prev[0]?.sender !== 'bot') {
        return prev
      }
      return [{ sender: 'bot', text: getChatWelcomeMessage(resolvedRole) }]
    })
  }, [user?.user_role])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const quickPrompts = useMemo(() => getChatQuickPrompts(chatRole), [chatRole])

  const pushBotMessage = (text: string) => {
    setMessages((prev) => [...prev, { sender: 'bot', text }])
  }

  const stopMicrophoneTracks = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
    mediaRecorderRef.current = null
  }

  const transcribeVoiceQuestion = async (audioBlob: Blob) => {
    const formData = new FormData()
    const extension = audioBlob.type.includes('ogg')
      ? 'ogg'
      : audioBlob.type.includes('mp4')
        ? 'mp4'
        : 'webm'
    formData.append('audio', audioBlob, `st-peter-buddy-question.${extension}`)

    const token = localStorage.getItem('token')
    const response = await fetch('/api/support/transcribe', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    })

    const data = (await response.json()) as {
      transcript?: string
      detail?: string
    }

    if (!response.ok || !data.transcript) {
      throw new Error(data.detail || 'Voice transcription failed')
    }

    return data.transcript.trim()
  }

  const sendMessage = async (messageOverride?: string) => {
    const userMessage = (messageOverride ?? input).trim()
    if (!userMessage || isLoading || (isTranscribing && !messageOverride)) return

    const history = messages.slice(-8).map(({ sender, text }) => ({ sender, text }))
    setMessages((prev) => [...prev, { sender: 'user', text: userMessage }])
    setInput('')
    setIsLoading(true)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/support/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage,
          role: chatRole ?? undefined,
          history,
        }),
      })

      const data = (await response.json()) as {
        reply?: string
        role?: string | null
        detail?: string
      }

      if (!response.ok) {
        throw new Error(data.detail || 'Support request failed')
      }

      if (isChatRole(data.role)) {
        setChatRole(data.role)
      }

      pushBotMessage(
        data.reply ||
          "I'm sorry, I don't have information about that yet. Please contact support for further help.",
      )
    } catch {
      pushBotMessage(
        "I'm sorry, I don't have information about that yet. Please contact support for further help.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  const startVoiceQuestion = async () => {
    if (isRecording || isLoading || isTranscribing) return

    if (
      typeof window === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      pushBotMessage(
        'Voice questions are not supported in this browser. Please type your question instead.',
      )
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeTypeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ]
      const supportedMimeType =
        mimeTypeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) || ''

      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream)

      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      setVoiceStatus('Listening now. Click the stop button when you finish your question.')
      setIsRecording(true)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const blobType = recorder.mimeType || supportedMimeType || 'audio/webm'
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType })
        audioChunksRef.current = []
        stopMicrophoneTracks()
        setIsRecording(false)

        if (!audioBlob.size) {
          setVoiceStatus(null)
          pushBotMessage('No audio was captured. Please try the microphone again and speak clearly.')
          return
        }

        setIsTranscribing(true)
        setVoiceStatus('Transcribing your voice question with Gemini...')

        try {
          const transcript = await transcribeVoiceQuestion(audioBlob)
          setVoiceStatus(`Transcribed question: ${transcript}`)
          await sendMessage(transcript)
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'I could not transcribe your voice question right now.'
          pushBotMessage(message)
        } finally {
          setIsTranscribing(false)
          setVoiceStatus(null)
        }
      }

      recorder.start()
    } catch (error) {
      setIsRecording(false)
      stopMicrophoneTracks()
      const message =
        error instanceof Error
          ? error.message
          : 'I could not access the microphone. Please check browser microphone permission.'
      pushBotMessage(message)
    }
  }

  const stopVoiceQuestion = () => {
    if (!isRecording) return
    setVoiceStatus('Stopping recording...')
    mediaRecorderRef.current?.stop()
  }

  const outerClassName =
    variant === 'widget'
      ? 'flex h-[34rem] w-[24rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-3xl border border-border bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-xl'
      : 'flex min-h-[40rem] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-border bg-card/95 text-card-foreground shadow-2xl backdrop-blur-xl'

  const messageAreaClassName =
    variant === 'widget'
      ? 'h-[20rem] overflow-y-auto px-4 py-4'
      : 'h-[28rem] overflow-y-auto px-6 py-5'

  return (
    <div className={outerClassName}>
      <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-blue-900 via-blue-800 to-slate-900 px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
            <Bot size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">St Peter Buddy</h2>
              <Sparkles size={14} className="text-yellow-300" />
            </div>
            <p className="text-xs text-blue-100/85">
              Role-aware support for trainee, trainer, and admin users
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close St Peter Buddy"
            className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="border-b border-border bg-muted/35 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {chatRole ? `Role: ${chatRole}` : 'Role will be detected automatically'}
          </span>
          <span className="text-xs text-muted-foreground">
            Ask system-related questions only. Type or use the microphone.
          </span>
        </div>
      </div>

      <div className={messageAreaClassName}>
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={`${message.sender}-${index}`}
              className={`flex ${
                message.sender === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                  message.sender === 'user'
                    ? 'bg-blue-700 text-white'
                    : 'border border-border bg-background/80 text-foreground'
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/80 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                St Peter Buddy is thinking...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-border bg-background/70 px-4 py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setInput(prompt)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>

        {voiceStatus && (
          <div className="mb-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
            {voiceStatus}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void sendMessage()
              }
            }}
            placeholder={getChatPlaceholder(chatRole)}
            disabled={isTranscribing}
            className="flex-1 rounded-2xl border border-input bg-input-background px-4 py-3 text-sm outline-none transition focus:border-primary"
          />
          <button
            type="button"
            onClick={() => {
              if (isRecording) {
                stopVoiceQuestion()
              } else {
                void startVoiceQuestion()
              }
            }}
            disabled={isLoading || isTranscribing}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isRecording
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'border border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5'
            }`}
            aria-label={isRecording ? 'Stop voice question' : 'Start voice question'}
            title={isRecording ? 'Stop voice question' : 'Start voice question'}
          >
            {isRecording ? <Square size={16} /> : <Mic size={16} />}
          </button>
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={isLoading || isTranscribing}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-700 text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
