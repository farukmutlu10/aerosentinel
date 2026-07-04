#!/bin/bash
cd "$(dirname "$0")"
npx -y @railway/cli@latest run node run-migrations.cjs
