"""M1: print per-stage metrics to the console. Replaced by the full observer in M3."""

from loguru import logger
from pipecat.frames.frames import MetricsFrame
from pipecat.metrics.metrics import (
    LLMUsageMetricsData,
    ProcessingMetricsData,
    TTFBMetricsData,
    TTSUsageMetricsData,
)
from pipecat.observers.base_observer import BaseObserver, FramePushed


class ConsoleMetricsObserver(BaseObserver):
    def __init__(self):
        # Observe each frame once, so metrics are not logged per processor hop.
        super().__init__(observe_every_push=False)

    async def on_push_frame(self, data: FramePushed):
        if not isinstance(data.frame, MetricsFrame):
            return
        for m in data.frame.data:
            if isinstance(m, TTFBMetricsData):
                logger.info(f"TTFB {m.processor}: {m.value * 1000:.0f} ms")
            elif isinstance(m, ProcessingMetricsData):
                logger.info(f"PROC {m.processor}: {m.value * 1000:.0f} ms")
            elif isinstance(m, LLMUsageMetricsData):
                logger.info(f"TOKENS {m.processor}: {m.value}")
            elif isinstance(m, TTSUsageMetricsData):
                logger.info(f"TTS chars {m.processor}: {m.value}")
