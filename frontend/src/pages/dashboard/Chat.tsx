import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Hospital,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  streamChat,
  BASE_URL,
  getToken,
  type ChatHistoryMessage,
  type SourceDoc,
} from '../../api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SourceDoc[]
  error?: string
  streaming?: boolean
}

// ── Suggested starter questions ───────────────────────────────────────────────

const SUGGESTIONS = [
  'What medications am I currently taking?',
  'Show my latest blood test results.',
  'Which hospitals do I have records from?',
  'What were my kidney function test values?',
  'List all my reports uploaded this year.',
]

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ src }: { src: SourceDoc }) {
  return (
    <div className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded-full px-3 py-1 transition">
      <Hospital className="w-3 h-3 text-brand-400 shrink-0" />
      <span className="font-medium">{src.hospital}</span>
      <span className="text-slate-400">·</span>
      <span>{src.type}</span>
      <span className="text-slate-400">·</span>
      <span className="text-slate-400">{src.date}</span>
    </div>
  )
}

// ── Collapsible source list ───────────────────────────────────────────────────

function SourceList({ sources }: { sources: SourceDoc[] }) {
  const [open, setOpen] = useState(false)
  if (!sources.length) return null
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-brand-600 transition"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {sources.length} source{sources.length !== 1 ? 's' : ''} referenced
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-2">
          {sources.map((s, i) => <SourceBadge key={i} src={s} />)}
        </div>
      )}
    </div>
  )
}

// ── Single chat bubble ────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {isUser ? (
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">
          You
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-brand-300" />
        </div>
      )}

      {/* Content */}
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-brand-600 text-white rounded-tr-sm'
              : msg.error
              ? 'bg-rose-50 border border-rose-100 text-rose-700 rounded-tl-sm'
              : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm shadow-sm'
          }`}
        >
          {msg.error ? (
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {msg.error}
            </span>
          ) : (
            <>
              {msg.content}
              {msg.streaming && (
                <span className="inline-block w-1.5 h-4 bg-brand-400 rounded ml-0.5 animate-pulse align-middle" />
              )}
            </>
          )}
        </div>
        {!isUser && msg.sources && <SourceList sources={msg.sources} />}
      </div>
    </div>
  )
}

// ── Main Chat page ────────────────────────────────────────────────────────────

async function triggerReembed(): Promise<void> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}/chat/reembed`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [reembedding, setReembedding] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    setInput('')

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const botId = crypto.randomUUID()
    const botMsg: Message = { id: botId, role: 'assistant', content: '', streaming: true }

    setMessages(prev => [...prev, userMsg, botMsg])
    setLoading(true)

    const history: ChatHistoryMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content,
    }))

    abortRef.current = new AbortController()

    try {
      for await (const event of streamChat(text, history, abortRef.current.signal)) {
        if (event.type === 'sources') {
          setMessages(prev =>
            prev.map(m => (m.id === botId ? { ...m, sources: event.sources } : m)),
          )
        } else if (event.type === 'text') {
          setMessages(prev =>
            prev.map(m =>
              m.id === botId ? { ...m, content: m.content + event.text } : m,
            ),
          )
        } else if (event.type === 'error') {
          setMessages(prev =>
            prev.map(m =>
              m.id === botId ? { ...m, content: '', error: event.text, streaming: false } : m,
            ),
          )
          return
        }
      }
    } catch (err: unknown) {
      const isCancelled = err instanceof Error && err.name === 'AbortError'
      if (!isCancelled) {
        const msg = err instanceof Error ? err.message : 'Request failed.'
        setMessages(prev =>
          prev.map(m =>
            m.id === botId ? { ...m, content: '', error: msg, streaming: false } : m,
          ),
        )
      }
    } finally {
      setMessages(prev =>
        prev.map(m => (m.id === botId ? { ...m, streaming: false } : m)),
      )
      setLoading(false)
      abortRef.current = null
    }
  }, [loading, messages])

  function stopStream() {
    abortRef.current?.abort()
  }

  async function handleReembed() {
    setReembedding(true)
    try {
      await triggerReembed()
      toast.success('Embedding backfill started! The chatbot will improve as records are indexed (takes ~30s per document).')
    } catch {
      toast.error('Failed to start re-embedding. Check the server.')
    } finally {
      setReembedding(false)
    }
  }

  function clearHistory() {
    abortRef.current?.abort()
    setMessages([])
    setInput('')
    setLoading(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-brand-300" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">Medical Assistant</h1>
            <p className="text-xs text-slate-400">Answers from your records · powered by Gemma 3</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReembed}
            disabled={reembedding}
            title="Re-index your existing documents for better search accuracy"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-brand-600 transition px-3 py-1.5 rounded-lg hover:bg-brand-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reembedding ? 'animate-spin' : ''}`} />
            {reembedding ? 'Indexing…' : 'Re-index records'}
          </button>
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-500 transition px-3 py-1.5 rounded-lg hover:bg-rose-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center text-center pt-8 pb-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center mb-4">
              <Activity className="w-8 h-8 text-brand-300" />
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-1">Ask about your records</h2>
            <p className="text-sm text-slate-400 max-w-sm mb-8">
              I search through all your uploaded prescriptions and reports to answer your medical questions.
            </p>

            {/* Suggested questions */}
            <div className="flex flex-col gap-2 w-full max-w-md">
              {SUGGESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-left text-sm text-slate-600 bg-white border border-slate-100 hover:border-brand-200 hover:text-brand-700 rounded-xl px-4 py-2.5 transition hover:shadow-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map(msg => (
          <Bubble key={msg.id} msg={msg} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div className="shrink-0 px-4 pb-4 pt-2 bg-white border-t border-slate-100">
        <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your medical records… (Shift+Enter for new line)"
            disabled={loading}
            className="flex-1 bg-transparent resize-none text-sm text-slate-800 placeholder-slate-400 focus:outline-none max-h-40 leading-relaxed disabled:opacity-50"
          />

          {loading ? (
            <button
              onClick={stopStream}
              title="Stop generating"
              className="w-8 h-8 rounded-xl bg-rose-500 hover:bg-rose-600 flex items-center justify-center shrink-0 transition"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              title="Send (Enter)"
              className="w-8 h-8 rounded-xl bg-brand-600 hover:bg-brand-700 flex items-center justify-center shrink-0 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : <Send className="w-4 h-4 text-white" />}
            </button>
          )}
        </div>
        <p className="text-center text-xs text-slate-300 mt-2">
          Answers are based on your uploaded medical records only · Always consult your doctor
        </p>
      </div>
    </div>
  )
}
