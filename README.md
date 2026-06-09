# Lulu Friend & Companion

Lulu is a voice-guided AI friend and emotional companion for anxiety, loneliness, panic, emotional overwhelm, and moments when staying safe feels difficult.

The product gives people a simple way to check in, name what they are feeling, identify what may have raised the intensity, choose one immediate safety action, and decide who they can contact for support.

Lulu is not a therapist, clinician, emergency service, or replacement for medical care. If someone may hurt themselves or cannot stay safe, the app directs them to emergency services and to call/text 988 in the U.S. and Canada.

## Live App

- Website: `https://safety-companion-siruis-projects-98fae10c.vercel.app`
- Phone number: `+1 (415) 908-5000`

The website is deployed on Vercel. The phone agent currently requires a LiveKit worker to be running. For always-on phone calls, deploy the worker to LiveKit Cloud or another always-on host.

## Features

- Simple friend-and-companion landing page with a direct phone CTA.
- Anonymous usage number for Lulu call starts.
- Save-to-contacts button with Lulu's contact photo and phone number.
- Crisis-aware safety routing for emergency services and 988.
- LiveKit phone worker for voice conversations.
- ElevenLabs voice through LiveKit Inference.
- Optional semantic memory/indexing through Moss.
- Vercel serverless API wrapper for the web app.

## Tech Stack

- Node.js server using `server.mjs`
- Static frontend in `public/`
- Vercel serverless API in `api/[...path].mjs`
- LiveKit Agents Python worker in `livekit_agent.py`
- LiveKit SIP dispatch rule in `livekit-dispatch-rule.json`
- Optional Moss index builder in `moss_build_index.py`

## Local Setup

Install web dependencies:

```bash
npm install
```

Create local environment variables:

```bash
cp .env.example .env.local
```

Fill in at least:

```bash
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_PHONE_NUMBER=+14159085000
LIVEKIT_AGENT_NAME=safety-companion
```

Run the website:

```bash
npm start
```

Open:

```bash
http://localhost:8791
```

## Run The Phone Agent

Install Python dependencies in your preferred virtual environment:

```bash
pip install -r requirements.txt
```

Start the LiveKit worker:

```bash
python3 livekit_agent.py dev
```

The worker must register as:

```text
agent_name: safety-companion
```

If the computer is off, asleep, or the worker is not running, the phone number will not have an agent available to answer.

## LiveKit SIP Dispatch

The inbound call dispatch rule should point to the `safety-companion` agent:

```bash
lk sip dispatch list
```

Expected agent:

```text
safety-companion
```

To recreate the dispatch rule:

```bash
lk sip dispatch create livekit-dispatch-rule.json
```

## Deploy Website To Vercel

Preview deploy:

```bash
npx vercel deploy . -y --no-wait
```

Production deploy:

```bash
npx vercel deploy . --prod -y --no-wait
```

The project is named `safety-companion` on Vercel.

## Tests

Run the web health check:

```bash
npm run check
```

Run Python behavior tests:

```bash
python3 -m unittest tests/test_safety_companion.py
```

## Safety Boundaries

Lulu should:

- Ask clear, simple questions.
- Help the user identify feelings, triggers, needs, and immediate safety actions.
- Encourage contacting emergency services or 988 when there is immediate danger.
- Avoid diagnosis, clinical claims, promises of rescue, or replacing therapy.

Lulu should not:

- Present itself as a licensed clinician.
- Diagnose the user.
- Minimize risk or emotional pain.
- Continue ordinary coaching when the user may be in immediate danger.

## Troubleshooting Phone Calls

If calling the phone number does not work:

1. Confirm the worker is running:

   ```bash
   ps aux | grep livekit_agent.py
   ```

2. Confirm app health:

   ```bash
   curl http://localhost:8791/api/health
   ```

3. Confirm dispatch rule:

   ```bash
   lk sip dispatch list
   ```

4. Confirm `.env.local` uses:

   ```bash
   LIVEKIT_AGENT_NAME=safety-companion
   ```

5. Restart the worker:

   ```bash
   python3 livekit_agent.py dev
   ```
