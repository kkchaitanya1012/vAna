"""Stereo session recording: user on the left channel, bot on the right."""

import io
import wave

from pipecat.processors.audio.audio_buffer_processor import AudioBufferProcessor

RATE = 16000  # keeps a 10 minute call near 38 MB


def make_recorder() -> AudioBufferProcessor:
    # buffer_size=0: one merged buffer, delivered when recording stops (or the pipeline ends).
    return AudioBufferProcessor(sample_rate=RATE, num_channels=2, buffer_size=0)


def to_wav(pcm: bytes, sample_rate: int, num_channels: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(num_channels)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm)
    return buf.getvalue()
