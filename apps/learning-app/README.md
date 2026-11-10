# Learning Grove — first iteration

A self-hosted, mobile-first companion for short learning conversations. Built from `learning_app_brainstorm_and_product_spec.md`. React + TypeScript + Vite frontend; FastAPI and SQLite backend. Voice lessons use the OpenAI API. Browsing and editing saved learning records do not require an API key.

## What works

- Today’s suggested concept, active paths, and starter topic suggestions.
- Directional, horizontally scrollable concept maps with notes, evidence, and session history.
- Scoped path creation with outcomes, exclusions, depth, and a simple initial concept sequence.
- Planned, active, paused, and completed path states.
- Quiet idea capture and deletion.
- A generated tutor prompt containing path goals, concept IDs, prerequisite context, and a versioned JSON export template.
- In-app voice → proposed recap → edit notes/assessment → accept recap flow. Nothing changes on preview. Accepted recaps persist and duplicate imports are rejected.
- Pending sessions resume when you choose the same concept again.
- Deterministic next-concept selection: review needs first, then unfinished concepts with understood prerequisites, then the first unfinished concept. This is not an AI recommendation engine.

The initial paths and introductory concept states are **sample content**, not an assessment of Luke’s knowledge. Notes, ideas, paths, and sessions are stored on the server so devices using the same server share them.

## Run locally

From the repository root:

```sh
cd apps/learning-app
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8009
```

In a second terminal:

```sh
cd apps/learning-app/frontend
npm install
npm run dev
```

Open http://localhost:5177. Vite proxies `/api` and `/voice` to port 8009. The development database defaults to `apps/learning-app/data/learning.db` when running from that directory. Set `LEARNING_DB` to override it.

## Run on the homelab

```sh
cd compose/learning-app
docker compose up -d --build
```

Open port 8009 on the homelab, or http://learning.home.arpa after the updated Caddy and Pi-hole configuration is applied. HTTPS uses the existing Caddy local CA. SQLite persists in `/srv/appdata/learning-app/learning.db`. Back up that directory. No public authentication is implemented; deployment follows the existing private LAN/Tailscale model.

The stack is registered in `scripts/deploy.sh`. A push to the repository’s deployment branch will build it through the existing workflow. Source changes have not been pushed or deployed as part of this iteration.

## Try the learning loop

1. Open an active path and select a concept.
2. Select **Learn this concept** or **Start voice lesson** on Today.
3. In Settings, choose a voice/model (Cedar and GPT-Live are defaults). Enter an API key for this connection, or configure `OPENAI_API_KEY` in the server environment. Keys are not saved by the app. The server key must be passed into the container explicitly if using Docker.
4. Start the conversation and allow microphone access. The tutor receives the saved session context and can show equations, plots, charts and diagrams.
5. Choose **Finish and review lesson**, or ask the tutor for a recap. The app validates the proposal without writing it.
6. Correct notes, confidence, evidence or state, then choose **Accept and save**.
7. Open the concept’s Notes, Evidence and History tabs to see the result.

Microphone access requires localhost or trusted HTTPS; plain HTTP over a phone’s LAN/Tailscale address will not work. The 15-minute limit requests a recap and allows up to one extra minute before disconnecting. Closing a lesson ends its audio; unfinished live conversations are not stored or replayed. A pending session preserves lesson context, not the unsaved conversation.

The app remains private and unauthenticated. Do not expose the API publicly, especially with a server API key. Audio goes to OpenAI and is billed separately from ChatGPT. Explore planning and quick idea capture retain their existing flows for now.

The strict v0.1 contract uses `schema_version`, `session_id`, `tree_id`, `topics`, and `questions`. Each topic uses `concept_id`, `summary`, `evidence`, `confidence`, and `state`. The generated prompt supplies exact IDs and a full template. Unknown fields, unknown/repeated concept IDs, mismatched sessions, unsupported states, and duplicate accepted sessions are rejected. “Understood” requires nonempty evidence. Original accepted recaps remain in session history when later sessions update the current notes.

## Checks

```sh
# From apps/learning-app, with requirements installed:
python -m unittest discover -s tests -v
node --test voice-ui/*.test.mjs
# From frontend, with dependencies installed:
npm run build
```

The API tests exercise actual ASGI HTTP routes, covering import review without mutation, acceptance and persistence, duplicate prevention, malformed schemas, unknown concepts, path/session mismatches, idea CRUD, and scoped path creation.

## Next iterations

- Real AI advising, learner profile, prerequisite assessment, dynamic suggestions, and weekly review.
- Editing map structure, branching and shared concepts across paths; new paths currently start as simple sequences.
- Editable existing path goals, explicit assessment undo, and archival controls.
- Spaced-review scheduling, source citations, and richer concept notes.
- ChatGPT tree-plan imports, Apple Shortcuts, PWA installation, and existing-app integrations.

Rendering (`frontend/src/ConceptMap.tsx`), domain types/recommendation rules (`frontend/src/model.ts`), UI (`frontend/src/main.tsx`, `style.css`), API validation (`app/main.py`), and sample content (`app/seed.py`) are separate so the interface can change without replacing the learning records.
