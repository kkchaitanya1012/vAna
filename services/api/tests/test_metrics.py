import random

from app.metrics import RawEvent as E
from app.metrics import derive_turns, percentile, stage_metrics, summarize


def normal_session() -> list[E]:
    return [
        # turn 0: the bot greets first, no user input
        E(1, "llm_started", 100, 0), E(2, "llm_first_token", 400, 0), E(3, "tts_first_byte", 600, 0),
        E(4, "bot_started_speaking", 700, 0), E(5, "llm_completed", 800, 0, {"text": "Hello there."}),
        E(6, "bot_stopped_speaking", 3000, 0),
        # turn 1: user speaks 4800..5600 (VAD confirms 400 ms later), bot answers at 6900
        E(7, "user_started_speaking", 5000, 1, {"start_secs": 0.2}),
        E(8, "user_stopped_speaking", 6000, 1, {"stop_secs": 0.4}),
        E(9, "turn_end_detected", 6050, 1),
        E(10, "stt_final", 6300, 1, {"text": "what time is it"}),
        E(11, "llm_started", 6310, 1), E(12, "llm_first_token", 6700, 1),
        E(13, "tts_first_byte", 6800, 1), E(14, "bot_started_speaking", 6900, 1),
        E(15, "metrics", 7000, 1, {"kind": "llm_usage", "prompt_tokens": 120, "completion_tokens": 18}),
        E(16, "llm_completed", 7100, 1, {"text": "It is noon."}),
        E(17, "metrics", 7200, 1, {"kind": "tts_chars", "chars": 11}),
        E(18, "bot_stopped_speaking", 9000, 1),
    ]


def test_normal_turn_stage_breakdown_sums_to_v2v():
    turns = derive_turns(normal_session())
    assert [t.idx for t in turns] == [0, 1]
    g, t = turns
    assert g.user_stop_ms is None and g.bot_start_ms == 700  # greeting has no user timings
    assert stage_metrics(g)["v2v"] is None
    assert t.user_start_ms == 4800 and t.user_stop_ms == 5600
    assert t.user_text == "what time is it" and t.bot_text == "It is noon."
    s = stage_metrics(t)
    assert s["v2v"] == 1300
    assert s["endpoint"] == 700 and s["pre_llm"] == 10
    assert s["llm_ttft"] == 390 and s["tts_ttfb"] == 100 and s["transport"] == 100
    assert s["endpoint"] + s["pre_llm"] + s["llm_ttft"] + s["tts_ttfb"] + s["transport"] == s["v2v"]
    assert (t.tokens_in, t.tokens_out, t.tts_chars) == (120, 18, 11)
    assert s["bot_duration"] == 2100


def test_order_of_delivery_does_not_matter():
    events = normal_session()
    expected = derive_turns(events)
    for seed in range(5):
        shuffled = events[:]
        random.Random(seed).shuffle(shuffled)
        assert derive_turns(shuffled) == expected


def test_interrupted_turn_is_flagged():
    events = normal_session() + [
        E(19, "interruption", 9500, 1, {"during": "playout"}),
        E(20, "user_started_speaking", 9500, 2, {"start_secs": 0.2}),
        E(21, "user_stopped_speaking", 10500, 2, {"stop_secs": 0.4}),
        E(22, "stt_final", 10800, 2, {"text": "stop"}),
    ]
    turns = derive_turns(events)
    assert [t.interrupted for t in turns] == [False, True, False]
    last = turns[2]
    assert last.bot_start_ms is None  # no response yet
    s = stage_metrics(last)
    assert s["v2v"] is None and s["endpoint"] == 700  # never raises on missing stages


def test_missing_tts_leaves_dependent_stages_null():
    events = [e for e in normal_session() if e.type != "tts_first_byte"]
    s = stage_metrics(derive_turns(events)[1])
    assert s["tts_ttfb"] is None and s["transport"] is None
    assert s["v2v"] == 1300 and s["llm_ttft"] == 390


def test_speculative_llm_start_before_final_transcript_caps_endpoint():
    # LLM starts before the final transcript lands: stages must not go negative or overlap
    events = [e for e in normal_session() if e.type != "stt_final"] + [E(30, "stt_final", 6500, 1, {"text": "x"})]
    s = stage_metrics(derive_turns(events)[1])
    assert s["pre_llm"] == 0
    assert s["endpoint"] + s["pre_llm"] + s["llm_ttft"] + s["tts_ttfb"] + s["transport"] == s["v2v"]


def test_character_count_falls_back_to_spoken_text_when_voice_reports_none():
    events = [e for e in normal_session() if not (e.type == "metrics" and (e.payload or {}).get("kind") == "tts_chars")]
    t = derive_turns(events)[1]
    assert t.tts_chars == len("It is noon.")


def test_percentile_interpolates():
    assert percentile([], 50) is None
    assert percentile([10], 95) == 10
    assert percentile([100, 200, 300, 400], 50) == 250
    assert percentile([100, 200, 300, 400, 500], 95) == 480


def test_summary():
    turns = derive_turns(normal_session())
    s = summarize(turns)
    assert s["turns"] == 2 and s["responded_turns"] == 2
    assert s["v2v_p50"] == 1300 and s["interruptions"] == 0
    assert s["tokens_in"] == 120 and s["stage_avg"]["llm_ttft"] == 345.0  # greeting 300 and reply 390
    assert s["silence_gap_avg"] == 1800  # bot stops 3000, user starts 4800
