"""One voice session: build the pipeline from a SessionConfig and run it."""

import os
from dataclasses import dataclass, field

from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.transports.base_transport import BaseTransport

from metrics_log import ConsoleMetricsObserver
from providers import build_llm, build_stt, build_tts, validate
from observer import SessionMetricsObserver
from recording import make_recorder, to_wav



@dataclass
class SessionConfig:
    session_id: str
    persona: str
    system_prompt: str
    prompt_version: str | None
    prompt_hash: str | None = None
    stt: dict = field(default_factory=lambda: {"provider": "deepgram"})
    llm: dict = field(default_factory=lambda: {"provider": "openrouter", "model": "meta-llama/llama-3.3-70b-instruct"})
    tts: dict = field(default_factory=lambda: {"provider": "cartesia"})

    def validate(self):
        for stage, cfg in (("stt", self.stt), ("llm", self.llm), ("tts", self.tts)):
            validate(stage, cfg)


class SessionHandle:
    """Lets the server cancel a running session."""

    task: PipelineTask | None = None


async def run_session(transport: BaseTransport, cfg: SessionConfig, events=None,
                      handle: SessionHandle | None = None, handle_sigint: bool = False):
    stt = build_stt(cfg.stt)
    llm = build_llm(cfg.llm, cfg.system_prompt)
    tts = build_tts(cfg.tts)

    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context, user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer())
    )
    recorder = make_recorder() if events else None
    recorded: dict = {}
    if recorder:

        @recorder.event_handler("on_audio_data")
        async def on_audio(_proc, audio, sample_rate, num_channels):
            recorded["wav"] = to_wav(audio, sample_rate, num_channels)

    stages = [transport.input(), stt, user_aggregator, llm, tts, transport.output()]
    if recorder:
        stages.append(recorder)  # after output, so it hears what the bot actually plays
    pipeline = Pipeline(stages + [assistant_aggregator])

    # PipelineTask/PipelineRunner are deprecated in 1.3 (removed in 2.0); version is pinned.
    task = PipelineTask(
        pipeline,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
        observers=[ConsoleMetricsObserver()] + ([SessionMetricsObserver(events)] if events else []),
    )
    if handle is not None:
        handle.task = task

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"[{cfg.session_id}] client connected")
        if recorder:
            await recorder.start_recording()
            events.emit("recording_started")  # t_ms of this event is audio time zero
        context.add_message({"role": "developer", "content": "Say hello and ask how you can help."})
        await task.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"[{cfg.session_id}] client disconnected")
        await task.cancel()

    if events:
        events.start()
        events.emit("session_started", {"persona": cfg.persona, "prompt_version": cfg.prompt_version,
                                        "llm_model": cfg.llm.get("model")})
    try:
        await PipelineRunner(handle_sigint=handle_sigint).run(task)
    finally:
        if events:
            if recorded.get("wav"):
                await events.upload_audio(recorded["wav"])  # before session_closed, which triggers analysis
            events.emit("session_closed", {"duration_ms": round(events.t_ms())})
            await events.close()
