# SprintOS

An ad-creative sprint pipeline on n8n with a review dashboard on Vercel: submit a brand brief, get back a reviewed ad package. Live web research, 12 candidate angles, a critic that kills 8 of them, and full paid-social copy for the 4 survivors. Every run parks at human review; nothing publishes anywhere.

Built 2026-08-10. Pipeline on mariaangelika.app.n8n.cloud (workflow `PPhDpEGDV6ZzE8pp`, claude-sonnet-4-6 on all five LLM stages). Dashboard at https://sprintos-one.vercel.app.

## The dashboard has no backend

The review UI is a static React page. Sprint state lives in an n8n data table; the research workflow upserts a row when a brief arrives and writes the finished package into the same row at the end, and a second n8n workflow (`SprintOS · API`) exposes list, detail, and review-decision webhooks over that table. The browser fires a brief at the pipeline and forgets the response on purpose: the run takes ~5 minutes and n8n cloud's edge cuts synchronous responses at ~100 seconds, so results travel through the data table instead of the HTTP response. Each ad gets an explicit approve or kill verdict recorded back to the row, and an ad with no verdict is not submittable; the absence of a decision never resolves into one.

An earlier version was a Hono + SQLite server with a callback route, built and verified locally. It was deleted the same day: once the workflow writes state to a table n8n owns, a server that only relays JSON is a machine that can be replaced with nothing.

## A public page in front of closed endpoints

A static page cannot hold a secret. Anything compiled into the bundle is readable by anyone who opens devtools, so the four webhooks are closed with n8n's header auth and the operator types the key into the page instead. It is kept in `localStorage`, sent as `x-sprintos-key` on every call, and never built into the JS.

This replaced the original arrangement, in which the read endpoints were open to the internet and writes were gated by a plaintext string in the workflow JSON. Two things were wrong with that. Every brief was world-readable, so the first real client brief would have put their positioning and competitor set on a public URL. And one unauthenticated POST to `sprintos-research` runs five Claude stages and eight Firecrawl searches, so a `for` loop against that endpoint spends someone else's money until it is noticed.

Header auth also fails cheaply: n8n answers a wrong or missing key with 403 before it starts an execution, so a rejected request costs nothing on the plan. The secret lives in an encrypted n8n credential and is rotated there, not by editing a workflow.

## Polling is gated, not constant

The dashboard polls only when there is something to wait for: a sprint in `running`, or the short window after a brief is submitted. It stops while the tab is hidden and refreshes when it comes back. This is not a micro-optimization. An earlier build ran two unconditional 5-second intervals whether or not anything was happening; a dashboard tab left open overnight spent 18,503 failed executions and took every unrelated workflow on the same n8n instance down with it (2026-08-11). An idle tab now makes zero requests.

## The pipeline

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
  copy expander ...... primary text under 125 words, 3 genuinely different hooks,
        |              no generic CTAs, one research detail per ad
        v
  response: { research, angles, critique, ads, status: "awaiting human review" }
```

Structured output parsers sit on every agent, so each stage consumes JSON from the previous one instead of parsing prose.

## Why search is a pipeline stage, not an agent tool

The first build handed the research agent a Brave Search tool and trusted it to search. Testing surfaced two failures. The tool-variant node sits outside n8n's managed-credential coverage, and the managed Brave credential itself turned out to be broken at runtime: Brave's API rejects the gateway token with `SUBSCRIPTION_TOKEN_INVALID`. The agent handled it honestly, 13 failed tool calls and every finding flagged as unverified, but honest failure is still failure.

The rebuild plans queries with one LLM step, runs them as deterministic Firecrawl pipeline nodes, and hands the agent the fetched results. Searches are guaranteed to happen instead of hoped for, and a failed search shows up as a red node in the execution log instead of being buried inside agent iterations.

## Why the critic exists

Twelve angles from one prompt regress to the mean. The critic is a separate agent with a separate system prompt whose only job is to kill weak angles. It scores against specificity to a named pain point, novelty versus category cliche, and believability without unproven claims, then selects four with ties broken toward mechanism diversity so the survivors do not all pull the same lever.

## What the research stage refuses to do

The research agent works only from the search results in its prompt. Every competitor finding must cite the result URL it came from. Anything the results did not cover, competitor ad creative, pricing, review language, goes into `research_gaps` instead of being filled in from the model's memory. In the verified test run, the agent surfaced findings from Serious Eats, r/castiron, r/BuyItForLife, and a competitor's own comparison page, and declared 7 explicit gaps.

## What was cut

The source blueprint had six stages, including workspace setup, static creative production, listicle generation, and Meta Ads reporting. Meta reporting is cut, not parked: there is no ad account behind this project, and a reporting stage running on fabricated numbers would be theater. The remaining stages phase in behind the live one. Decisions and adaptations are recorded in [SPEC.md](./SPEC.md).

## Running your own copy

Both workflows have source in n8n Workflow SDK form: the pipeline at [workflow/sprintos-research-angles.ts](./workflow/sprintos-research-angles.ts) and the endpoints at [workflow/sprintos-api.ts](./workflow/sprintos-api.ts). Recreate them on any n8n instance through the n8n MCP (`create_workflow_from_code`), or use them as the blueprint for hand-building.

Three credentials. Anthropic for the five chat-model nodes and Firecrawl for the search node; on n8n cloud, managed n8n credits cover both with zero setup. The third is a **Header Auth** credential named `SprintOS API key`, holding header name `x-sprintos-key` and a value you choose, attached to all four webhooks. The n8n MCP cannot create credentials, so this one is made by hand in the n8n UI before the workflows will accept a request. Publish, then POST a brief:

```
curl -X POST https://YOUR-INSTANCE/webhook/sprintos-research \
  -H "Content-Type: application/json" \
  -H "x-sprintos-key: YOUR-KEY" \
  -d '{"brand_name":"...","product":"...","target_market":"...","competitors":"..."}'
```

A full run takes about five minutes, five sequential LLM stages plus eight web searches. On n8n cloud the synchronous HTTP response will not survive that: Cloudflare cuts the connection at roughly 100 seconds with a 524 while the execution keeps running and finishes green (verified 2026-08-10, execution completed in 4m23s after the caller got its 524). Read the result from the execution log, or front the webhook with a queue-and-poll pattern if a caller needs the payload delivered.
