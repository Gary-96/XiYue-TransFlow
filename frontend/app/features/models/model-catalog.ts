/**
 * 喜阅 TransFlow — 离线 AI 模型清单（主进程 / 渲染进程共享数据源）
 * 纯数据 + 类型，不依赖 electron，main 与 renderer 均可 import。
 * 分组对齐直播同传技术栈：ASR（语音识别）/ MT（离线翻译）。
 */
export type ModelGroup = 'asr' | 'mt'

export interface ModelSpec {
  /** 稳定 id，用于 IPC 与本地文件映射 */
  id: string
  name: string
  group: ModelGroup
  /** 用于排序与展示的近似体积（MB） */
  sizeMB: number
  sizeLabel: string
  note: string
  /** 落地到模型目录的相对文件名（唯一） */
  file: string
  /** 下载直链（HuggingFace / OpenAI CDN） */
  url: string
}

/** 下载进度流式 chunk（主进程 generator yield，渲染端 for-await 消费） */
export type ModelDownloadChunk =
  | { kind: 'progress'; received: number; total: number; percent: number; speedKBs: number }
  | { kind: 'done'; received: number }
  | { kind: 'error'; message: string }

export const MODEL_CATALOG: ModelSpec[] = [
  // ── 语音识别模型 (ASR) ──
  {
    id: 'whisper-tiny',
    name: 'Whisper Tiny',
    group: 'asr',
    sizeMB: 75,
    sizeLabel: '约 75 MB',
    note: '超轻量，极速冷启动，低配机器友好',
    file: 'whisper-tiny.bin',
    url: 'https://huggingface.co/openai/whisper-tiny/resolve/main/model.bin',
  },
  {
    id: 'whisper-base',
    name: 'Whisper Base',
    group: 'asr',
    sizeMB: 145,
    sizeLabel: '约 145 MB',
    note: '推荐默认，识别速度与准确率平衡',
    file: 'whisper-base.bin',
    url: 'https://huggingface.co/openai/whisper-base/resolve/main/model.bin',
  },
  {
    id: 'whisper-small',
    name: 'Whisper Small',
    group: 'asr',
    sizeMB: 480,
    sizeLabel: '约 480 MB',
    note: '高精准度，复杂直播场景推荐',
    file: 'whisper-small.bin',
    url: 'https://huggingface.co/openai/whisper-small/resolve/main/model.bin',
  },
  {
    id: 'whisper-large-v3-turbo',
    name: 'Whisper Large-v3 Turbo',
    group: 'asr',
    sizeMB: 1500,
    sizeLabel: '约 1.5 GB',
    note: '旗舰工业级，多语言混合识别最优',
    file: 'whisper-large-v3-turbo.bin',
    url: 'https://huggingface.co/openai/whisper-large-v3-turbo/resolve/main/model.safetensors',
  },
  // ── 离线中越翻译模型 (MT) ──
  {
    id: 'opus-mt-zh-vi',
    name: 'OPUS-MT 中越离线翻译模型',
    group: 'mt',
    sizeMB: 300,
    sizeLabel: '约 300 MB',
    note: '断网纯本地翻译，零 API 消耗',
    file: 'opus-mt-zh-vi.bin',
    url: 'https://huggingface.co/Helsinki-NLP/opus-mt-zh-vi/resolve/main/opus-mt-zh-vi.bin',
  },
  {
    id: 'nllb-200',
    name: 'NLLB-200 高保真多语言模型',
    group: 'mt',
    sizeMB: 600,
    sizeLabel: '约 600 MB',
    note: '高精度出海推荐，支持 200+ 语种',
    file: 'nllb-200-distilled-600M.bin',
    url: 'https://huggingface.co/facebook/nllb-200-distilled-600M/resolve/main/model.safetensors',
  },
]

export function modelsByGroup(group: ModelGroup): ModelSpec[] {
  return MODEL_CATALOG.filter((m) => m.group === group)
}

export function getModelSpec(id: string): ModelSpec | undefined {
  return MODEL_CATALOG.find((m) => m.id === id)
}
