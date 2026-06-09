# Luulu Friend & Companion

Luulu is a voice-guided AI friend and emotional companion for anxiety, loneliness, panic, emotional overwhelm, and moments when staying safe feels difficult.

The product gives people a simple way to check in, name what they are feeling, identify what may have raised the intensity, choose one immediate safety action, and decide who they can contact for support.

Luulu is not a therapist, clinician, emergency service, or replacement for medical care. If someone may hurt themselves or cannot stay safe, the app directs them to emergency services and to call/text 988 in the U.S. and Canada.

## Live App

- Website: `https://safety-companion-siruis-projects-98fae10c.vercel.app`
- Phone number: `+1 (415) 908-5000`

The website is deployed on Vercel. The phone agent currently requires a LiveKit worker to be running. For always-on phone calls, deploy the worker to LiveKit Cloud or another always-on host.

## Features

- Simple friend-and-companion landing page with a direct phone CTA.
- Anonymous usage number for Luulu call starts.
- Save-to-contacts button with Luulu's contact photo and phone number.
- Privacy-preserving success metrics for call taps, LiveKit call starts, contact saves, and self-help check-ins.
- Optional lead capture gate before showing Luulu's number, with explicit SMS and email opt-ins.
- Optional Notion lead database sync for hackathon usage tracking.
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

## Measuring Success

Luulu should measure whether people can reach support without collecting sensitive conversation content.

Recommended metrics:

- `livekitCalls`: real call/session starts from the LiveKit webhook.
- `callClicks`: people tapping the phone CTA on the website.
- `contactSaves`: people saving Luulu to their contacts.
- `leads`: people who submitted the contact form before unlocking the number.
- `luluStarts`: anonymous total starts shown on the landing page.
- Duration buckets and repeat usage can be added later with a durable analytics store.

Do not record calls, store transcripts, or build distress profiles unless a user explicitly opts in. If collecting names, phone numbers, or emails, keep the opt-ins separate and clear. The current counters are anonymous and in-memory; lead capture can sync to Notion when `NOTION_API_KEY` and `NOTION_LEADS_DATABASE_ID` are configured.

## Notion Lead Capture

Create a Notion integration, share a leads database with it, then add these Vercel env vars:

```bash
NOTION_API_KEY=
NOTION_LEADS_DATABASE_ID=
```

The Notion database should include these properties:

```text
Name: title
First Name: text
Last Name: text
Phone: phone
Email: email
SMS Opt In: checkbox
Email Opt In: checkbox
Source: text
Session ID: text
Created At: date
```

If those env vars are missing, the form still unlocks Luulu's number, but the response will report `missing_notion_env` and the lead will not be durable on Vercel.

## Safety Boundaries

Luulu should:

- Ask clear, simple questions.
- Help the user identify feelings, triggers, needs, and immediate safety actions.
- Encourage contacting emergency services or 988 when there is immediate danger.
- Avoid diagnosis, clinical claims, promises of rescue, or replacing therapy.

Luulu should not:

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
