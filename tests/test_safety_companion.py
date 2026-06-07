from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class SafetyCompanionTests(unittest.TestCase):
    def test_agent_has_safety_support_personality(self):
        source = (ROOT / "livekit_agent.py").read_text()
        self.assertIn("soft-spoken safety companion named Sol", source)
        self.assertIn("open questions", source)
        self.assertIn("acknowledge effort", source)
        self.assertIn("reflect feelings", source)
        self.assertIn("summar", source)
        self.assertIn("988", source)
        self.assertIn("emergency services", source)
        self.assertIn("Ask one question at a time", source)
        self.assertIn("five stages of grief", source)
        self.assertIn("denial", source)
        self.assertIn("anger", source)
        self.assertIn("bargaining", source)
        self.assertIn("depression", source)
        self.assertIn("acceptance", source)
        self.assertIn("session.say", source)
        self.assertIn("Hey. I'm here with you", source)
        self.assertIn("professional mental-health support", source)
        self.assertIn("Avoid figurative language", source)
        self.assertIn("what happened?", source)
        self.assertIn("trained support companion", source)

    def test_agent_integrates_livekit_inference_and_moss(self):
        source = (ROOT / "livekit_agent.py").read_text()
        self.assertIn("inference.STT", source)
        self.assertIn("inference.LLM", source)
        self.assertIn("inference.TTS", source)
        self.assertIn("elevenlabs.TTS", source)
        self.assertIn("ELEVEN_API_KEY", source)
        self.assertIn("ELEVENLABS_VOICE_ID", source)
        self.assertIn('agent_name=AGENT_NAME', source)
        self.assertIn("MossClient", source)
        self.assertIn("on_user_turn_completed", source)

    def test_moss_index_contains_safety_knowledge(self):
        source = (ROOT / "moss_build_index.py").read_text()
        self.assertIn("safety-companion", source)
        self.assertIn("supportive-check-in", source)
        self.assertIn("crisis-escalation", source)
        self.assertIn("grounding-regulation", source)
        self.assertIn("social-reconnection", source)
        self.assertIn("behavior-experiments", source)

    def test_web_server_has_crisis_guardrails(self):
        source = (ROOT / "server.mjs").read_text()
        self.assertIn("warm safety companion", source)
        self.assertIn("detectsCrisis", source)
        self.assertIn("call/text 988", source)
        self.assertIn("emergency services", source)
        self.assertIn("gentle listening", source)


if __name__ == "__main__":
    unittest.main()
