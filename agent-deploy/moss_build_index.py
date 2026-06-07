import asyncio
import os

from dotenv import load_dotenv
from moss import DocumentInfo, MossClient

load_dotenv(".env.local")
load_dotenv()


SAFETY_DOCS = [
    DocumentInfo(
        id="supportive-check-in",
        text=(
            "A supportive check-in helps someone identify what they feel without interrogation. "
            "Ask one open question, acknowledge effort, reflect the feeling or need, then summarize one safe next step."
        ),
        metadata={"type": "framework"},
    ),
    DocumentInfo(
        id="crisis-escalation",
        text=(
            "When someone says they may hurt themselves, cannot stay safe, has a plan, intent, or access to means, "
            "stop ordinary coaching. Encourage emergency services now, call/text 988 in the U.S. and Canada, "
            "move away from means, and get near another person."
        ),
        metadata={"type": "safety"},
    ),
    DocumentInfo(
        id="grounding-regulation",
        text=(
            "Regulation before insight: guide long exhales, feet on floor, water, naming five things they see, "
            "and one near-home action. Avoid long lectures when someone is overwhelmed."
        ),
        metadata={"type": "regulation"},
    ),
    DocumentInfo(
        id="social-reconnection",
        text=(
            "Social reconnection can be tiny: send one low-pressure text, ask someone to stay on the phone for ten minutes, "
            "or sit near another person. Do not pressure performance; reduce isolation first."
        ),
        metadata={"type": "social"},
    ),
    DocumentInfo(
        id="autistic-social-support",
        text=(
            "For autistic or socially anxious users, offer scripts, predictability, and low-stimulation options. "
            "Do not frame social difficulty as failure. Suggest parallel activities, text-first contact, and clear conversation prompts."
        ),
        metadata={"type": "neurodiversity"},
    ),
    DocumentInfo(
        id="behavior-experiments",
        text=(
            "Behavioral change comes from small experiments: walk to the door, drink water, shower, clean one surface, "
            "send one message, or spend ten minutes outside. The goal is movement and safety, not instant happiness."
        ),
        metadata={"type": "behavior"},
    ),
    DocumentInfo(
        id="grief-stage-map",
        text=(
            "The five stages of grief can be used as a gentle map, not a linear requirement: denial, anger, bargaining, "
            "depression, and acceptance. Ask which stage feels closest today. Reflect the protective function of that stage, "
            "then summarize one safe behavior for the next ten minutes."
        ),
        metadata={"type": "grief"},
    ),
    DocumentInfo(
        id="summary-pattern",
        text=(
            "A useful summary sounds like: You feel __ after __. The need underneath might be __. "
            "For the next ten minutes, you will __ and contact __ if the feeling gets louder."
        ),
        metadata={"type": "summary"},
    ),
]


async def main():
    client = MossClient(
        project_id=os.environ["MOSS_PROJECT_ID"],
        project_key=os.environ["MOSS_PROJECT_KEY"],
    )
    index_name = os.getenv("MOSS_INDEX_NAME", "safety-companion")
    await client.create_index(index_name, SAFETY_DOCS, model_id="moss-minilm")
    print(f"Created Moss index: {index_name}")


if __name__ == "__main__":
    asyncio.run(main())
