#!/bin/bash
TOKEN="${RAILWAY_API_TOKEN:?RAILWAY_API_TOKEN is not set (export it or source your .env before running this script)}"
API="https://backboard.railway.app/graphql/v2"
ENV_ID="6359edf1-820c-41c7-8a50-9e8ed3acf083"
SVC_ID="28f1f8a1-4491-4d28-921a-abfa10b63cb1"

# Trigger deployment from the connected GitHub repo
curl -s "$API" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"query\":\"mutation { deploymentCreate(input: { serviceId: \\\"$SVC_ID\\\", environmentId: \\\"$ENV_ID\\\" }) { id status } }\"}"
