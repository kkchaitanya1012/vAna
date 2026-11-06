"""Turns Pipecat frames into the session events defined in DESIGN.md 2.4.

Turn rules (the API groups events by turn_idx):
- The bot's greeting is turn 0 with no user timings.
- A new turn starts when the user starts speaking and the current turn has
  already begun its response (bot or LLM output). That also flags an interruption
  of the previous turn if its response was still in progress.
- User pauses before any response started stay in the same turn.
"""

from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    ErrorFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    MetricsFrame,
    TranscriptionFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
    UserStoppedSpeakingFrame,
    VADUserStartedSpeakingFrame,
    VADUserStoppedSpeakingFrame,
)
from pipecat.metrics.metrics import (
    LLMUsageMetricsData,
    ProcessingMetricsData,
    TTFBMetricsData,
    TTSUsageMetricsData,
)
from pipecat.observers.base_observer import BaseObserver, FramePushed


class SessionMetricsObserver(BaseObserver):
    def __init__(self, events):
        super().__init__(observe_every_push=False)  # each frame once
        self._ev = events
        self.turn = -1
        self._responding = False  # LLM output or bot speech has begun in this turn
        self._user_speaking = False
        self._bot_speaking = False
        self._llm_active = False
        self._first_token = False
        self._tts_first = False
        self._tts_started = False
        self._tts_active = False  # TTS is synthesizing right now
        self._llm_text: list[str] = []

    def _emit(self, type_: str, payload: dict | None = None, turn: int | None = None):
        self._ev.emit(type_, payload, self.turn if turn is None else turn)

    def _new_turn(self):
        self.turn += 1
        self._responding = False
        self._first_token = False
        self._tts_first = False
        self._tts_started = False
        self._llm_text = []

    def _ensure_turn(self):
        if self.turn < 0:
            self._new_turn()

    async def on_push_frame(self, data: FramePushed):
        f = data.frame

        if isinstance(f, VADUserStartedSpeakingFrame):
            if self._user_speaking:
                return
            self._user_speaking = True
            if self.turn < 0 or self._responding:
                if self.turn >= 0 and (self._bot_speaking or self._llm_active or self._tts_active):
                    during = "playout" if self._bot_speaking else "tts" if self._tts_first else "llm"
                    self._emit("interruption", {"during": during}, turn=self.turn)
                self._new_turn()
            self._emit("user_started_speaking", {"start_secs": f.start_secs})

        elif isinstance(f, VADUserStoppedSpeakingFrame):
            if not self._user_speaking:
                return
            self._user_speaking = False
            self._ensure_turn()
            self._emit("user_stopped_speaking", {"stop_secs": f.stop_secs})

        elif isinstance(f, UserStoppedSpeakingFrame):
            self._ensure_turn()
            self._emit("turn_end_detected")

        elif isinstance(f, TranscriptionFrame):
            self._ensure_turn()
            self._emit("stt_final", {"text": f.text})

        elif isinstance(f, LLMFullResponseStartFrame):
            self._ensure_turn()
            self._responding = True
            self._llm_active = True
            self._first_token = False
            self._llm_text = []
            self._emit("llm_started")

        elif isinstance(f, LLMTextFrame):
            if self._llm_active:
                if not self._first_token:
                    self._first_token = True
                    self._emit("llm_first_token")
                self._llm_text.append(f.text)

        elif isinstance(f, LLMFullResponseEndFrame):
            if self._llm_active:
                self._llm_active = False
                self._emit("llm_completed", {"text": "".join(self._llm_text).strip()})

        elif isinstance(f, TTSStartedFrame):
            self._tts_started = True
            self._tts_active = True

        elif isinstance(f, TTSStoppedFrame):
            self._tts_active = False

        elif isinstance(f, TTSAudioRawFrame):
            if self._tts_started and not self._tts_first:
                self._tts_first = True
                self._emit("tts_first_byte")

        elif isinstance(f, BotStartedSpeakingFrame):
            if self._bot_speaking:
                return
            self._bot_speaking = True
            self._ensure_turn()
            self._responding = True
            self._emit("bot_started_speaking")

        elif isinstance(f, BotStoppedSpeakingFrame):
            if not self._bot_speaking:
                return
            self._bot_speaking = False
            self._emit("bot_stopped_speaking")

        elif isinstance(f, MetricsFrame):
            for m in f.data:
                if isinstance(m, LLMUsageMetricsData):
                    self._emit("metrics", {"kind": "llm_usage", "processor": m.processor,
                                           "prompt_tokens": m.value.prompt_tokens,
                                           "completion_tokens": m.value.completion_tokens})
                elif isinstance(m, TTSUsageMetricsData):
                    self._emit("metrics", {"kind": "tts_chars", "processor": m.processor, "chars": m.value})
                elif isinstance(m, TTFBMetricsData):
                    self._emit("metrics", {"kind": "ttfb", "processor": m.processor, "ms": round(m.value * 1000)})
                elif isinstance(m, ProcessingMetricsData):
                    self._emit("metrics", {"kind": "processing", "processor": m.processor, "ms": round(m.value * 1000)})

        elif isinstance(f, ErrorFrame):
            self._emit("error", {"message": str(f.error)[:300]})
