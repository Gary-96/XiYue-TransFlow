import { useEffect, useRef } from 'react'
import type { StreamMessage } from '../hooks/useWebSocket'

interface DanmakuPanelProps {
  messages: StreamMessage[]
  onClear: () => void
}

/** 消息类型颜色映射 */
const TYPE_STYLES: Record<string, { color: string; icon: string; label: string }> = {
  comment: { color: '#eaf2ff', icon: '💬', label: '' },
  gift: { color: '#ff9d4d', icon: '🎁', label: '礼物' },
  member_join: { color: '#10d9a3', icon: '👉', label: '进场' },
  social: { color: '#ec4899', icon: '❤️', label: '互动' },
  room_stats: { color: '#a855f7', icon: '📊', label: '统计' },
  platform_connected: { color: '#10d9a3', icon: '✅', label: '系统' },
  platform_disconnected: { color: '#ef4444', icon: '❌', label: '系统' },
  collector_started: { color: '#00e5ff', icon: '🚀', label: '系统' },
  collector_stopped: { color: '#ef4444', icon: '🛑', label: '系统' },
}

/** 扩展 StreamMessage 类型以包含翻译字段 */
interface DanmakuMessage extends StreamMessage {
  translated_text?: string
}

export default function DanmakuPanel({ messages, onClear }: DanmakuPanelProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="danmaku-panel">
      <div className="panel-header">
        <span className="panel-title">实时弹幕流</span>
        <button className="clear-btn" onClick={onClear}>清空</button>
      </div>

      <div className="message-list" ref={listRef}>
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📡</div>
            <div className="empty-text">等待弹幕接入…</div>
            <div className="empty-hint">在左侧选择平台并输入直播间ID</div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const style = TYPE_STYLES[msg.type] || TYPE_STYLES.comment
            const dmsg = msg as DanmakuMessage
            const hasTranslation = dmsg.translated_text && dmsg.translated_text.trim()
            return (
              <div
                key={i}
                className={`message-item ${msg.type}`}
                style={{ borderLeftColor: style.color }}
              >
                <div className="msg-meta">
                  <span className="msg-platform" data-platform={msg.platform}>
                    {msg.platform === 'douyin' ? '🎵' : msg.platform === 'tiktok' ? '🎬' : '⚙'}
                  </span>
                  <span className="msg-user" style={{ color: style.color }}>
                    {style.icon} {msg.user}
                  </span>
                  {style.label && (
                    <span className="msg-tag" style={{ color: style.color, borderColor: style.color }}>
                      {style.label}
                    </span>
                  )}
                  {msg.language && msg.language !== 'unknown' && (
                    <span className="msg-lang">{msg.language}</span>
                  )}
                </div>
                <div className="msg-text">{msg.text}</div>
                {hasTranslation && (
                  <div className="msg-translated">↳ {dmsg.translated_text}</div>
                )}
                {msg.gift_name && (
                  <div className="msg-gift">
                    🎁 {msg.gift_name} ×{msg.gift_count}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <style>{`
        .danmaku-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 4px;
        }
        .panel-title {
          font-size: 12px;
          color: var(--text-muted);
          letter-spacing: 1px;
        }
        .clear-btn {
          padding: 4px 10px;
          border: 1px solid var(--border-glass);
          border-radius: 6px;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 11px;
          transition: var(--transition);
        }
        .clear-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          color: var(--accent-red);
          border-color: rgba(239, 68, 68, 0.3);
        }

        .message-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 4px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 8px;
        }
        .empty-icon {
          font-size: 48px;
          opacity: 0.2;
        }
        .empty-text {
          font-size: 14px;
          color: var(--text-muted);
        }
        .empty-hint {
          font-size: 12px;
          color: var(--text-muted);
          opacity: 0.5;
        }

        .message-item {
          padding: 8px 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: var(--radius-sm);
          border-left: 2px solid var(--text-muted);
          animation: slide-in-up 0.2s ease;
          transition: var(--transition);
        }
        .message-item:hover {
          background: rgba(0, 0, 0, 0.35);
        }

        .msg-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
        }
        .msg-platform {
          font-size: 12px;
        }
        .msg-user {
          font-size: 12px;
          font-weight: 500;
        }
        .msg-tag {
          font-size: 10px;
          padding: 1px 6px;
          border: 1px solid;
          border-radius: 8px;
          opacity: 0.8;
        }
        .msg-lang {
          font-size: 10px;
          padding: 1px 4px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          color: var(--text-muted);
        }
        .msg-text {
          font-size: 13px;
          color: var(--text-primary);
          line-height: 1.5;
        }
        .msg-translated {
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.4;
          margin-top: 2px;
          padding-left: 12px;
          border-left: 1px solid rgba(255, 255, 255, 0.1);
          opacity: 0.85;
        }
        .msg-gift {
          font-size: 12px;
          color: var(--accent-orange);
          margin-top: 4px;
        }

        /* 系统消息样式 */
        .message-item.platform_connected,
        .message-item.platform_disconnected,
        .message-item.collector_started,
        .message-item.collector_stopped {
          background: rgba(0, 0, 0, 0.4);
          text-align: center;
        }
        .message-item.platform_connected .msg-text,
        .message-item.platform_disconnected .msg-text,
        .message-item.collector_started .msg-text,
        .message-item.collector_stopped .msg-text {
          font-size: 12px;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  )
}
