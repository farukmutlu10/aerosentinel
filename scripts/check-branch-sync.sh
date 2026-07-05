#!/bin/bash
set -x
cd "/Users/fm/.gemini/antigravity/scratch/replit-projem/aerosentinel 08jun"

echo "=== 1. Current branch ==="
git branch --show-current

echo "=== 2. Commits on preview NOT in main ==="
git log --oneline main..preview 2>/dev/null || echo "(no diff or error)"

echo "=== 3. Commits on main NOT in preview ==="
git log --oneline preview..main 2>/dev/null || echo "(no diff or error)"

echo "=== 4. Latest main commit ==="
git log --oneline -1 main

echo "=== 5. Latest preview commit ==="
git log --oneline -1 preview

echo "=== 6. Stashed changes ==="
git stash list

echo "=== 7. Uncommitted changes on current branch ==="
git status --short

echo "=== DONE ==="
