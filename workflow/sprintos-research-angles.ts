// SprintOS · Research & Angles
// n8n Workflow SDK source. Recreate on any n8n instance with the n8n MCP
// (create_workflow_from_code) or use it as the blueprint for hand-building.
// Live as workflow PPhDpEGDV6ZzE8pp on mariaangelika.app.n8n.cloud.
//
// Credentials: Anthropic on the five chat models, Firecrawl on web search, and
// the shared `SprintOS API key` header credential on the webhook. On n8n cloud,
// managed n8n credits auto-assign the first two at create time; the header
// credential is created by hand and holds `x-sprintos-key`.
//
// The two data table nodes are not decoration. The dashboard is a static page
// with no backend, so the table IS the state: `save sprint` writes the row the
// moment a brief arrives, `deliver package` writes the finished package into
// the same row about five minutes later, and the API workflow reads both.

import { workflow, node, trigger, expr, languageModel, outputParser, newCredential } from '@n8n/workflow-sdk';

const TABLE = { __rl: true, mode: 'id', value: '2XZZy3r9LKshQ5rD' };

const briefIn = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'sprint brief in',
    parameters: {
      path: 'sprintos-research',
      httpMethod: 'POST',
      responseMode: 'responseNode',
      authentication: 'headerAuth'
    },
    credentials: { httpHeaderAuth: newCredential('SprintOS API key') }
  }
});

// One run costs five Claude stages and eight Firecrawl searches, so an open
// endpoint here is an open tab on someone else's spending. Hence the header.
const saveSprint = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'save sprint',
    parameters: {
      resource: 'row',
      operation: 'upsert',
      dataTableId: TABLE,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          sprint_id: expr('{{ $json.body.sprint_id || $execution.id }}'),
          brief: expr('{{ JSON.stringify($json.body) }}'),
          status: 'running',
          created_at: expr('{{ $now.toISO() }}')
        }
      },
      matchType: 'allConditions',
      filters: {
        conditions: [{
          keyName: 'sprint_id',
          condition: 'eq',
          keyValue: expr('{{ $json.body.sprint_id || $execution.id }}')
        }]
      }
    }
  }
});

const plannerModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.5,
  config: {
    name: 'planner model',
    parameters: { model: { __rl: true, mode: 'id', value: 'claude-sonnet-4-6' }, options: { maxTokensToSample: 2000 } },
    credentials: { anthropicApi: newCredential('Anthropic') }
  }
});

const plannerParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'planner schema',
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample: '{"queries":["one","two","three","four","five","six","seven","eight"]}'
    }
  }
});

const queryPlanner = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'query planner',
    parameters: {
      promptType: 'define',
      text: expr('{{ "Brand: " + $json.body.brand_name + "\\nProduct: " + $json.body.product + "\\nTarget market: " + $json.body.target_market + "\\nKnown competitors: " + ($json.body.competitors || "none given") }}'),
      hasOutputParser: true,
      options: {
        systemMessage: 'Plan exactly 8 web search queries for ad-creative research on this brief. The offer may be a product, a service, a venue, or a personal brand; adapt naturally. Cover all of: (1) each named competitor\'s positioning or ads, (2) customer reviews and complaints in this category, (3) forum or Reddit language from real buyers or clients, (4) the mechanism, method, or claim behind the offer, (5) pricing norms in the category, (6) short-form social content angles in this niche (TikTok, Instagram, YouTube), (7) common objections people raise before buying or booking, (8) anything locally or culturally specific in the brief, like a city or country. Queries must be concrete search strings a person would type, not descriptions. Avoid heavy operator syntax; one site: filter at most per query. The brief may be thin or vague; never ask for clarification and never refuse. There is no one to answer you. Make reasonable assumptions and always return exactly 8 queries.'
      }
    },
    subnodes: { model: plannerModel, outputParser: plannerParser }
  }
});

const splitQueries = node({
  type: 'n8n-nodes-base.splitOut',
  version: 1,
  config: {
    name: 'one item per query',
    parameters: {
      fieldToSplitOut: 'output.queries',
      options: { destinationFieldName: 'query' }
    }
  }
});

// Search runs as a deterministic pipeline stage, not an agent tool.
// See README: the tool-based first build could fail silently inside
// agent iterations; a pipeline node fails loudly in the execution log.
const webSearch = node({
  type: '@mendable/n8n-nodes-firecrawl.firecrawl',
  version: 1,
  config: {
    name: 'web search',
    parameters: {
      resource: 'MapSearch',
      operation: 'search',
      query: expr('{{ $json.query }}'),
      sources: ['web'],
      limit: 6
    },
    credentials: { firecrawlApi: newCredential('Firecrawl') }
  }
});

const trimResults = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'trim results',
    parameters: {
      jsCode: "const out = [];\nfor (const item of $input.all()) {\n  const j = item.json;\n  const results = (j.data && j.data.web) || j.web || [];\n  for (const r of results) {\n    out.push({ json: { title: r.title || '', url: r.url || '', snippet: (r.description || '').slice(0, 500) } });\n  }\n}\nreturn out;"
    }
  }
});

const collectResults = node({
  type: 'n8n-nodes-base.aggregate',
  version: 1,
  config: {
    name: 'collect results',
    parameters: { aggregate: 'aggregateAllItemData', destinationFieldName: 'results' }
  }
});

const researchModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.5,
  config: {
    name: 'research model',
    parameters: { model: { __rl: true, mode: 'id', value: 'claude-sonnet-4-6' }, options: { maxTokensToSample: 6000 } },
    credentials: { anthropicApi: newCredential('Anthropic') }
  }
});

// The research schema is the widest of the five and the one most likely to
// come back malformed, so it is the only parser with autoFix and its own model.
const fixerModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.5,
  config: {
    name: 'fixer model',
    parameters: { model: { __rl: true, mode: 'id', value: 'claude-sonnet-4-6' }, options: { maxTokensToSample: 6000 } },
    credentials: { anthropicApi: newCredential('Anthropic') }
  }
});

const researchParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'research schema',
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample: '{"product_summary":"one paragraph on the offer, product or service","unique_selling_points":["usp"],"competitor_findings":[{"competitor":"name","observed":"what the search results actually showed","hook":"their hook or angle","source":"result URL"}],"voice_of_customer":["short real-sounding phrases customers use, drawn from review and forum results"],"objections":["reasons people hesitate before buying or booking"],"trend_hooks":["content angles or formats currently working in this niche per the results"],"audience_pain_points":["pain"],"audience_desires":["desire"],"research_gaps":["anything the search results did not cover"]}',
      autoFix: true
    },
    subnodes: { model: fixerModel }
  }
});

const researchAgent = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'research agent',
    parameters: {
      promptType: 'define',
      text: expr('{{ "Brief:\\nBrand: " + $(\'sprint brief in\').first().json.body.brand_name + "\\nProduct: " + $(\'sprint brief in\').first().json.body.product + "\\nTarget market: " + $(\'sprint brief in\').first().json.body.target_market + "\\nKnown competitors: " + ($(\'sprint brief in\').first().json.body.competitors || "none given") + "\\n\\nWeb search results:\\n" + JSON.stringify($json.results) }}'),
      hasOutputParser: true,
      options: {
        systemMessage: 'You are the research stage of an ad-creative sprint. The offer may be a product, a service, a venue, or a personal brand. Work ONLY from the web search results provided in the prompt. Every competitor_findings entry must cite the result URL it came from in the source field. Mine the results hard for voice_of_customer: the actual words reviewers and forum posters use for the pain and the payoff. Capture objections and trend_hooks the same way, only from what the results show. If the results are empty or do not cover something, list it under research_gaps instead of filling in from memory. Never present background knowledge as a search finding. Return EVERY field in the schema; when nothing qualifies for a field, return an empty array for it, never omit it.'
      }
    },
    subnodes: { model: researchModel, outputParser: researchParser }
  }
});

const anglesModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.5,
  config: {
    name: 'angles model',
    parameters: { model: { __rl: true, mode: 'id', value: 'claude-sonnet-4-6' }, options: { maxTokensToSample: 6000 } },
    credentials: { anthropicApi: newCredential('Anthropic') }
  }
});

const anglesParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'angles schema',
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample: '{"angles":[{"id":1,"angle":"one-line concept","hook":"opening line","maps_to":"the pain point or desire it targets","rationale":"why this could work"}]}'
    }
  }
});

const angleGenerator = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'angle generator',
    parameters: {
      promptType: 'define',
      text: expr('{{ "Research brief:\\n" + JSON.stringify($json.output) }}'),
      hasOutputParser: true,
      options: {
        systemMessage: 'Generate exactly 12 distinct ad angles from this research brief. Each must map to a specific pain point, desire, or objection from the research; no generic angles. Vary the mechanism widely: fear of loss, social proof, identity, curiosity, direct benefit, contrarian, humor, pattern interrupt, naming a common enemy, honest urgency. No two angles may share a mechanism and pain point pair. At least three angles should feel risky, the kind a cautious brand manager would hesitate on; the critic downstream will judge them.'
      }
    },
    subnodes: { model: anglesModel, outputParser: anglesParser }
  }
});

const critiqueModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.5,
  config: {
    name: 'critique model',
    parameters: { model: { __rl: true, mode: 'id', value: 'claude-sonnet-4-6' }, options: { maxTokensToSample: 6000 } },
    credentials: { anthropicApi: newCredential('Anthropic') }
  }
});

const critiqueParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'critique schema',
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample: '{"scores":[{"id":1,"score":7,"strongest":"what works","weakest":"what fails"}],"selected_ids":[1,2,3,4],"selection_reasoning":"why these four"}'
    }
  }
});

const angleCritic = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'angle critic',
    parameters: {
      promptType: 'define',
      text: expr('{{ "Angles to score:\\n" + JSON.stringify($json.output.angles) }}'),
      hasOutputParser: true,
      options: {
        systemMessage: 'Score each angle 1 to 10 against four things: specificity to a named pain point or objection, novelty versus category cliches, believability without unproven claims, and thumb-stop power, meaning whether the angle would make someone pause mid-scroll. Be harsh; a 7 should be rare. Boring-but-true scores low on thumb-stop; wild-but-hollow scores low on believability. Select the top 4 by score, breaking ties toward mechanism diversity so the selected set does not repeat itself.'
      }
    },
    subnodes: { model: critiqueModel, outputParser: critiqueParser }
  }
});

const copyModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  version: 1.5,
  config: {
    name: 'copy model',
    parameters: { model: { __rl: true, mode: 'id', value: 'claude-sonnet-4-6' }, options: { maxTokensToSample: 8000 } },
    credentials: { anthropicApi: newCredential('Anthropic') }
  }
});

const copyParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'copy schema',
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample: '{"ads":[{"angle_id":1,"primary_text":"the ad body","headline":"under 40 chars","description":"under 30 chars","hook_variants":["hook one","hook two","hook three"],"cta":"specific verb phrase"}],"status":"awaiting human review"}'
    }
  }
});

const copyExpander = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'copy expander',
    parameters: {
      promptType: 'define',
      text: expr('{{ "Selected angle IDs: " + JSON.stringify($json.output.selected_ids) + "\\nScores and critique: " + JSON.stringify($json.output.scores) + "\\nAll angles: " + JSON.stringify($(\'angle generator\').item.json.output.angles) + "\\nResearch brief: " + JSON.stringify($(\'research agent\').item.json.output) }}'),
      hasOutputParser: true,
      options: {
        systemMessage: 'You write paid-social ads that stop a scrolling thumb. Write full copy for each selected angle only. Voice: confident, specific, human, never beige ad-speak, never announcer voice. Build every ad from the research: use voice_of_customer phrasing, name the exact frustration, exploit the competitor weakness the research actually found. Honesty rails, non-negotiable: no invented statistics, no fabricated testimonials or reviews, every factual claim must trace to the research brief; if research_gaps says something is unverified, do not claim it. Craft rules: open mid-thought or with a jolt, never with setup; vary sentence rhythm hard, two-word sentences against long ones; talk to one person, not a market; specifics beat adjectives; one idea per ad, pushed all the way. Three hook variants per ad in genuinely different registers, for example a confession, a blunt claim, a question that stings, an overheard quote, a tiny story; never three rephrasings. Primary text under 125 words, headline under 40 characters, description under 30 characters, no em dashes. CTA is a specific verb phrase, never Learn More or Shop Now. A human reviews everything before anything runs, so take creative risks the reviewer can dial back.'
      }
    },
    subnodes: { model: copyModel, outputParser: copyParser }
  }
});

const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'sprint package out',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ JSON.stringify({ research: $(\'research agent\').item.json.output, angles: $(\'angle generator\').item.json.output.angles, critique: $(\'angle critic\').item.json.output, ads: $json.output.ads, status: "awaiting human review" }) }}')
    }
  }
});

// The browser is long gone by the time this runs: the edge cuts the response
// at about 100 seconds and the chain takes five minutes. This write, not the
// response above, is what the dashboard actually reads.
const deliverPackage = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'deliver package',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: TABLE,
      matchType: 'allConditions',
      filters: {
        conditions: [{
          keyName: 'sprint_id',
          condition: 'eq',
          keyValue: expr('{{ $(\'sprint brief in\').first().json.body.sprint_id || $execution.id }}')
        }]
      },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          package: expr('{{ JSON.stringify({ research: $(\'research agent\').item.json.output, angles: $(\'angle generator\').item.json.output.angles, critique: $(\'angle critic\').item.json.output, ads: $json.output.ads }) }}'),
          status: 'review',
          delivered_at: expr('{{ $now.toISO() }}')
        }
      }
    }
  }
});

export default workflow('sprintos-research-angles', 'SprintOS · Research & Angles')
  .add(briefIn)
  .to(queryPlanner)
  .to(splitQueries)
  .to(webSearch)
  .to(trimResults)
  .to(collectResults)
  .to(researchAgent)
  .to(angleGenerator)
  .to(angleCritic)
  .to(copyExpander)
  .to(respond)
  .add(briefIn)
  .to(saveSprint)
  .add(copyExpander)
  .to(deliverPackage);
