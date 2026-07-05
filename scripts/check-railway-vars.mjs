const API_URL = 'https://backboard.railway.app/graphql/v2';
const TOKEN = 'a5fd363a-cd15-4a9d-8ec3-c3085c63a85a';
const PROJECT_ID = 'ee91a8a4-b9a9-46d3-9e6c-93723ecaab38';
const PROD_ENV = '6359edf1-820c-41c7-8a50-9e8ed3acf083';
const PREVIEW_ENV = 'f815f912-a927-473d-aeb8-cf918b85fe4b';

const services = [
  { id: '0ecc511d-2a9d-428e-89da-7e6609711e25', name: '@workspace/api-zod' },
  { id: '1c73e0a7-ed1d-48cb-9f86-e118a719ae9c', name: '@workspace/db' },
  { id: '28f1f8a1-4491-4d28-921a-abfa10b63cb1', name: '@workspace/api-server' },
  { id: '82c29a15-85e8-44dc-bf04-66ba73211bf6', name: '@workspace/mockup-sandbox' },
  { id: '8c683788-c100-49c2-be57-ba2a818d9d7c', name: '@workspace/api-client-react' },
  { id: 'b2e99533-073b-41c9-92f3-2fe8fff79190', name: 'Postgres-_967' },
  { id: 'b4946134-9fdc-42a9-a2d9-cd139f121480', name: 'api-server-preview' },
  { id: 'd2573728-81db-4bd7-a481-00946b1949e7', name: '@workspace/api-spec' },
  { id: 'ef0fab87-fa10-4f4d-b119-fcb5c99a306e', name: '@workspace/aero-sentinel' },
  { id: 'f4f20723-8b9c-42e5-8d36-01c6faa0e7e5', name: 'Postgres' },
];

async function gql(query) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

async function main() {
  console.log('=== PRODUCTION Environment Variables ===\n');
  
  for (const svc of services) {
    const data = await gql(`query { variables(projectId: "${PROJECT_ID}", environmentId: "${PROD_ENV}", serviceId: "${svc.id}") }`);
    const vars = data.data?.variables || {};
    const keys = Object.keys(vars);
    const hasDbUrl = keys.includes('DATABASE_URL');
    
    console.log(`--- ${svc.name} (${svc.id}) ---`);
    console.log(`  Total variables: ${keys.length}`);
    console.log(`  DATABASE_URL: ${hasDbUrl ? '✅ YES' : '❌ NO'}`);
    if (keys.length > 0) {
      console.log(`  Variables: ${keys.join(', ')}`);
    }
    if (hasDbUrl) {
      // Show DATABASE_URL (masked for safety - show first 30 chars)
      const dbUrl = vars.DATABASE_URL;
      console.log(`  DATABASE_URL value: ${dbUrl.substring(0, 40)}...`);
    }
    if (data.errors) {
      console.log(`  Errors: ${JSON.stringify(data.errors)}`);
    }
    console.log();
  }

  console.log('\n=== PREVIEW Environment Variables ===\n');
  
  for (const svc of services) {
    const data = await gql(`query { variables(projectId: "${PROJECT_ID}", environmentId: "${PREVIEW_ENV}", serviceId: "${svc.id}") }`);
    const vars = data.data?.variables || {};
    const keys = Object.keys(vars);
    const hasDbUrl = keys.includes('DATABASE_URL');
    
    console.log(`--- ${svc.name} (${svc.id}) ---`);
    console.log(`  Total variables: ${keys.length}`);
    console.log(`  DATABASE_URL: ${hasDbUrl ? '✅ YES' : '❌ NO'}`);
    if (keys.length > 0) {
      console.log(`  Variables: ${keys.join(', ')}`);
    }
    if (hasDbUrl) {
      const dbUrl = vars.DATABASE_URL;
      console.log(`  DATABASE_URL value: ${dbUrl.substring(0, 40)}...`);
    }
    if (data.errors) {
      console.log(`  Errors: ${JSON.stringify(data.errors)}`);
    }
    console.log();
  }
}

main().catch(console.error);
