import { useStreamWebSocket, useAudioWebSocket } from '../hooks/useWebSocket'

/**
 * 亚克力毛玻璃灵动岛字幕 — 全透明置顶窗口
 */
export default function SubtitleOverlay() {
  const { transcription, history } = useAudioWebSocket()
  const { messages } = useStreamWebSocket()

  // 最新弹幕
  const latestDanmaku = messages.filter((m) => m.type === 'comment').slice(-3)
  // 最新字幕
  const latestSub = history[history.length - 1] || transcription

  return (
    <div className="overlay-root">
      <div className="overlay-glass">
        {/* 字幕区 */}
        {latestSub && (
          <div className="subtitle-section">
            <div className="sub-line-zh">{latestSub.transcription.text}</div>
            <div className="sub-line-vi">{latestSub.translation.text}</div>
          </div>
        )}

        {/* 分隔线 */}
        {latestSub && latestDanmaku.length > 0 && <div className="divider" />}

        {/* 弹幕区 */}
        {latestDanmaku.length > 0 && (
          <div className="danmaku-section">
            {latestDanmaku.map((msg, i) => (
              <div key={i} className="danmaku-line">
                <span className="dm-user">{msg.user}</span>
                <span className="dm-text">{msg.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* 空状态 */}
        {!latestSub && latestDanmaku.length === 0 && (
          <div className="empty">等待信号…</div>
        )}
      </div>

      <style>{`
        .overlay-root {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
        }
        .overlay-glass {
          width: 100%;
          height: 100%;
          background: rgba(8, 14, 30, 0.55);
          backdrop-filter: blur(24px) saturate(200%);
          -webkit-backdrop-filter: blur(24px) saturate(200%);
          border: 1px solid rgba(120, 180, 255, 0.1);
          border-radius: 16px;
          padding: 10px 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 6px;
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
          overflow: hidden;
        }
        .subtitle-section {
          display: flex;
          flex-direction: column;
          gap: 4px;
          animation: slide-in-up 0.3s ease;
        }
        .sub-line-zh {
          font-size: 16px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.85);
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
          line-height: 1.4;
        }
        .sub-line-vi {
          font-size: 18px;
          font-weight: 700;
          color: #00e5ff;
          text-shadow:
            0 0 12px rgba(0, 229, 255, 0.5),
            0 2px 8px rgba(0, 0, 0, 0.6);
          line-height: 1.4;
        }
        .divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(120, 180, 255, 0.2), transparent);
          margin: 4px 0;
        }
        .danmaku-section {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .danmaku-line {
          display: flex;
          gap: 6px;
          font-size: 12px;
          line-height: 1.3;
          animation: slide-in-up 0.2s ease;
        }
        .dm-user {
          color: rgba(168, 85, 247, 0.8);
          font-weight: 500;
          flex-shrink: 0;
        }
        .dm-text {
          color: rgba(255, 255, 255, 0.7);
        }
        .empty {
          color: rgba(160, 180, 220, 0.3);
          font-size: 14px;
          text-align: center;
        }
      `}</style>
    </div>
  )
}
