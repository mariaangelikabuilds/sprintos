// SprintOS · API
// n8n Workflow SDK source for the three endpoints the dashboard talks to.
// Live as workflow 5avcJ6zALawejboW on mariaangelika.app.n8n.cloud.
//
// The dashboard is a static page on Vercel with no backend and no secret of
// its own, so every endpoint here is closed with n8n's webhook header auth and
// the operator types the key into the page. n8n answers a wrong or missing key
// with 403 before it starts an execution, which is why the gate lives on the
// webhook node rather than in an IF further down the chain.
//
// Credentials: one httpHeaderAuth credential holding `x-sprintos-key`, shared
// by all three webhooks and by `sprint brief in` in the research workflow.

import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const TABLE = { __rl: true, mode: 'id', value: '2XZZy3r9LKshQ5rD' };

const listIn = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'list sprints in',
    parameters: {
      path: 'sprintos-sprints',
      httpMethod: 'GET',
      responseMode: 'responseNode',
      authentication: 'headerAuth'
    },
    credentials: { httpHeaderAuth: newCredential('SprintOS API key') }
  }
});

const readAllRows = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'read all rows',
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLE,
      returnAll: true,
      orderBy: true,
      orderByColumn: 'createdAt',
      orderByDirection: 'DESC'
    }
  }
});

// The list carries each brief, so it is the endpoint a client's positioning
// would leak from. It never leaves n8n unauthenticated.
const shapeList = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'shape list',
    parameters: {
      jsCode: "const sprints = $input.all()\n  .map(i => i.json)\n  .filter(r => r.sprint_id && r.status !== 'probe')\n  .map(r => ({ id: r.sprint_id, brief: JSON.parse(r.brief || '{}'), status: r.status, created_at: r.created_at, delivered_at: r.delivered_at || null, reviewed_at: r.reviewed_at || null }));\nreturn [{ json: { sprints } }];"
    }
  }
});

const listOut = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'list out',
    parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}') }
  }
});

const detailIn = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'get sprint in',
    parameters: {
      path: 'sprintos-sprint',
      httpMethod: 'GET',
      responseMode: 'responseNode',
      authentication: 'headerAuth'
    },
    credentials: { httpHeaderAuth: newCredential('SprintOS API key') }
  }
});

const readOneRow = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'read one row',
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: TABLE,
      matchType: 'allConditions',
      filters: {
        conditions: [{ keyName: 'sprint_id', condition: 'eq', keyValue: expr('{{ $json.query.id }}') }]
      },
      returnAll: false,
      limit: 1
    }
  }
});

const shapeDetail = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'shape detail',
    parameters: {
      jsCode: "const rows = $input.all().map(i => i.json).filter(r => r.sprint_id);\nif (rows.length === 0) return [{ json: { error: 'not found' } }];\nconst r = rows[0];\nreturn [{ json: { id: r.sprint_id, brief: JSON.parse(r.brief || '{}'), status: r.status, package: r.package ? JSON.parse(r.package) : null, decisions: r.decisions ? JSON.parse(r.decisions) : null, created_at: r.created_at, delivered_at: r.delivered_at || null, reviewed_at: r.reviewed_at || null } }];"
    }
  }
});

const detailOut = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'get out',
    parameters: { respondWith: 'json', responseBody: expr('{{ JSON.stringify($json) }}') }
  }
});

const decideIn = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'decide in',
    parameters: {
      path: 'sprintos-decide',
      httpMethod: 'POST',
      responseMode: 'responseNode',
      authentication: 'headerAuth'
    },
    credentials: { httpHeaderAuth: newCredential('SprintOS API key') }
  }
});

// This used to be gated by an IF node comparing the body against the literal
// string 'angel-approves'. Header auth replaced it: the secret now lives in an
// encrypted credential instead of in the workflow JSON, and it is rotated in
// the credential rather than by editing this file.
const writeDecisions = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'write decisions',
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: TABLE,
      matchType: 'allConditions',
      filters: {
        conditions: [{ keyName: 'sprint_id', condition: 'eq', keyValue: expr('{{ $json.body.sprint_id }}') }]
      },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          decisions: expr('{{ JSON.stringify($json.body.decisions) }}'),
          status: 'reviewed',
          reviewed_at: expr('{{ $now.toISO() }}')
        }
      }
    }
  }
});

const decideOut = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'decide ok',
    parameters: { respondWith: 'json', responseBody: '{"reviewed": true}' }
  }
});

export default workflow('sprintos-api', 'SprintOS · API')
  .add(listIn)
  .to(readAllRows)
  .to(shapeList)
  .to(listOut)
  .add(detailIn)
  .to(readOneRow)
  .to(shapeDetail)
  .to(detailOut)
  .add(decideIn)
  .to(writeDecisions)
  .to(decideOut);
