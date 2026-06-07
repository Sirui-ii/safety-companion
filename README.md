# Safety Companion

Safety Companion provides voice-guided emotional support for anxiety, loneliness, panic, emotional overwhelm, and moments when staying safe feels difficult.

It helps a person check in, identify what they are feeling, notice what may have raised the intensity, choose one immediate safety action, and identify someone they can contact for support.

It is not a therapist, clinician, emergency service, or replacement for medical care. If someone may hurt themselves or cannot stay safe, the app directs them to emergency services and to call/text 988 in the U.S. and Canada.

## What is wired

- Local web app for emotional check-ins and safety-focused next steps.
- Crisis-aware fallback responses with 988 and emergency-service routing.
- Browser-native calming audio and Steady Mode.
- LiveKit voice worker in `livekit_agent.py`.
- LiveKit number: `+1 415 908 5000`.

## Run the web app

```bash
cd /Users/iris/elevator-talk-studio
npm install
npm start
```

Open `http://localhost:8791`.

## Run the voice companion

```bash
cd /Users/iris/elevator-talk-studio
.venv/bin/python livekit_agent.py dev
```

The LiveKit dispatch rule should route inbound calls to the `safety-companion` agent. The number only answers while the local worker is running, unless the worker is deployed to an always-on host.

## Optional services

Add these to `.env.local` if available:

```bash
AI_GATEWAY_BASE_URL=
AI_GATEWAY_API_KEY=
AI_GATEWAY_MODEL=
```
