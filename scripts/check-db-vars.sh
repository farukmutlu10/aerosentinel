#!/bin/bash
TOKEN="${RAILWAY_API_TOKEN:?RAILWAY_API_TOKEN is not set (export it or source your .env before running this script)}"
API="https://backboard.railway.app/graphql/v2"
ENV_ID="6359edf1-820c-41c7-8a50-9e8ed3acf083"
DB_SVC_ID="f4f20723-8b9c-42e5-8d36-01c6faa0e7e5"
PROJ_ID="ee91a8a4-b9a9-46d3-9e6c-93723ecaab38"

# Get all service variables with raw JSON
curl -s "$API" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"query\":\"query { serviceInstance(serviceId: \\\"$DB_SVC_ID\\\", environmentId: \\\"$ENV_ID\\\") { source { templateServiceId } domains { domain } } }\"}"
