// SprintOS · Research & Angles
// n8n Workflow SDK source. Recreate on any n8n instance with the n8n MCP
// (create_workflow_from_code) or use it as the blueprint for hand-building.
// Credentials: Anthropic on the five chat models, Firecrawl on web search.
// On n8n cloud, managed n8n credits auto-assign both at create time.

import { workflow, node, trigger, expr, languageModel, outputParser, newCredential } from '@n8n/workflow-sdk';

const briefIn = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'sprint brief in',
    parameters: { path: 'sprintos-research', httpMethod: 'POST', responseMode: 'responseNode' }
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
      jsonSchemaExample: '{"queries":["search query one","search query two","search query three","search query four"]}'
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
        systemMessage: 'Plan exactly 4 web search queries for ad-creative research on this brief. Cover: competitor positioning or ads for the named competitors, customer reviews or complaints in this category, forum language from real buyers, and the product mechanism or claim. Queries must be concrete search strings a person would type, not descriptions. Avoid heavy operator syntax; one site: filter at most per query.'
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

const researchParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'research schema',
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample: '{"product_summary":"one paragraph","unique_selling_points":["usp"],"competitor_findings":[{"competitor":"name","observed":"what the search results actually showed","hook":"their hook or angle","source":"result URL"}],"audience_pain_points":["pain"],"audience_desires":["desire"],"research_gaps":["anything the search results did not cover"]}'
    }
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
        systemMessage: 'You are the research stage of an ad-creative sprint for a DTC brand. Work ONLY from the web search results provided in the prompt. Every competitor_findings entry must cite the result URL it came from in the source field. If the results are empty or do not cover something (competitor ads, review language, pricing), list it under research_gaps instead of filling in from memory. Never present background knowledge as a search finding.'
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
        systemMessage: 'Generate exactly 12 distinct ad angles from this research brief. Each must map to a specific pain point or desire from the research, no generic angles. Vary the mechanism: fear of loss, social proof, identity, curiosity, direct benefit, contrarian. No two angles may share a mechanism and pain point pair.'
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
        systemMessage: 'Score each angle 1 to 10 against: specificity to a named pain point, novelty versus category cliches, and believability without unproven claims. Be harsh; a 7 should be rare. Select the top 4 by score, breaking ties toward mechanism diversity so the selected set does not repeat itself.'
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
        systemMessage: 'Write full paid-social ad copy for each selected angle only. Primary text under 125 words, headline under 40 characters, description under 30 characters, plain language, no hype adjectives, no unproven statistics, no em dashes, one concrete detail from the research brief per ad. Three hook variants per ad, each a genuinely different opening, not rephrasings. CTA must be a specific verb phrase, never Learn More or Shop Now. Every ad ships to a human reviewer; nothing publishes automatically, so write for approval, not applause.'
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
  .to(respond);
