#!/usr/bin/env node
import https from 'https';

const TOKEN = process.env.RAILWAY_TOKEN;
if (!TOKEN) {
  console.error('RAILWAY_TOKEN env var is required (e.g. export RAILWAY_TOKEN=... before running this script)');
  process.exit(1);
}
const PROJECT_ID = 'ee91a8a4-b9a9-46d3-9e6c-93723ecaab38';
const ENVIRONMENT_ID = 'f815f912-a927-473d-aeb8-cf918b85fe4b';
const POSTGRES_SERVICE_ID = 'b2e99533-073b-41c9-92f3-2fe8fff79190';
const API_SERVICE_ID = 'b4946134-9fdc-42a9-a2d9-cd139f121480';
const OLD_POSTGRES_ID = 'e5a25f2d-855f-41d3-bd91-c6dcaa9d6f13';

function graphql(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: 'backboard.railway.app',
      path: '/graphql/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch(e) {
          reject(new Error(`Failed to parse: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  // Step 1: Delete old manually created postgres service
  console.log('=== Step 1: Delete old postgres service ===');
  try {
    const r1 = await graphql(`mutation serviceDelete($id: String!) { serviceDelete(id: $id) }`, { id: OLD_POSTGRES_ID });
    console.log('Delete result:', JSON.stringify(r1));
  } catch(e) {
    console.log('Delete failed (may already be gone):', e.message);
  }

  // Step 2: List all services
  console.log('\n=== Step 2: List services ===');
  const r2 = await graphql(`query { services(projectId: "${PROJECT_ID}") { edges { node { id name } } } }`);
  console.log('Services:', JSON.stringify(r2.data?.services?.edges, null, 2));

  // Step 3: Get Postgres variables
  console.log('\n=== Step 3: Get Postgres variables ===');
  const r3 = await graphql(`query variables($serviceId: String!, $environmentId: String!) { variables(serviceId: $serviceId, environmentId: $environmentId) { name value } }`, { serviceId: POSTGRES_SERVICE_ID, environmentId: ENVIRONMENT_ID });
  console.log('Postgres vars:', JSON.stringify(r3.data?.variables, null, 2));

  // Step 4: Set API server variables
  console.log('\n=== Step 4: Set API server variables ===');
  const pgVars = r3.data?.variables || [];
  const dbUrl = pgVars.find(v => v.name === 'DATABASE_URL');
  const pgHost = pgVars.find(v => v.name === 'PGHOST');
  const pgPort = pgVars.find(v => v.name === 'PGPORT');
  const pgUser = pgVars.find(v => v.name === 'PGUSER');
  const pgPass = pgVars.find(v => v.name === 'PGPASSWORD');
  const pgDb = pgVars.find(v => v.name === 'PGDATABASE');

  if (dbUrl) console.log('DATABASE_URL:', dbUrl.value);
  if (pgHost) console.log('PGHOST:', pgHost.value);
  if (pgPort) console.log('PGPORT:', pgPort.value);
  if (pgUser) console.log('PGUSER:', pgUser.value);
  if (pgPass) console.log('PGPASSWORD:', pgPass.value);
  if (pgDb) console.log('PGDATABASE:', pgDb.value);

  // Build DATABASE_URL if not present
  let databaseUrl = dbUrl?.value;
  if (!databaseUrl && pgHost && pgPort && pgUser && pgPass && pgDb) {
    databaseUrl = `postgresql://${pgUser.value}:${pgPass.value}@${pgHost.value}:${pgPort.value}/${pgDb.value}`;
    console.log('Constructed DATABASE_URL:', databaseUrl);
  }

  if (databaseUrl) {
    // Set NODE_ENV
    const r4a = await graphql(`mutation variableUpsert($input: VariableUpsertInput!) { variableUpsert(input: $input) }`, {
      input: { serviceId: API_SERVICE_ID, environmentId: ENVIRONMENT_ID, name: 'NODE_ENV', value: 'production' }
    });
    console.log('Set NODE_ENV:', JSON.stringify(r4a));

    // Set PORT
    const r4b = await graphql(`mutation variableUpsert($input: VariableUpsertInput!) { variableUpsert(input: $input) }`, {
      input: { serviceId: API_SERVICE_ID, environmentId: ENVIRONMENT_ID, name: 'PORT', value: '5001' }
    });
    console.log('Set PORT:', JSON.stringify(r4b));

    // Set DATABASE_URL
    const r4c = await graphql(`mutation variableUpsert($input: VariableUpsertInput!) { variableUpsert(input: $input) }`, {
      input: { serviceId: API_SERVICE_ID, environmentId: ENVIRONMENT_ID, name: 'DATABASE_URL', value: databaseUrl }
    });
    console.log('Set DATABASE_URL:', JSON.stringify(r4c));
  } else {
    console.log('No DATABASE_URL available yet - Postgres may still be provisioning');
  }

  // Step 5: Get deployments
  console.log('\n=== Step 5: Get deployments ===');
  const r6 = await graphql(`query { deployments(input: { projectId: "${PROJECT_ID}", environmentId: "${ENVIRONMENT_ID}" }) { edges { node { id status serviceId url } } } }`);
  console.log('Deployments:', JSON.stringify(r6.data?.deployments?.edges, null, 2));

  // Step 6: Get service domains
  console.log('\n=== Step 6: Get service domains ===');
  for (const sid of [POSTGRES_SERVICE_ID, API_SERVICE_ID]) {
    const r7 = await graphql(`query { serviceDomains(serviceId: "${sid}", environmentId: "${ENVIRONMENT_ID}") { edges { node { id domain } } } }`);
    console.log(`Domains for ${sid}:`, JSON.stringify(r7.data?.serviceDomains?.edges, null, 2));
  }
}

main().catch(console.error);
