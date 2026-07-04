const https = require('https');

const TOKEN = '5nnUaTtJxxf7opzisl_xnmx1y3QaIVX8ZXPNIlBpteS';
const PROJECT_ID = 'ee91a8a4-b9a9-46d3-9e6c-93723ecaab38';
const ENVIRONMENT_ID = 'f815f912-a927-473d-aeb8-cf918b85fe4b';
const POSTGRES_SERVICE_ID = 'b2e99533-073b-41c9-92f3-2fe8fff79190';
const API_SERVICE_ID = 'b4946134-9fdc-42a9-a2d9-cd139f121480';

function graphql(query, variables) {
  return new Promise((resolve, reject) => {
    const payload = {};
    if (query) payload.query = query;
    if (variables) payload.variables = variables;
    const data = JSON.stringify(payload);
    const req = https.request({
      hostname: 'backboard.railway.app',
      path: '/graphql/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('Failed to parse: ' + body)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  // Get project info with services
  console.log('=== Get project info ===');
  const r1 = await graphql(
    'query getProject($projectId: String!) { project(id: $projectId) { id name services { edges { node { id name } } } } }',
    { projectId: PROJECT_ID }
  );
  console.log(JSON.stringify(r1, null, 2));

  // Get Postgres variables - variables returns EnvironmentVariables (a JSON scalar, not a list)
  console.log('\n=== Get Postgres variables ===');
  const r2 = await graphql(
    'query getVars($projectId: String!, $serviceId: String!, $environmentId: String!) { variables(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId) }',
    { projectId: PROJECT_ID, serviceId: POSTGRES_SERVICE_ID, environmentId: ENVIRONMENT_ID }
  );
  console.log('Postgres vars:', JSON.stringify(r2, null, 2));

  // Extract DATABASE_URL from the variables
  const pgVars = (r2.data && r2.data.variables) || {};
  console.log('\n=== Parsed vars ===');
  Object.keys(pgVars).forEach(k => console.log(k + '=' + pgVars[k]));

  let databaseUrl = pgVars.DATABASE_URL;
  if (!databaseUrl && pgVars.PGHOST && pgVars.PGPORT && pgVars.PGUSER && pgVars.PGPASSWORD && pgVars.PGDATABASE) {
    databaseUrl = 'postgresql://' + pgVars.PGUSER + ':' + pgVars.PGPASSWORD + '@' + pgVars.PGHOST + ':' + pgVars.PGPORT + '/' + pgVars.PGDATABASE;
  }

  // Get API server variables
  console.log('\n=== Get API server variables ===');
  const r2b = await graphql(
    'query getVars($projectId: String!, $serviceId: String!, $environmentId: String!) { variables(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId) }',
    { projectId: PROJECT_ID, serviceId: API_SERVICE_ID, environmentId: ENVIRONMENT_ID }
  );
  console.log('API vars:', JSON.stringify(r2b, null, 2));

  // Set API server environment variables
  if (databaseUrl) {
    console.log('\n=== Setting API server env vars ===');
    for (const [name, value] of [['NODE_ENV', 'production'], ['PORT', '5001'], ['DATABASE_URL', databaseUrl]]) {
      const r = await graphql(
        'mutation setVar($input: VariableUpsertInput!) { variableUpsert(input: $input) }',
        { input: { serviceId: API_SERVICE_ID, environmentId: ENVIRONMENT_ID, name: name, value: value } }
      );
      console.log('Set ' + name + ':', JSON.stringify(r));
    }
  } else {
    console.log('\nNo DATABASE_URL found');
  }

  // Get trusted domains
  console.log('\n=== Get trusted domains ===');
  const r3 = await graphql(
    'query getDomains($projectId: String!, $environmentId: String!) { trustedDomains(projectId: $projectId, environmentId: $environmentId) }',
    { projectId: PROJECT_ID, environmentId: ENVIRONMENT_ID }
  );
  console.log('Domains:', JSON.stringify(r3, null, 2));

  // Get service instances for each service
  console.log('\n=== Service instances ===');
  for (const [sid, sname] of [[POSTGRES_SERVICE_ID, 'postgres'], [API_SERVICE_ID, 'api-server']]) {
    const r = await graphql(
      'query getService($serviceId: String!) { service(id: $serviceId) { id name } }',
      { serviceId: sid }
    );
    console.log(sname + ':', JSON.stringify(r, null, 2));
  }

  // Get deployments
  console.log('\n=== Deployments ===');
  const r4 = await graphql(
    'query getDeployments($projectId: String!, $environmentId: String!) { deployments(input: { projectId: $projectId, environmentId: $environmentId }) { edges { node { id status serviceId url } } } }',
    { projectId: PROJECT_ID, environmentId: ENVIRONMENT_ID }
  );
  console.log(JSON.stringify(r4, null, 2));
}

main().catch(console.error);
