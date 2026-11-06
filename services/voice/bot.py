"""vAna M1 bot: Deepgram STT -> OpenRouter LLM -> Cartesia TTS.

Run:  .venv/bin/python bot.py            (local WebRTC UI at http://localhost:7860)
      .venv/bin/python bot.py -t daily   (Daily room)
"""

import os

from dotenv import load_dotenv
from loguru import logger

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"), override=True)

from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams

from persona import load_persona
from session import SessionConfig, run_session

PERSONA = os.getenv("VANA_PERSONA", "default")
LLM_MODEL = os.getenv("VANA_LLM_MODEL", "meta-llama/llama-3.3-70b-instruct")


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    system_prompt, version = load_persona(PERSONA)
    cfg = SessionConfig("dev", PERSONA, system_prompt, version, None, llm={"provider": "openrouter", "model": LLM_MODEL})
    cfg.validate()
    await run_session(transport, cfg, handle_sigint=runner_args.handle_sigint)


async def bot(runner_args: RunnerArguments):
    transport_params = {
        "daily": lambda: DailyParams(audio_in_enabled=True, audio_out_enabled=True),
        "webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True),
    }
    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
