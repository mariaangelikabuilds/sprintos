# SprintOS

An ad-creative sprint pipeline on n8n: POST a brand brief, get back a reviewed ad package. Live web research, 12 candidate angles, a critic that kills 8 of them, and full paid-social copy for the 4 survivors. Every run ends at `status: "awaiting human review"`; nothing publishes anywhere.

Built 2026-08-10. Runs on mariaangelika.app.n8n.cloud, workflow `PPhDpEGDV6ZzE8pp`, with claude-sonnet-4-6 on all five LLM stages.

## The pipeline

```
POST /webhook/sprintos-research
  { brand_name, product, target_market, competitors }
        |
        v
  query planner ...... 4 concrete search queries from the brief
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

The workflow source lives at [workflow/sprintos-research-angles.ts](./workflow/sprintos-research-angles.ts) in n8n Workflow SDK form. Recreate it on any n8n instance through the n8n MCP (`create_workflow_from_code`), or use it as the blueprint for hand-building the 21 nodes. You need an Anthropic credential for the five chat-model nodes and a Firecrawl credential for the search node; on n8n cloud, managed n8n credits cover both with zero credential setup. Publish, then POST a brief:

```
curl -X POST https://YOUR-INSTANCE/webhook/sprintos-research \
  -H "Content-Type: application/json" \
  -d '{"brand_name":"...","product":"...","target_market":"...","competitors":"..."}'
```

A full run takes about five minutes, five sequential LLM stages plus four web searches. On n8n cloud the synchronous HTTP response will not survive that: Cloudflare cuts the connection at roughly 100 seconds with a 524 while the execution keeps running and finishes green (verified 2026-08-10, execution completed in 4m23s after the caller got its 524). Read the result from the execution log, or front the webhook with a queue-and-poll pattern if a caller needs the payload delivered.
