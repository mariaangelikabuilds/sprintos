# SprintOS

Ad-creative sprint automation for performance marketing: brief in, reviewed ad package out. Adapted from a 6-stage blueprint (workspace setup, research, angles, creative production, listicles, reporting) to what can run honestly on real infrastructure today. Meta Ads reporting was cut entirely on 2026-08-10: no ad account exists, so that stage stays out of the product rather than in as theater.

## Locked decisions (2026-08-10)

**Phasing.** Stages 2-3 (research, angles, critique, copy) ship first as one n8n workflow, because they are the stages where AI does real work and where quality is provable. Everything else phases in behind them.

**The research agent actually searches.** Brave Search as an agent tool, minimum three queries per brief, every competitor finding cites what search surfaced it, and anything unverifiable lands in `research_gaps` instead of being invented. A research stage that hallucinates competitor ads would poison every downstream stage.

**Nothing publishes automatically.** Every output ends at `status: "awaiting human review"`. No ad-platform API writes, no auto-posting. The blueprint's "launch ads" step stays human.

**Credential honesty.**
- Live now via n8n credits (managed): Anthropic (claude-sonnet-4-6 on all five LLM stages), Firecrawl search. The managed Brave Search credential is broken at runtime (Brave rejects the gateway token with SUBSCRIPTION_TOKEN_INVALID), which is why Firecrawl is the search backend.
- Live now via Angel's own credentials: Gmail, Google Calendar, Airtable, Slack.
- One OAuth away (not wired): Google Drive, Trello. Stage 1 workspace setup adapts to Airtable + Slack instead.
- Cut: Meta Ads reporting. No ad account, so no reporting stage. Ad copy is written to standard paid-social constraints (primary text under 125 words, headline under 40 chars) without targeting any platform's API.

**Dashboard.** Shipped 2026-08-10 at https://sprintos-one.vercel.app, and the architecture changed on Angel's call to deploy on Vercel: a static React page with NO backend of its own. All state lives in an n8n data table (`sprints`, id 2XZZy3r9LKshQ5rD); the research workflow upserts a row when a brief arrives and writes the finished package into it, and a second workflow (`SprintOS · API`, id 5avcJ6zALawejboW) serves list, detail, and review-decision endpoints over the same table. The original Hono + SQLite + Fly server design was built and locally verified first, then deleted; its callback route died with it because the workflow now writes results to the table directly. Fire-and-forget briefs from the browser make the ~100-second edge timeout irrelevant.

## Locked decisions (2026-08-11, after the audit)

**The operator carries the key; the page holds nothing.** All four webhooks (`sprintos-research`, `sprintos-sprints`, `sprintos-sprint`, `sprintos-decide`) use n8n header auth against one credential, `SprintOS API key`, holding `x-sprintos-key`. The dashboard prompts for it once and keeps it in `localStorage`. Rejected before the shipped state: baking a key into the bundle (a static page cannot hold a secret), and keeping the old in-workflow IF comparing a plaintext string (`angel-approves` sat in the workflow JSON and in `localStorage`, and was guessable from Angel's own name). Header auth also rejects at the edge without starting an execution, which matters on a metered plan. Consequence accepted: the n8n MCP cannot create credentials, so a fresh instance needs that one credential made by hand before anything answers.

**One key, not two.** The review key is gone as a separate concept. With header auth on `sprintos-decide` the old IF node was redundant, so it and its 403 branch were deleted. A single-operator tool with two secrets is two things to rotate and two things to lose.

**Polling is conditional.** The dashboard polls only while a sprint is `running` or inside a three-minute window after a brief is sent, never while the tab is hidden, at 30s rather than 5s. The prior unconditional 5s intervals are what spent 18,503 executions and took the whole n8n instance offline on 2026-08-11. Idle costs nothing now.

**Both workflows have source in the repo.** `SprintOS · API` previously existed only on the instance: deleting it would have been unrecoverable. Its SDK source is at `workflow/sprintos-api.ts`, and the research source was brought back into parity with the live workflow (8 queries, the wider research schema, the autoFix parser, and the two data table writes it had gained since).

## Stage map

| Blueprint stage | Status | Where |
|---|---|---|
| 1. Workspace setup | queued (Airtable + Slack adaptation) | not built |
| 2. AI research | LIVE | n8n `SprintOS · Research & Angles` |
| 3. Angle generation + testing | LIVE | same workflow (generator, critic, copy) |
| 4. Creative production (statics) | queued (Gemini image gen) | not built |
| 5. Listicles | queued | not built |
| 6. Meta Ads reporting | CUT (no ad account; not built as theater) | dropped |

## The live workflow

`SprintOS · Research & Angles`, n8n workflow `PPhDpEGDV6ZzE8pp` on mariaangelika.app.n8n.cloud. Published 2026-08-10; test execution 121 ran the full chain green in 4m41s with 24 live search results.

```
POST /webhook/sprintos-research
  { brand_name, product, target_market, competitors }
        |
        v
  query planner ...... 8 concrete search queries from the brief
        v
  web search ......... Firecrawl per query (real results: url, title, snippet)
        v
  research agent ..... synthesis over fetched results ONLY; every finding
        |              cites its result URL; uncovered ground -> research_gaps
        v
  angle generator .... exactly 12 angles, no repeated mechanism+pain pair
        v
  angle critic ....... harsh 1-10 scoring, top 4, tie-break to mechanism diversity
        v
  copy expander ...... paid-social copy: primary text under 125 words, 3 distinct
        |              hooks, no generic CTAs, one research detail per ad
        v
  response: { research, angles, critique, ads, status: "awaiting human review" }
```

Model: claude-sonnet-4-6 via n8n managed credits on all five LLM stages. Structured output parsers on every agent so downstream stages consume JSON, not prose.

### Why search is a pipeline stage, not an agent tool

The first build gave the research agent Brave Search as a tool. Two failures surfaced in testing: the tool-variant node is outside n8n's managed-credential coverage, and the managed Brave credential itself is rejected by Brave's API at runtime. The agent handled the failure honestly (13 failed tool calls, every finding flagged unverified) but honest failure is still failure. The rebuild plans queries with one LLM step, runs them as deterministic Firecrawl pipeline nodes, and hands the agent the fetched results. Searches are now guaranteed to happen instead of hoped for, and the failed-search state is visible in the execution log instead of buried in agent iterations.

## Why the critic exists

Twelve angles from one prompt regress to the mean. The critic is a separate agent with a separate system prompt whose only job is to kill weak angles; it scores against specificity, novelty versus category cliche, and believability without unproven claims. Selection is by score with ties broken toward mechanism diversity so the surviving four don't all pull the same lever.
