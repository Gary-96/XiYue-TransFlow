import { useAudioWebSocket } from '../hooks/useWebSocket'

/**
 * OBS 绿幕窗口 — 纯色背景便于 OBS 色度键控
 */
export default function OBSWindow() {
  const { transcription, history } = useAudioWebSocket()
  const latestSub = history[history.length - 1] || transcription

  return (
    <div className="obs-root">
      {latestSub ? (
        <>
          <div className="obs-zh">{latestSub.transcription.text}</div>
          <div className="obs-vi">{latestSub.translation.text}</div>
        </>
      ) : (
        <div className="obs-empty">等待信号…</div>
      )}

      <style>{`
        .obs-root {
          width: 100%;
          height: 100%;
          background: #00b140;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 20px;
          font-family: 'Noto Sans SC', 'Be Vietnam Pro', sans-serif;
        }
        .obs-zh {
          font-size: 24px;
          font-weight: 500;
          color: #ffffff;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
          text-align: center;
          line-height: 1.4;
        }
        .obs-vi {
          font-size: 28px;
          font-weight: 700;
          color: #ffffff;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
          text-align: center;
          line-height: 1.4;
        }
        .obs-empty {
          font-size: 18px;
          color: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>
  )
}
