#!/bin/bash
# =============================================================================
# HJCapital Git Sync Script
# Usage: ./scripts/git-sync.sh "Round XX: brief description of changes"
# =============================================================================

set -e

PROJECT_DIR="/home/ubuntu/hj-capital-platform"
GITHUB_REPO="https://github.com/Hamadajaber/hjcapital"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get commit message from argument or prompt
COMMIT_MSG="${1}"

if [ -z "$COMMIT_MSG" ]; then
  echo -e "${YELLOW}Usage: $0 \"Round XX: brief description\"${NC}"
  echo -e "${YELLOW}Example: $0 \"Round 42: Added Telegram alerts for every trade\"${NC}"
  exit 1
fi

echo -e "${GREEN}=== HJCapital Git Sync ===${NC}"
echo -e "Commit: ${YELLOW}${COMMIT_MSG}${NC}"
echo ""

# Navigate to project directory
cd "$PROJECT_DIR"

# Check git status
echo -e "${GREEN}[1/4] Checking git status...${NC}"
git status --short

# Stage all changes
echo -e "${GREEN}[2/4] Staging all changes...${NC}"
git add -A

# Check if there's anything to commit
if git diff --cached --quiet; then
  echo -e "${YELLOW}No changes to commit. Working tree is clean.${NC}"
  exit 0
fi

# Commit with message
echo -e "${GREEN}[3/4] Committing...${NC}"
git commit -m "$COMMIT_MSG"

# Push to GitHub
echo -e "${GREEN}[4/4] Pushing to GitHub...${NC}"
# Ensure remote has auth token embedded
git remote set-url github https://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@github.com/Hamadajaber/hjcapital.git 2>/dev/null || true
git push github main

echo ""
echo -e "${GREEN}✅ Successfully synced to GitHub!${NC}"
echo -e "View at: ${YELLOW}${GITHUB_REPO}${NC}"
echo ""
echo -e "${YELLOW}Remember: Update DIRECTOR_CONTEXT.md with this round's summary!${NC}"
