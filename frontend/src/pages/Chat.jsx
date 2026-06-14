import React, { useEffect, useRef, useState } from 'react'
import PageHead from '../components/PageHead.jsx'
import Button from '../components/Button.jsx'
import { streamChat } from '../api'
import { MessageCircle, Send, Sparkles } from 'lucide-react'

const SUGGESTIONS = [
  'What medications am I currently taking?',
  'Show my latest blood test results.',
  'Which hospitals do I have records from?',
  'List all my reports uploaded this year.',
]

export default function Chat({ navigate }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)

  const bottomRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text) {
    const trimmed = text.trim()

    if (!trimmed || streaming) return

    const userMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    }

    const assistantId = crypto.randomUUID()

    setMessages(prev => [
      ...prev,
      userMsg,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
      },
    ])

    setInput('')
    setStreaming(true)

    const history = messages.map(m => ({
      role: m.role,
      content: m.content,
    }))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      let content = ''
      let sources = []

      for await (const event of streamChat(trimmed, history, controller.signal)) {
        if (event.type === 'sources') {
          sources = event.sources
        }

        if (event.type === 'text') {
          content += event.text
        }

        if (event.type === 'error') {
          content = event.text
        }

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  content,
                  sources,
                  streaming: true,
                }
              : m,
          ),
        )
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                streaming: false,
              }
            : m,
        ),
      )
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  content: err.message ?? 'Chat failed',
                  streaming: false,
                  error: true,
                }
              : m,
          ),
        )
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  return (
    <>
      <PageHead
        eyebrow="AI assistant"
        title="Health chat"
        desc="Ask questions about your uploaded prescriptions and reports."
        icon={Sparkles}
        action={
          <Button
            variant="ghost"
            onClick={() => navigate('health-dashboard')}
          >
            Back home
          </Button>
        }
      />

      <div className="panel chat-panel">
        
        <div className="chat-messages chat-container">

          {messages.length === 0 && (
            <div className="hero-large">
              <span className="badge">
                <MessageCircle size={14} /> RAG-powered
              </span>

              <h2>Ask about your medical records</h2>

              <p className="muted">
                Try one of these starters:
              </p>

              <div className="feature-grid">
                {SUGGESTIONS.map(q => (
                  <button
                    key={q}
                    className="action-tile selectable"
                    onClick={() => sendMessage(q)}
                  >
                    <div>
                      <h3>{q}</h3>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`chat-message ${msg.role}`}
            >
              <div className="chat-bubble">

                <div className="chat-role">
                  {msg.role === 'user'
                    ? 'You'
                    : 'Assistant'}
                </div>

                <p
                  style={{
                    marginTop: '0.5rem',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {msg.content}
                  {msg.streaming && '▌'}
                </p>

                {msg.sources?.length > 0 && (
                  <p
                    className="muted small"
                    style={{
                      marginTop: '0.5rem',
                    }}
                  >
                    Sources:{' '}
                    {msg.sources
                      .map(s => s.filename)
                      .join(', ')}
                  </p>
                )}

              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        <form
          className="chat-input-row"
          onSubmit={e => {
            e.preventDefault()
            sendMessage(input)
          }}
        >
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your health records…"
            disabled={streaming}
          />

          <Button
            type="submit"
            icon={Send}
            disabled={streaming || !input.trim()}
          >
            Send
          </Button>
        </form>
      </div>
    </>
  )
}