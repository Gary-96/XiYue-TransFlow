import asyncio
import logging
import numpy as np
import torch
from faster_whisper import WhisperModel
from typing import Optional
from app.models.schemas import TranscriptionResult

logger = logging.getLogger(__name__)

class WhisperService:
    def __init__(self):
        # Configure device for M2 Pro (MPS acceleration)
        if torch.backends.mps.is_available():
            self.device = "mps"
            logger.info("Using MPS (Metal Performance Shaders) for acceleration")
        else:
            self.device = "cpu"
            logger.warning("MPS not available, falling back to CPU")
        
        # Initialize Whisper model
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Load the Whisper model with appropriate configuration"""
        try:
            # Use a smaller model for real-time processing
            model_size = "base"
            
            # Configure model based on device
            if self.device == "mps":
                # For MPS, we need to use CPU for now as faster-whisper has limited MPS support
                # But we can still benefit from Apple Silicon optimization
                self.model = WhisperModel(
                    model_size,
                    device="cpu",  # faster-whisper works best with CPU on Mac
                    compute_type="float32"
                )
            else:
                self.model = WhisperModel(
                    model_size,
                    device="cpu",
                    compute_type="float32"
                )
            
            logger.info(f"Whisper model loaded successfully (size: {model_size})")
            
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {str(e)}")
            raise
    
    async def transcribe_audio(self, audio_data: np.ndarray, language: str = None) -> Optional[TranscriptionResult]:
        """
        Transcribe audio data using faster-whisper
        
        Args:
            audio_data: numpy array of audio samples (float32, 16kHz)
            language: 语言代码 ("zh"/"vi"/"en"/"ja"/"ko"/"th"/None=自动检测)
            
        Returns:
            TranscriptionResult or None if transcription fails
        """
        if self.model is None:
            logger.error("Whisper model not loaded")
            return None
        
        try:
            # Ensure audio data is in the correct format
            if audio_data.dtype != np.float32:
                audio_data = audio_data.astype(np.float32)
            
            # Resample if necessary (Whisper expects 16kHz)
            if len(audio_data.shape) > 1:
                audio_data = audio_data.flatten()
            
            # 构建 transcribe 参数：空字符串或 None = 自动检测
            transcribe_kwargs = dict(
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500),
            )
            if language:
                transcribe_kwargs["language"] = language
            
            # Run transcription in a thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            
            def transcribe():
                segments, info = self.model.transcribe(audio_data, **transcribe_kwargs)
                
                # Get the first segment (most confident)
                for segment in segments:
                    return {
                        "text": segment.text.strip(),
                        "language": info.language,
                        "confidence": segment.avg_logprob
                    }
                
                return None
            
            result = await loop.run_in_executor(None, transcribe)
            
            if result:
                return TranscriptionResult(
                    text=result["text"],
                    language=result["language"],
                    confidence=result["confidence"]
                )
            
            return None
            
        except Exception as e:
            logger.error(f"Transcription error: {str(e)}")
            return None
    
    def get_model_info(self):
        """Get information about the loaded model"""
        return {
            "device": self.device,
            "model_loaded": self.model is not None,
            "torch_version": torch.__version__,
            "mps_available": torch.backends.mps.is_available()
        }
