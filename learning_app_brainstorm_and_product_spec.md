# Personal Learning App — Brainstorm, Vision, and Prototype Specification

**Status:** Working product brief / design memory  
**Date:** November 6, 2026  
**Purpose:** Capture the full brainstorming discussion, including settled preferences, possible features, decisions still to make, and a practical first-prototype direction. This is not a final implementation specification.

> **Core idea:** A self-hosted, AI-guided learning app that helps me decide *what* to learn, scope meaningful learning paths, spend about 10–15 minutes per day learning through **ChatGPT Voice**, and build an evolving, reviewable map of what I actually understand. It should be structured enough to cover essential foundations, but flexible enough to follow my curiosity.

---

## 1. Why I want this

I have many interests and want to develop deeper knowledge and a better working vocabulary across them. I especially like learning through a conversational voice session with ChatGPT: I can ask spontaneous questions, request examples, clarify confusing ideas, and explore at my own pace. My problem is that these conversations do not naturally connect to a persistent learning plan or an organized record of what I know.

I already have a **theology app** for Bible reading, other readings, study notes, and an AI assistant. That app is valuable as an organized library, but this new product would address a broader problem: helping me **choose, sequence, and retain** learning across subjects, including theology, computer science, machine learning, algorithms, and other changing interests.

The goal is **not** to build a replacement ChatGPT Voice assistant or a rigid course-completion app. It is to build the learning-management, advisory, memory, and visualization layer around a voice tutor I already enjoy using.

### Success would feel like this

- I open the app and it gives me a sensible suggestion for what to learn today.
- I can choose the general subject (for instance, theology versus computer science), but within a subject the app generally preserves continuity in the current learning path.
- I have a roughly 10–15 minute, highly interactive ChatGPT Voice session.
- At the end, the custom GPT produces a structured recap I can send back to my homelab app.
- The app updates my concept map, my demonstrated understanding, relevant notes, weak points, and possible next lessons.
- The next lesson responds to my actual questions and gaps without losing sight of essential foundational topics.
- Over weeks or months I can revisit concepts, explain them to others, and finish a path at the level I originally chose.

---

## 2. Product principles and decisions

These were the strongest preferences expressed in the conversation.

1. **Voice-first learning, not voice built from scratch.** Keep using native ChatGPT Voice because conversational quality and responsiveness matter more than eliminating one copy/paste step.
2. **ChatGPT Voice subscription and API use are separate concerns.** Use the existing ChatGPT experience for tutoring; use high-quality API models in the homelab app for advisory, planning, parsing, and personalization as needed. Do not assume a ChatGPT subscription supplies API usage.
3. **Self-hosted web app.** Deploy alongside my other homelab applications, using the existing Docker Compose / Caddy / Tailscale style. Optimize for mobile while supporting desktop.
4. **Small daily commitment.** Target about **10–15 minutes** per learning day, with occasional longer or different sessions when worthwhile.
5. **Structure plus curiosity.** A learning path should identify and cover critical foundations but let my interests steer ordering, depth, and side explorations.
6. **Distinct, finishable paths.** Each learning tree has a scope and intended outcome. I can complete or pause it without pretending I have completed an entire academic discipline.
7. **Understand, don't just check off lessons.** Track exposure, confidence, evidence of understanding, review needs, and knowledge gaps separately.
8. **Concept-driven visual map.** Map nodes primarily represent concepts, not individual days. Daily sessions contribute evidence and notes to one or multiple nodes.
9. **Progressive, directional visualization.** Prefer a graph with a clear foundational-to-advanced direction—probably **left to right**, possibly bottom to top—with natural branching like a video-game skill tree. Avoid an overly rigid vertical course ladder or a purely decorative, undirected constellation.
10. **Flexible, nested organization.** Broad categories and optional subcategories function like folders; they are not themselves learning paths that need to be completed.
11. **Very low-friction idea capture.** A place to drop random thoughts and interests, without the AI responding to every entry or giving every stray idea major weight.
12. **AI-generated notes with editorial control.** I don't want to manually take lots of iPad notes. Generate summaries automatically, then let me keep, edit, or discard what is useful.
13. **UI matters a lot.** Begin with an iteratable visual prototype, keep the underlying learning data separate from rendering, and refine the interface after seeing it in use.
14. **Recommendations should be visible without asking.** Show personalized suggested learning trees below active ones so I can discover an appealing topic organically.
15. **Learning should draw on my real life.** Incorporate, when appropriate, current university courses, existing knowledge, theology readings, current commitments, and interest notes.

---

## 3. The conceptual hierarchy: folders, trees, concepts, and sessions

### 3.1 Categories are organizational folders

A category can contain subcategories, learning trees, or both. Nesting is optional and should not force a fixed depth.

```text
Theology                           [Category / folder]
├── Thomism                        [Optional subcategory / folder]
│   ├── Foundations of Thomistic metaphysics   [Finite learning tree]
│   └── Aquinas on grace and free will         [Finite learning tree]
├── Saints                         [Optional subcategory]
│   └── St. Augustine's key ideas             [Finite learning tree]
└── Christian masculinity          [Finite learning tree directly in Theology]

Computer Science                   [Category / folder]
├── Artificial Intelligence        [Optional subcategory]
│   ├── Machine learning foundations          [Finite learning tree]
│   ├── Large language models                 [Finite learning tree]
│   └── Reinforcement learning                [Possible learning tree]
├── Algorithms                     [Optional subcategory]
│   └── Graph algorithms for interviews       [Finite learning tree]
└── Networking fundamentals        [Possible tree directly in Computer Science]

Music                              [Category / folder]
└── [Possible future paths]
```

These labels are **illustrative**, not an approved taxonomy. A broad topic like “Thomism” might be a folder holding several specific paths rather than one enormous, never-ending tree. A smaller one-off topic can live directly under a broad category.

### 3.2 A learning tree is a scoped objective

A tree is not defined by an arbitrary node count or mandatory five-/ten-/thirty-day length. Its scope should come from **what I want to be able to do at the end**.

Examples:

- **Machine learning foundations:** Speak comfortably using core ML vocabulary, follow a basic technical conversation, and answer introductory interview questions.
- **Graph algorithms for interviews:** Recognize the problem conditions under which to use Dijkstra, Kruskal, and other common graph algorithms, and explain why.
- **A specific saint:** Understand that saint's major teachings and relevant historical or theological context well enough to discuss them.

Every planned tree should have:

- A **title**, a **category/folder**, and a clear **why this matters to me**.
- A few explicit **learning outcomes** framed as capabilities (“I can explain…”, “I can compare…”, “I can solve…”).
- A proposed **scope and depth** (conversational familiarity versus interview readiness versus deeper technical mastery).
- A rough **effort estimate** in sessions or minutes, presented as adjustable, not a guarantee.
- A description of **what is included and deliberately excluded**.
- Major **foundations and prerequisites**, including what I already know or need to refresh.
- A flexible **concept map** and an initial suggested route.
- A **completion/exit criterion** linked to outcomes, not merely a fixed number of lessons.

A tree has a lifecycle such as **exploring → planned → active → paused → completed**. “Completed” means satisfied at the chosen depth, not that there is nothing more to learn about the subject. I can return later, deepen it, or start a related tree.

### 3.3 Concepts form the tree; sessions form its history

**Preferred current direction:** Each visible node represents a *concept*, with linked notes and evidence from however many sessions touched on it. A day of learning might contribute to multiple concepts, and a difficult concept might take multiple days.

For instance, a tree on ML might include nodes for gradient descent, learning rates, neural networks, and backpropagation. If I spend three sessions on learning rates, those sessions should enrich **one concept record** rather than create three unrelated map nodes.

Concepts can have relationships such as:

- **Requires / prerequisite of** (a foundational dependency)
- **Related to / reinforces** (a conceptual connection)
- **Explored from** (a side branch sparked by curiosity)
- **Appears in another tree** (shared concept or a link to shared understanding)

The exact data representation and diagram interaction remain undecided.

---

## 4. A dedicated experience for discovering and scoping trees

This should be more significant than a simple **“Create tree”** form. I often know I want to be “more knowledgeable in AI” or “better at theology” without knowing which subtopics are valuable, where to begin, or how deep I should go.

### 4.1 Explore before committing

I can start with a vague interest, e.g. “I want to understand machine learning enough to converse about it and answer basic questions.” A strong AI learning advisor helps me translate that into different realistic scopes and potential paths.

An exploration workflow might:

1. Ask what interests me and why, in a conversational way.
2. Offer a few viable path options—not just blindly generate a course.
3. Explain practical outcomes: what I will understand, be able to explain, and be able to do.
4. Identify essential prerequisites and ask about my prior experience.
5. Estimate effort and distinguish an introductory path from a deeper one.
6. Explicitly call out excluded topics and important concepts I might not think to ask about.
7. Let me revise scope, depth, pace, and focus.
8. Save an exploratory draft without demanding an immediate commitment.
9. Activate the path when I decide to start.

I especially like the possibility of a **one-off voice session dedicated entirely to designing a new tree**. The app could generate a rich prompt for ChatGPT Voice, I could discuss options and scope aloud, and then import a structured plan back into the app—similar to how daily lesson results are imported.

### 4.2 Personalized recommendation feed

Below current/active trees, show **suggested trees** that catch my eye even when I am not actively trying to find a new subject.

Suggestions could come from:

- Ideas and interests I have mentioned.
- Existing active or completed learning trees.
- Adjacent foundations that would be helpful (e.g. statistics for ML).
- My courses, assignments, projects, books, and theology readings.
- Current or recurring life responsibilities and goals.
- Topics I once expressed interest in and might want to revisit.

Each suggestion should explain **why it is relevant**, what I would gain, a proposed scope, and an approximate time commitment. It should be easy to **explore, save for later, dismiss, or turn into a planned tree**. Recommendations are suggestions, not automatic commitments.

### 4.3 Managing the number of active paths

I could be interested in many trees but realistically only work on a few at once. The advisor should recommend when to **start, pause, rotate, or complete** a path and warn when adding another may fragment my attention. This should be advice, not a rigid maximum.

---

## 5. Daily learning: structure that adapts to me

### 5.1 Suggested daily workflow

A typical session may look like:

1. **Open home screen.** See today's recommended learning activity (and possibly alternate subjects).
2. **Choose the broad subject if desired.** If I choose computer science, the app typically continues the current CS tree rather than jumping to random concepts.
3. **Preview the session.** Short objective, expected time, relevant previously learned concepts, and important readings/prerequisites.
4. **Generate or copy a tutor prompt.** The app includes current context, goals, concept definitions, gaps, and teaching instructions.
5. **Open ChatGPT Voice.** Have a conversational, question-driven session for about 10–15 minutes.
6. **End with structured notes and learning assessment.** The custom GPT prepares an importable output when I request it.
7. **Send the output back through copy/paste and/or an Apple Shortcut.** The homelab app parses and reviews it.
8. **Review any proposed changes.** Keep useful notes, correct an assessment, accept/defer a direction change, and confirm the next session plan.

The experience should be lightweight enough for a normal day, while allowing longer explorations when I am especially interested.

### 5.2 It should change direction based on the conversation

Suppose I begin a general ML session but ask many questions about reinforcement learning. The tutor can recognize the interest and, near the end, suggest a detour or new branch:

> “You seemed especially interested in reinforcement learning. Would you like to explore that next? Here's what it covers and why it connects to what you know.”

I can ask follow-up questions and decide. If I approve, the app updates the plan accordingly, **without forgetting the foundational concepts still needed**. Curiosity should influence the route, not silently erase the intended learning outcomes.

### 5.3 Daily activity types

The discussion identified or suggested several kinds of sessions:

- **New concept:** Move forward along the chosen tree.
- **Reinforcement / recall:** Revisit prior material at useful intervals or in a new context.
- **Prerequisite refresh:** Briefly learn or relearn a foundation needed for a coming lesson.
- **Deep dive:** Follow a particularly interesting question for one or more sessions.
- **Tree design / exploration:** Use a day to discuss and scope a possible new tree instead of taking a normal lesson.
- **Weekly reflection / advisor review:** Review progress, workload, gaps, and direction.
- **Mode-specific sessions:** Adjust teaching style for conversational theology versus technical algorithmic problem-solving.

A completely unrelated one-off exploration day is possible, but the tree-planning session was the more specific version that appealed to me.

---

## 6. Using ChatGPT Voice and importing results

### 6.1 Chosen integration approach

**Important constraint:** Native ChatGPT Voice is the preferred tutor. Building a competing real-time voice bot would likely make the learning experience worse, even if it allowed tighter integration.

The initial workflow is intentionally **copy/paste based**:

- The learning app generates a detailed **session context/prompt**.
- I paste/share it to a **custom GPT** with stable tutoring and structured-output instructions.
- I talk naturally through **ChatGPT Voice**.
- At the end, I ask for a detailed **structured export**.
- I copy the export and use an **Apple Shortcut** (or a paste field in the web app) to submit it to the homelab API.
- The app parses the result, shows any decisions that need review, and updates the right tree/concepts.

This is not a disposable workaround: if it works well, it may remain the preferred workflow indefinitely. Avoid making an inferior voice solution merely to remove the last manual step.

**Implementation note:** The precise behavior and availability of custom GPTs in the intended ChatGPT voice experience should be verified when building. The product can keep the same structured prompt/export idea even if the exact ChatGPT entry point changes.

### 6.2 What the custom GPT should do

The tutor instructions will require deliberate design and testing. Broad goals:

- Teach via **dialogue**, not a long uninterrupted lecture.
- Adapt difficulty, pace, examples, and questioning to my familiarity.
- Accept my spontaneous questions without losing the larger objective.
- Occasionally ask for **active recall** and for me to explain a concept in my own words.
- Distinguish **“I say it makes sense”** from **“I've demonstrated it”**.
- Notice confusion, prerequisite gaps, and promising interests.
- Encourage relevant links to other concepts and prior lessons.
- Suggest optional changes in direction, but **ask before treating major curriculum changes as approved**.
- At session end, provide comprehensive notes and a reliable structured assessment for the app.
- Preserve uncertainty: it should not claim mastery based on weak evidence or invent what was discussed.

### 6.3 Proposed export structure (draft, not finalized)

Prefer a clearly delimited, versioned machine-readable block, likely JSON, plus optional readable notes. A possible shape:

```json
{
  "schema_version": "0.1",
  "session_id": "session-from-app",
  "tree_id": "ml-foundations",
  "session_type": "new_concept",
  "duration_minutes_estimate": 15,
  "topics_covered": [
    {
      "concept_id": "gradient-descent",
      "concept_title": "Gradient descent",
      "summary": "...",
      "key_takeaways": ["..."],
      "examples": ["..."],
      "misconceptions_or_confusions": ["..."],
      "learner_reported_confidence": "comfortable",
      "demonstrated_understanding": "partial",
      "evidence": "Learner explained the basic update idea but hesitated on learning rate.",
      "suggested_next_review": "..."
    }
  ],
  "questions_asked": ["..."],
  "new_interests_detected": ["reinforcement learning"],
  "missing_prerequisites": ["learning rates"],
  "suggested_next_steps": [
    {
      "kind": "lesson_or_branch",
      "title": "Learning rates and convergence",
      "reason": "...",
      "requires_approval": true
    }
  ],
  "notes_for_review": "..."
}
```

This is just a **candidate contract**. We should later determine how concept IDs are supplied, how to prevent malformed exports, what to do with partial sessions, and how much should be auto-applied versus confirmed. The backend should validate inputs and handle duplicate imports idempotently.

### 6.4 Two separate prompts may help

- **Session instruction prompt:** Intended learning objective, current path, known and weak prerequisites, prior notes, relevant reading context, time target, and teaching style.
- **Session end/export instruction:** Specific required notes and JSON fields, confidence caveats, suggested branching, and a clear end marker that is easy to copy into an Apple Shortcut.

A separate **tree design prompt** would support sessions devoted to scoping a new path.

---

## 7. Measuring knowledge, prerequisites, and review

### 7.1 Distinguish prior exposure from current understanding

This matters because I may have studied something in class yet no longer remember it well. Example: I have encountered eigenvalues/eigenvectors and linear algebra, but might need a refresh to use them confidently in robotics or ML.

A concept record should distinguish at least:

- **Prior exposure:** Have I encountered this before—in a course, project, reading, or prior session?
- **Self-reported confidence:** Do I feel I understand it?
- **Observed evidence:** Could I explain, compare, apply, or solve something using it during a session?
- **Current working understanding:** The app's provisional estimate, with uncertainty.
- **Last reviewed and future recall needs:** Has the idea remained accessible over time?

Avoid falsely precise “mastery scores” if the evidence is a short ungraded voice conversation.

### 7.2 Upfront prerequisite check + dynamic checks

Preferred **hybrid** approach:

1. When scoping a tree, the advisor maps essential prerequisites and asks which I already know, once learned, or never studied.
2. Before a lesson, it checks whether the upcoming concept depends on a missing or rusty foundation.
3. If necessary, insert a **small just-in-time refresher** (perhaps one idea from calculus) rather than forcing me to complete an unrelated full calculus tree.
4. During a voice session, if a gap becomes apparent, the tutor can propose a quick review or future lesson.
5. The app updates the knowledge record based on the export and future evidence.

**Guardrail:** Do not block every advanced topic until every prerequisite is formally marked mastered. Prefer explaining what is critical and offering a minimal bridge unless lack of prerequisites would truly undermine the lesson.

### 7.3 Active recall and spaced repetition without busywork

Examples discussed:

- Day 1: Learn gradient descent and discover uncertainty about learning rate.
- Day 2: Briefly review learning rate before continuing to neural networks.
- Later: While learning backpropagation, explain how gradient descent updates weights.
- Later still: A short recall check, with reduced review frequency when understanding is demonstrated.

The theology version might prompt me to recall grace and free will while learning Augustine's teaching on predestination. This makes review **contextual** rather than requiring a stack of generic flashcards.

### 7.4 Share knowledge between trees

If two trees use the same foundational concept, the app should ideally recognize the overlap. A concept learned in a linear algebra refresher should inform readiness for robotics, ML, and relevant future trees.

Need to decide whether this is a **single global concept record** referenced by many trees, or separate tree-local records linked to one canonical concept. Either way, avoid duplicating and contradicting personal understanding states. This is a design decision, not yet settled.

---

## 8. Notes and the knowledge library

Each tree should automatically accumulate a **reviewable body of notes organized by concept**, not merely a chronological transcript. Clicking a concept on the map should eventually show:

- A concise, current explanation.
- Important terms and definitions.
- Examples, analogies, and applications.
- What I have said I understand versus what I have demonstrated.
- Confusions and unresolved questions.
- Links to prerequisite and related concepts.
- Readings and source references where applicable.
- Relevant earlier sessions and how my understanding evolved.
- Suggested recall or review prompts.

I should be able to **accept, edit, reject, and keep** generated notes. The system should not blindly accumulate unreviewed AI explanations as authoritative knowledge. For theology, where distinctions and source accuracy matter, retain reading citations and avoid presenting an unsourced paraphrase as a direct teaching of a saint.

**Main preference:** Organize by **concept**, with day-by-day history accessible from concept details. The exact display of that history can wait until we have a mockup.

---

## 9. Persistent learner profile and frictionless interest capture

### 9.1 Learner profile / context

The app needs to know my educational background, goals, interests, current commitments, and preferred learning style. It should be more useful than a static markdown file that an AI inconsistently reads.

Potential fields:

- Long-running interests and subjects I am curious about.
- Goals and desired proficiency levels for active trees.
- Current and previously studied topics (including relevant university courses).
- Strong fundamentals, rusty fundamentals, and known gaps.
- Learning preferences: voice dialogue, daily 10–15 minute sessions, minimal manual notes, mixed mobile/desktop.
- Books, readings, projects, and responsibilities that might make topics relevant now.
- Previously dismissed or deferred subjects, to avoid nagging.
- History of how interests changed over time.

### 9.2 “Idea inbox” / interest dump

Somewhere in the app, there should be an extremely quick way to add thoughts such as:

- “Networking has been interesting while working on the homelab.”
- “I've been getting more interested in VR.”
- “I'm working on web design and would like to understand more.”
- “I'm the head of the intellectual board for University Catholic; learning relevant topics could help.”

**Critical behavior:** The app mostly just **remembers** the raw thought. It should not force me to select a category, create a tree, respond in detail, or commit to anything. Later, the advisor can use these notes as weak contextual signals in recommendations, and may ask whether an older interest is still relevant.

The app should distinguish:

1. **Raw user-provided statement** (retain original wording and date).
2. **AI-inferred interest / tags** (tentative, low confidence until reinforced).
3. **Confirmed learning goal** (something I actually chose to pursue).

Random thoughts should not all receive equal weight. Offer easy editing, archiving, deletion, and “not interested anymore.” A short-lived thought should not become a permanent identity statement.

### 9.3 Storage idea

An initial idea discussed was **database-backed data with an editable/generated markdown context summary**. The database could store raw entries, metadata, source, timestamps, and relationships; the AI receives a compact, relevant summary for each task, not the entire life log.

This approach was a **candidate**, not a hard requirement. The central requirement is robust contextual retrieval and revision, avoiding the brittleness of a single giant markdown file.

---

## 10. Connections to the existing homelab

The README provides the technical baseline:

- Ubuntu Server with independently deployed **Docker Compose stacks**.
- **Pi-hole** for DNS, **Caddy** for reverse proxy, and **Tailscale** for remote access, with `*.home.arpa` hostnames.
- A self-hosted GitHub Actions runner for targeted deploys on changes to `main`.
- Other custom apps commonly use **FastAPI** backends and **React / Vite / Tailwind** frontends, with SQLite for persistence.
- A custom dashboard, finance app, homework tracker, guitar app, and theology app, alongside Home Assistant, Jellyfin, Uptime Kuma, and Portainer.
- Separation of repository configuration/source from host runtime state (e.g. `/srv/appdata`).

### 10.1 Potential integrations

**Homework app:** Pull relevant classes and assignments so the learning advisor understands what I am currently studying. This might inspire supporting lessons or refreshers, but the learning app should not merely mirror homework tasks.

**Theology app:** Integrate existing Bible passages, readings, study notes, and books so they can serve as lesson source material, reading suggestions, and context. Keep the theology app as its own content/reading system; the learning app is the broader planner, tutor companion, and knowledge map.

**General project context:** My activities (homelab networking, VR, robotics, web design) can inform recommendations without becoming mandatory trees.

**Dashboard:** Eventually consider a home-dashboard tile with today's lesson, active paths, and possibly this week's review.

**Apple Shortcuts:** Useful for importing structured ChatGPT results and, potentially, one-tap interest capture.

**PWA:** Mobile-friendly web experience that can be added to the iPhone home screen. The theology app is separately being refactored as a web app; home-screen installation and push notifications have been explored there. Notifications for this new app are a possible later feature, **not a settled requirement**.

### 10.2 High-level architecture sketch

```text
                  ┌───────────────────────────────┐
                  │ iPhone / Desktop Web App      │
                  │ React + responsive UI / PWA   │
                  └───────────────┬───────────────┘
                                  │
                          Caddy / Tailscale
                                  │
                  ┌───────────────▼───────────────┐
                  │ Learning App API (FastAPI)    │
                  │ planning · trees · notes      │
                  │ profile · import · advisor    │
                  └──────┬─────────┬──────────────┘
                         │         │
                  SQLite/DB    AI model API
                         │
                  Optional internal APIs
                  (homework, theology)

                  Separate conversational loop:
          App builds prompt → ChatGPT Voice (native app)
               → structured end-of-session export
               → copy / Apple Shortcut → Learning App API
```

Keep AI-model calls behind server-side endpoints; do not expose API secrets in the frontend.

---

## 11. UI / UX direction — important, still exploratory

**Design for mobile first, while working well on desktop.** The app may be used mainly from the phone, with occasional desktop planning and browsing.

### 11.1 Home screen / dashboard

Potential sections:

- **Today's learning:** One clear recommended 10–15 minute activity, with start/copy prompt controls.
- **Active learning trees:** Cards showing title, purpose, next topic, momentum, and meaningful progress.
- **Suggested trees:** A browsable feed **below current trees** with attractive, contextual recommendations and reasons for each.
- **Explore / plan a tree:** Entry to an advisor conversation and structured tree-design workflow.
- **Quick idea inbox:** Low-friction capture accessible anywhere; possibly a floating button.
- **Weekly advisor:** A small status or “review your week” entry.

These are *screen concepts*, not approved visual layouts. We explicitly deferred fine-grained UI questions until seeing mockups.

### 11.2 Individual learning tree view

Evolved visual preference:

- A **concept map**, not a literal illustrated tree or a fixed Duolingo ladder.
- **Branches** show prerequisites, side explorations, and relationships.
- A clear **direction of advancement**, likely **left-to-right** (foundations on the left, more advanced or specialized concepts on the right). Bottom-to-top is another possibility.
- A natural, evolving visual feel like a **video-game skill tree**, without requiring all nodes to be predefined or evenly spaced.
- Concept state could be expressed visually: unknown / introduced / developing / understood / needs review. Color is one possibility, but the earlier mockup's specific color palette and styling were **not liked/approved**.
- Tap a concept to see its generated notes, current confidence/evidence, connections, and session history.
- Give an indication of the next recommended concepts and possible side branches.
- The map should be able to grow without breaking the layout.

The user liked the **knowledge-map/constellation idea** more than the original polished, glowing literal-tree dashboard, but wants it to have a stronger directional flow.

### 11.3 Levels of map

There was discussion of the same visual language at multiple levels:

- A broad overview of categories and learning paths.
- **Primary priority:** a clear map **inside each learning tree**.
- Detailed concept view on selection.

An all-knowledge, cross-tree map may be interesting later, but it should not eclipse the individual-tree view.

### 11.4 Planning / explorer screen

A place to discuss new interests, compare alternative scopes, inspect prerequisites and outcomes, and decide whether to make a tree active. One option is to generate a prompt for a **ChatGPT Voice tree-planning conversation**, followed by a structured import.

### 11.5 Notes view

The knowledge library could live **inside the tree and concept detail view**, rather than being a separate, disconnected notes app. Add search / browsing later if needed.

### 11.6 UI implementation philosophy

Create a **basic visual prototype first**, then iterate. Keep data models, layout algorithms, and component styling separated so we can radically change the visual presentation without losing learning content. Do not over-commit to colors, sizes, animation, map controls, or history panels before testing the first version.

---

## 12. Weekly advisor and longer-term rhythms

The **weekly learning review** was explicitly singled out as a good feature to include.

Possible review content:

- Which concepts and trees I worked on this week.
- What I can explain well and what remains shaky.
- Foundational gaps surfaced during sessions.
- New interests that emerged repeatedly.
- Whether I have too many active trees.
- Suggested priorities and learning paths for the upcoming week.
- Whether to continue, pause, complete, or rescope a tree.

The app should offer recommendations rather than auto-changing commitments. Scheduling it on Sunday was raised as an illustrative example, **not a fixed decision**.

The **tree-planning / exploration day** is also appealing: occasionally replace a normal lesson with a session devoted to choosing, scoping, and designing a new learning path.

---

## 13. AI strategy

Use **capable, high-quality AI models**, especially for curriculum design, intelligent prerequisite identification, personalized advising, understanding assessment, and structured-import interpretation. We discussed using newer/high-end GPT-family models rather than inexpensive but insufficiently capable models for every task.

Suggested division of responsibilities:

| Responsibility | Approach |
|---|---|
| Live, natural tutor conversation | Native ChatGPT Voice |
| Tree discovery and scoping | Strong server-side AI model |
| Daily lesson selection and routing | AI planning + explicit curriculum/prerequisite rules |
| Session recap ingestion | Schema validation; AI normalization only where needed |
| Knowledge/interest retrieval | Structured DB + focused context selection |
| Recommendations and weekly review | Strong model with concise, evidence-backed inputs |
| Deterministic operations | Ordinary code (IDs, validation, scheduling, state transitions) |

The exact GPT version, API pricing, token usage, and tradeoffs should be evaluated closer to implementation. Avoid assuming that a more expensive model always improves every task. ChatGPT's consumer subscription and the app's API billing should be budgeted separately.

### Reliability principle

AI should **propose** changes to curriculum, knowledge state, and notes; the application should **validate** structured inputs and preserve the evidence. Important changes (new branch, altered goal, marked mastery, completed tree) should be reversible and sometimes user-confirmed. This reduces the risk of an increasingly inaccurate learner profile.

---

## 14. Candidate data model (early design proposal)

This was not fully decided in conversation; it is a practical starting model for the prototype.

| Entity | Key information |
|---|---|
| `Category` | id, name, optional `parent_id`, order |
| `LearningTree` | id, title, category, goal, scope, depth, inclusions/exclusions, status, estimated workload |
| `LearningOutcome` | tree, measurable capability, target standard, evidence |
| `Concept` | id, title, summary, global/topic identity |
| `TreeConcept` | tree + concept, relative position, planned depth, importance, status |
| `ConceptEdge` | from/to concept, tree, prerequisite/related/exploration relationship |
| `KnowledgeState` | concept, prior exposure, self-rating, observed evidence, last review, uncertainty |
| `LearningSession` | date, tree, session type, planned objective, context prompt, duration, import status |
| `SessionConceptEvidence` | session, concept, notes, examples, understanding, confusion |
| `GeneratedNote` | concept/tree, content, source session, accepted/edited/rejected state |
| `InterestInboxEntry` | raw thought, created_at, source, optional tags, archived/dismissed state |
| `LearnerProfile` | reviewed stable facts/preferences + derived summary/version |
| `SuggestedTree` | proposed topic, rationale, source signals, status |
| `ImportRecord` | raw payload, schema version, validation state, deduplication key |
| `WeeklyReview` | period, summary, proposed schedule, decisions |

Not every table is needed for the MVP. This is meant to preserve the distinction between **subject organization, path plans, concept knowledge, session history, and informal interests**.

---

## 15. MVP recommendation: prototype the experience, not the entire ecosystem

Given the emphasis on a polished, iteratable UI, a staged approach makes sense.

### Stage A — Clickable visual prototype

Build mobile-first screens with **sample data**:

1. **Home/dashboard** with today's learning, active trees, suggestions, and quick idea capture.
2. **Tree view** with an interactive, directional concept graph and concept detail panel.
3. **Tree exploration/scoping** with goals, outcomes, scope, prerequisites, and provisional plan.
4. **Session flow** showing prompt export, placeholder import, and a proposed notes/progress review.

Use realistic sample trees such as ML foundations and graph algorithms. At this stage, prioritize visual structure, navigation, and meaningful interactions, not AI integration.

### Stage B — Working vertical slice

Implement **one full loop** end to end:

1. Create a scoped tree.
2. Generate a single session prompt.
3. Use native ChatGPT Voice.
4. Import a structured session recap (paste field first; Shortcut next).
5. Update concept notes and state with a review step.
6. Display new learning evidence on the graph.
7. Recommend a sensible next session.

This tests the key promise before expanding to every feature.

### Stage C — Personalization and advisory

Add prerequisite assessment, learner profile, idea inbox, stronger recommendations, weekly reviews, and adaptive curriculum routing. Integrate homework and theology context if/when their APIs and data formats are practical.

### Stage D — Advanced quality and convenience

Cross-tree shared concepts, better spaced review, robust change history, richer reading source links, notifications if worthwhile, deeper analytics, and improved voice-to-app handoffs **without replacing ChatGPT Voice**.

---

## 16. Potential pitfalls to avoid

1. **Endless scope creep:** If a tree becomes the entirety of “AI” or “theology,” it loses a meaningful finish line. Use specific outcomes and subpaths.
2. **Too much branching:** A purely interest-driven curriculum could skip essential foundational material. Keep a core coverage map and offer detours rather than replacing the core.
3. **Artificial rigidity:** Do not demand that everything be organized into fixed-depth categories, predetermined lesson counts, or completion percentages.
4. **False mastery:** “I understand” and even a good short explanation are evidence, not certainty. Track confidence and evidence explicitly.
5. **Noisy interest tracking:** A casual idea should be remembered but not treated like a permanent, high-priority goal.
6. **Unusable AI memory:** A giant context file passed to every prompt becomes noisy and inconsistent. Keep raw data, curate meaningful summaries, and retrieve context relevant to the task.
7. **Unreliable structured imports:** Plan for malformed output, partial sessions, duplicate pastes, uncertain IDs, and proposed changes requiring confirmation.
8. **Losing source fidelity:** AI-generated theology explanations and technical claims should remain traceable to readings or references where possible.
9. **Complicated UI too early:** The concept graph might look beautiful but be hard to navigate on a phone. Test the actual flow before investing in polish.
10. **Overbuilding voice infrastructure:** Do not trade the conversational quality of ChatGPT Voice for a technically integrated but frustrating substitute.
11. **Unnecessarily expensive AI calls:** Use strong models for judgment-heavy tasks and code/validation for straightforward operations.
12. **Conflating notes and events:** Concepts are enduring knowledge objects; daily sessions are events that add evidence to them.

---

## 17. Open product questions (do not mistake these for settled decisions)

### Learning experience

- How many daily sessions per week should be the default? Is there a preferred day for the weekly review?
- Should daily recommendations select among all active trees automatically, or first ask me to pick a broad subject?
- How should the advisor decide between essential coverage, curiosity-driven detours, and review?
- When does a tree count as “complete” at its chosen depth?
- How much confirmation should be required before changing a tree's direction?

### Knowledge assessment

- What set of states is meaningful without implying false precision?
- How often should the GPT test recall explicitly versus inferring understanding from dialogue?
- How should I override or correct its judgment?
- Which concepts should be global/shared versus scoped to a particular tree?

### UI design

- What specific visual style, color scheme, density, and animation feel right?
- Should the graph flow left-to-right by default, with a vertical option on narrow screens?
- How should concept details, notes, and session history appear on a small phone?
- How should the app present a large, evolving tree without making the map unwieldy?
- Is a global, cross-tree map valuable, or should it be a later optional feature?

### ChatGPT handoff

- Can the desired custom-GPT-plus-Voice workflow be used exactly as envisioned in the chosen ChatGPT client?
- What export schema reliably captures notes, demonstrated understanding, uncertain inferences, and suggestions?
- Will imports happen through a copy/paste field, a Share Sheet Shortcut, both, or another supported integration?
- Should session prompts explicitly include IDs so the result maps back to the correct tree and concept?

### Data and integrations

- Which existing theology-app and homework-app endpoints are available to use?
- How should current courses, readings, and projects be synchronized without adding noisy context?
- What should the initial learner-profile onboarding conversation look like?
- How should the app recheck older interests without becoming annoying?

---

## 18. Concrete examples to use when prototyping

### Example A — Machine Learning Foundations

**Category:** Computer Science → Artificial Intelligence  
**Goal:** Understand fundamental ML concepts, use vocabulary confidently in conversation, and answer introductory interview questions.  
**Potential map:** Data and models → training/objective functions → gradient descent / learning rates → evaluation / overfitting → neural network foundations → elective side branches.  
**Adaptive behavior:** If I show strong interest in reinforcement learning, suggest a branch with its prerequisites and effort estimate, while keeping core ML gaps visible.

### Example B — Graph Algorithms for Interviews

**Category:** Computer Science → Algorithms  
**Goal:** Know when to choose algorithms like Dijkstra and Kruskal and justify choices based on problem properties.  
**Teaching mode:** More practice problems, verbal reasoning, comparisons, and active recall than a purely lecture-based session.  
**Assessment:** Can I identify key constraints and explain the algorithm choice without cues?

### Example C — Thomistic Theology

**Category:** Theology → Thomism  
**Possible subpaths:** Metaphysics; grace and free will; other bounded themes.  
**Integration:** Pull relevant readings and existing theology-app notes when available, generate concept notes, and link related teachings and source passages.

### Example D — One-time Prerequisite Refresher

**Situation:** An upcoming robotics or ML concept requires eigenvectors.  
**Learner state:** Studied it in a class, but retention is weak.  
**Action:** Insert a brief targeted refresher, record it as evidence under the eigenvectors concept, and return to the original path rather than creating a sprawling linear algebra course.

### Example E — Idea Capture

**Input:** “Working with my homelab has made me curious about networking and DNS.”  
**Immediate behavior:** Save quietly, without generating a new tree.  
**Later behavior:** Suggest a small, scoped networking tree; explain that it relates to my homelab work; offer explore/dismiss/later options.

---

## 19. Proposed next step

**Build and critique two mobile-first mockups before writing a lot of backend code:**

1. **Home screen:** today's session, active paths, suggested topics, idea capture.
2. **Individual learning tree:** a directional, organic, left-to-right graph of concept nodes, with a selected concept displaying notes, evidence, and a next-step recommendation.

Once the visual vocabulary feels right, add a lightweight tree-creation screen and one functional ChatGPT Voice → structured import → concept update loop. This will reveal the most important unknowns while keeping the implementation flexible.

---

## 20. Short handoff prompt for future design/build conversations

> I'm building a self-hosted, mobile-first personal learning web app for my Docker Compose homelab (FastAPI + React/Vite/Tailwind style). It helps me discover and scope **finite learning trees** with explicit outcomes, then learn for ~10–15 minutes a day using **native ChatGPT Voice**. The app generates rich session prompts; after a voice session I copy a structured custom-GPT export into the app, possibly via an Apple Shortcut. The app uses that result to update **concept-based notes**, provisional understanding, prerequisite gaps, review needs, and next-session recommendations. Categories are flexible nested folders; learning trees are outcome-scoped paths; each tree renders an **organic but directional, foundation-to-advanced concept map**, likely left-to-right. I want an AI learning advisor for tree discovery, personalized topic recommendations visible under active trees, a low-friction interest inbox, a persistent contextual learner profile, cross-tree knowledge reuse, weekly reviews, and optional targeted prerequisite refreshers. The UI is essential: start with mobile-first, iteratable mockups and keep the visualization separate from the underlying learning data. Do not build a replacement real-time voice assistant. Treat AI assessments as evidence-based and revisable, preserve user consent for significant plan changes, and keep a clear distinction between decisions and open questions. Read the full product brief before implementing.

