from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
    TranscriptionFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
    UserStoppedSpeakingFrame,
    VADUserStartedSpeakingFrame,
    VADUserStoppedSpeakingFrame,
)
from pipecat.observers.base_observer import FramePushed
from pipecat.processors.frame_processor import FrameDirection

from observer import SessionMetricsObserver


class Recorder:
    def __init__(self):
        self.items = []

    def emit(self, type_, payload=None, turn_idx=None):
        self.items.append((type_, turn_idx, payload))

    def types(self):
        return [(t, n) for t, n, _ in self.items]


async def push(obs, *frames):
    for f in frames:
        await obs.on_push_frame(FramePushed(None, None, f, FrameDirection.DOWNSTREAM, 0))


def user_turn(text="hi"):
    return [
        VADUserStartedSpeakingFrame(start_secs=0.2),
        VADUserStoppedSpeakingFrame(stop_secs=0.4),
        UserStoppedSpeakingFrame(),
        TranscriptionFrame(text=text, user_id="u", timestamp="t"),
    ]


def bot_response(text="ok"):
    return [
        LLMFullResponseStartFrame(),
        LLMTextFrame(text=text),
        TTSStartedFrame(),
        TTSAudioRawFrame(audio=b"\0\0", sample_rate=16000, num_channels=1),
        BotStartedSpeakingFrame(),
        LLMFullResponseEndFrame(),
        TTSStoppedFrame(),
    ]


async def test_greeting_is_turn_zero_then_user_turn_is_one():
    rec = Recorder()
    obs = SessionMetricsObserver(rec)
    await push(obs, *bot_response("Hello"), BotStoppedSpeakingFrame())
    await push(obs, *user_turn(), *bot_response("Sure"))
    got = rec.types()
    assert ("llm_started", 0) in got and ("bot_started_speaking", 0) in got
    assert ("user_started_speaking", 1) in got and ("stt_final", 1) in got
    assert ("llm_first_token", 1) in got and ("tts_first_byte", 1) in got
    assert not any(t == "interruption" for t, _ in got)
    done = [p for t, _, p in rec.items if t == "llm_completed"]
    assert [d["text"] for d in done] == ["Hello", "Sure"]


async def test_event_order_within_a_turn():
    rec = Recorder()
    obs = SessionMetricsObserver(rec)
    await push(obs, *user_turn(), *bot_response())
    order = [t for t, n in rec.types() if n == 0]
    assert order == ["user_started_speaking", "user_stopped_speaking", "turn_end_detected", "stt_final",
                     "llm_started", "llm_first_token", "tts_first_byte", "bot_started_speaking", "llm_completed"]


async def test_user_pause_before_response_stays_in_same_turn():
    rec = Recorder()
    obs = SessionMetricsObserver(rec)
    await push(obs, *user_turn("one"), *user_turn("two"))
    assert {n for _, n in rec.types()} == {0}


async def test_barge_in_flags_previous_turn_and_starts_a_new_one():
    rec = Recorder()
    obs = SessionMetricsObserver(rec)
    await push(obs, *user_turn(), *bot_response())  # bot is speaking, no BotStopped yet
    await push(obs, VADUserStartedSpeakingFrame(start_secs=0.1))
    inter = [(n, p) for t, n, p in rec.items if t == "interruption"]
    assert inter == [(0, {"during": "playout"})]
    assert ("user_started_speaking", 1) in rec.types()


async def test_duplicate_broadcast_frames_do_not_double_count():
    rec = Recorder()
    obs = SessionMetricsObserver(rec)
    await push(obs, BotStartedSpeakingFrame(), BotStartedSpeakingFrame(), BotStoppedSpeakingFrame(), BotStoppedSpeakingFrame())
    assert [t for t, _ in rec.types()] == ["bot_started_speaking", "bot_stopped_speaking"]
