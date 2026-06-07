# Deployment Notes

Safety Companion has two separate runtime surfaces:

1. The website and web API.
2. The LiveKit voice worker that answers phone calls.

The website can run on Vercel. The phone worker must run on a machine or hosting service that stays online.

## Website

Deploy the website to Vercel:

```bash
npx vercel deploy . --prod -y --no-wait
```

Stable production URL:

```text
https://safety-companion-siruis-projects-98fae10c.vercel.app
```

## Phone Worker

Local development:

```bash
python3 livekit_agent.py dev
```

Expected worker registration:

```text
agent_name: safety-companion
```

The phone number only answers while a worker is online. For production use, deploy the worker to LiveKit Cloud or another always-on host.

## Required LiveKit Environment

```bash
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_PHONE_NUMBER=+14159085000
LIVEKIT_AGENT_NAME=safety-companion
```

## SIP Dispatch Rule

The inbound dispatch rule must route calls to the same agent name used by the worker:

```text
safety-companion
```

Check:

```bash
lk sip dispatch list
```

Recreate:

```bash
lk sip dispatch create livekit-dispatch-rule.json
```

## Common Failure

If calls connect but nobody answers, the most likely causes are:

- The worker is not running.
- The computer running the worker is asleep or offline.
- `LIVEKIT_AGENT_NAME` does not match the SIP dispatch rule.
- The dispatch rule still points to an older agent name.
