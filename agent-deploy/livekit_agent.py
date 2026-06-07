import logging
import os
import re

PROJECT_TMP = os.path.join(os.path.dirname(__file__), "tmp")
os.makedirs(PROJECT_TMP, exist_ok=True)
os.environ.setdefault("TMPDIR", PROJECT_TMP)
os.environ.setdefault("TEMP", PROJECT_TMP)
os.environ.setdefault("TMP", PROJECT_TMP)

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    ChatContext,
    ChatMessage,
    JobContext,
    JobProcess,
    cli,
    inference,
)
from livekit.plugins import silero

try:
    from livekit.plugins import elevenlabs
except ImportError:
    elevenlabs = None

try:
    from moss import MossClient, QueryOptions
except ImportError:
    MossClient = None
    QueryOptions = None


load_dotenv(".env.local")
load_dotenv()

logger = logging.getLogger("safety-companion-agent")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

AGENT_NAME = os.getenv("LIVEKIT_AGENT_NAME", "safety-companion")
MOSS_INDEX_NAME = os.getenv("MOSS_INDEX_NAME", "safety-companion")

CRISIS_PATTERN = re.compile(
    r"\b(kill myself|suicide|suicidal|end my life|hurt myself|harm myself|"
    r"can't stay safe|cannot stay safe|have a plan|overdose|jump|hang myself)\b",
    re.IGNORECASE,
)


def create_tts():
    eleven_api_key = os.getenv("ELEVEN_API_KEY") or os.getenv("ELEVENLABS_API_KEY")
    eleven_voice_id = os.getenv("ELEVENLABS_VOICE_ID") or os.getenv("ELEVEN_VOICE_ID")
    if os.getenv("ELEVENLABS_USE_DIRECT", "").lower() == "true" and elevenlabs and eleven_api_key and eleven_voice_id:
        logger.info("Using ElevenLabs subscription voice for TTS")
        return elevenlabs.TTS(
            api_key=eleven_api_key,
            voice_id=eleven_voice_id,
            model=os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
            language=os.getenv("LIVEKIT_TTS_LANGUAGE", "en"),
            voice_settings=elevenlabs.VoiceSettings(
                stability=float(os.getenv("ELEVENLABS_STABILITY", "0.58")),
                similarity_boost=float(os.getenv("ELEVENLABS_SIMILARITY_BOOST", "0.78")),
                style=float(os.getenv("ELEVENLABS_STYLE", "0.32")),
                use_speaker_boost=True,
                speed=float(os.getenv("ELEVENLABS_SPEED", "1.0")),
            ),
        )

    if os.getenv("LIVEKIT_TTS_MODEL", "").startswith("elevenlabs/"):
        logger.info("Using LiveKit Inference ElevenLabs voice for TTS")
        return inference.TTS(
            model=os.getenv("LIVEKIT_TTS_MODEL", "elevenlabs/eleven_turbo_v2_5"),
            voice=os.getenv("LIVEKIT_TTS_VOICE", "Xb7hH8MSUJpSbSDYk0k2"),
            language=os.getenv("LIVEKIT_TTS_LANGUAGE", "en"),
            extra_kwargs={
                "stability": float(os.getenv("ELEVENLABS_STABILITY", "0.58")),
                "similarity_boost": float(os.getenv("ELEVENLABS_SIMILARITY_BOOST", "0.78")),
                "style": float(os.getenv("ELEVENLABS_STYLE", "0.32")),
                "speed": float(os.getenv("ELEVENLABS_SPEED", "1.0")),
                "use_speaker_boost": True,
            },
        )

    logger.info("Using LiveKit Inference ElevenLabs fallback for TTS")
    return inference.TTS(
        model="elevenlabs/eleven_turbo_v2_5",
        voice=os.getenv("LIVEKIT_TTS_VOICE", "cgSgspJ2msm6clMCkdW9"),
        language=os.getenv("LIVEKIT_TTS_LANGUAGE", "en"),
        extra_kwargs={
            "stability": float(os.getenv("ELEVENLABS_STABILITY", "0.58")),
            "similarity_boost": float(os.getenv("ELEVENLABS_SIMILARITY_BOOST", "0.78")),
            "style": float(os.getenv("ELEVENLABS_STYLE", "0.32")),
            "speed": float(os.getenv("ELEVENLABS_SPEED", "1.0")),
            "use_speaker_boost": True,
        },
    )


def create_background_audio_player():
    ambient_path = os.getenv("ELEVENLABS_AMBIENT_AUDIO_PATH") or os.getenv("SAFETY_AMBIENT_AUDIO_PATH")
    if ambient_path and os.path.exists(ambient_path):
        logger.info("Using custom ambient audio: %s", ambient_path)
        return BackgroundAudioPlayer(
            ambient_sound=AudioConfig(
                source=ambient_path,
                volume=float(os.getenv("SAFETY_AMBIENT_VOLUME", "0.14")),
                fade_in=float(os.getenv("SAFETY_AMBIENT_FADE_IN", "2.0")),
                fade_out=float(os.getenv("SAFETY_AMBIENT_FADE_OUT", "2.0")),
            )
        )
    if ambient_path:
        logger.info("Ambient audio path not found, skipping background audio: %s", ambient_path)
    return None


class SafetyCompanion(Agent):
    def __init__(self, moss_client=None, index_name=MOSS_INDEX_NAME) -> None:
        super().__init__(
            instructions=(
                "You are a soft-spoken safety companion named Sol. "
                "You provide voice-guided emotional support for anxiety, loneliness, panic, emotional overwhelm, "
                "and moments when staying safe feels difficult. "
                "Use a professional mental-health support style: ask open questions, acknowledge effort, "
                "reflect feelings accurately, and summarize one safety-focused next step. "
                "You are not a therapist, clinician, or emergency service. Do not diagnose. "
                "If the caller describes imminent danger, a plan, intent, means, or says they cannot stay safe, "
                "tell them to call emergency services now or call/text 988 in the U.S. and Canada, move away from means, "
                "and get near another person. "
                "For non-immediate distress, guide them through regulation, naming the feeling, finding the blocked need, "
                "contacting one safe person, and choosing one near-home activity. "
                "Use the five stages of grief as a gentle map, never a rigid sequence: denial, anger, bargaining, depression, acceptance. "
                "Help callers identify which stage feels closest today, then explore what need is underneath it. "
                "Voice style: calm, clear, warm, and direct. "
                "Sound like a trained support companion: human, steady, and practical. "
                "Avoid figurative language, product-demo language, therapy jargon, long disclaimers, and polished monologues. "
                "Do not overuse pet names. Match the caller's energy, pause, and let silence breathe. "
                "Do not use jokes when someone may be unsafe, and never minimize pain. "
                "Support autistic, socially anxious, depressed, lonely, or overwhelmed callers with low-pressure social scripts. "
                "Keep responses short because this is voice. Ask one question at a time. "
                "Use breathing cues when helpful: breathe in for four, hold for two, out for six. "
                "Never tell someone their life is easy, never guilt them, and never make promises of confidentiality or rescue."
            )
        )
        self.moss = moss_client
        self.index_name = index_name

    async def on_enter(self) -> None:
        logger.info("SafetyCompanion activated")

    async def on_user_turn_completed(self, turn_ctx: ChatContext, new_message: ChatMessage) -> None:
        user_query = new_message.text_content or ""
        if CRISIS_PATTERN.search(user_query):
            turn_ctx.add_message(
                role="system",
                content=(
                    "Crisis language detected. Prioritize immediate safety: emergency services now if danger is immediate, "
                    "call/text 988 in the U.S. and Canada, move away from means, and get near another person. "
                    "Do not continue ordinary coaching until safety is addressed."
                ),
            )

        if self.moss and QueryOptions:
            try:
                results = await self.moss.query(
                    self.index_name,
                    user_query,
                    QueryOptions(top_k=4, alpha=0.8),
                )
                if getattr(results, "docs", None):
                    context = "\n".join([f"- {doc.text}" for doc in results.docs])
                    turn_ctx.add_message(
                        role="system",
                        content=(
                            "Relevant Safety Companion context:\n"
                            f"{context}\n\nUse this context for a specific supportive response and one safe action."
                        ),
                    )
            except Exception as exc:
                logger.info("Moss retrieval skipped: %s", exc)

        await super().on_user_turn_completed(turn_ctx, new_message)


server = AgentServer()


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


def maybe_create_moss_client():
    if not MossClient or not os.getenv("MOSS_PROJECT_ID") or not os.getenv("MOSS_PROJECT_KEY"):
        return None

    return MossClient(
        project_id=os.getenv("MOSS_PROJECT_ID"),
        project_key=os.getenv("MOSS_PROJECT_KEY"),
    )


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name, "agent": AGENT_NAME}

    moss_client = maybe_create_moss_client()
    if moss_client:
        try:
            await moss_client.load_index(MOSS_INDEX_NAME)
            logger.info("Loaded Moss index: %s", MOSS_INDEX_NAME)
        except Exception as exc:
            logger.info("Moss index not loaded yet: %s", exc)

    session = AgentSession(
        stt=inference.STT(
            model=os.getenv("LIVEKIT_STT_MODEL", "deepgram/nova-3-general"),
            language=os.getenv("LIVEKIT_STT_LANGUAGE", "multi"),
        ),
        llm=inference.LLM(
            model=os.getenv("LIVEKIT_LLM_MODEL", "openai/gpt-4o-mini"),
        ),
        tts=create_tts(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )
    background_audio = create_background_audio_player()

    @ctx.room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant) -> None:
        logger.info("participant connected: %s kind=%s", participant.identity, participant.kind)

    await session.start(
        room=ctx.room,
        agent=SafetyCompanion(moss_client=moss_client, index_name=MOSS_INDEX_NAME),
    )
    if background_audio:
        await background_audio.start(room=ctx.room, agent_session=session)
    logger.info("Safety Companion ready to greet caller")
    await session.generate_reply(
        instructions=(
            "Greet the caller in one short, warm sentence. Say: "
            "'Hi, I'm here with you. What's happening right now?'"
        )
    )


if __name__ == "__main__":
    cli.run_app(server)
