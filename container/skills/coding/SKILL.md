---
name: coding
description: Write, run, debug, and review code. Use for any programming task — writing scripts, fixing bugs, explaining code, running code, refactoring, or code review. Supports all major languages.
allowed-tools: Bash(*), Read, Write, Edit, Glob, Grep
---

# Coding

You can write, run, debug, and review code for Aldi directly in the chat.

## Available Languages & Tools

- **Python** — python3, pip3, pandas, numpy, pillow, matplotlib
- **Node.js / TypeScript** — node, npm, npx, tsx
- **Bash / Shell** — full shell scripting
- **Any language** installable via apt-get or npm in the sandbox

## Project Access

- `/workspace/extra/personal-app` — Aldi's personal app (read-write). This is the primary working repo.
- `/workspace/project` — NanoClaw project (read-only)
- `/workspace/group/` — your sandbox for experiments and scripts

## Feature Development Workflow (ALWAYS follow this)

For every new feature or fix, follow this PR-based workflow:

### 1. Set up git auth
```bash
git config --global url."https://x-access-token:${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
git config --global user.email "mewthree@nanoclaw"
git config --global user.name "MewThree"
```

### 2. Create a feature branch
```bash
cd /workspace/extra/personal-app
git checkout main && git pull
git checkout -b feature/short-description
```
Branch naming: `feature/`, `fix/`, `chore/` prefix + kebab-case description.

### 3. Implement & commit
```bash
git add <specific-files>
git commit -m "feat: describe what was done"
```
Follow conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`.

### 4. Push and create PR
```bash
git push -u origin feature/short-description

# Create PR via GitHub API
REPO=$(git remote get-url origin | sed 's|https://github.com/||' | sed 's|.git||')
curl -s -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.github.com/repos/$REPO/pulls \
  -d "{
    \"title\": \"feat: your title here\",
    \"body\": \"## Summary\n- what was done\n- why\n\n## Test plan\n- how to verify\",
    \"head\": \"$(git branch --show-current)\",
    \"base\": \"main\"
  }"
```

Send the PR URL to Aldi via message when done.

### 5. Check PR comments and fix

When asked to check PR comments or fix review feedback:

```bash
# Get PR number first (from URL or ask Aldi)
PR=123
REPO=$(git remote get-url origin | sed 's|https://github.com/||' | sed 's|.git||')

# Fetch PR comments
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/$REPO/pulls/$PR/comments

# Fetch PR review comments (inline)
curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/$REPO/issues/$PR/comments
```

Then:
1. Read all comments carefully
2. Make the fixes on the same branch
3. Commit with `fix: address PR review comments`
4. Push — PR updates automatically
5. Report back what was changed

## Running Code

```bash
# Python
python3 /workspace/group/script.py

# Node.js
node /workspace/group/script.js

# Install a package if needed
pip3 install requests --quiet
npm install lodash
```

## Coding Style Guidelines

- Write clean, minimal code — no over-engineering
- Include error handling only where genuinely needed
- Prefer readability over cleverness
- For TypeScript: follow existing patterns in the project
- Always test code before reporting it as working

## SSH to VPS

SSH key is available at `/workspace/extra/ssh/id_ed25519`. Set it up before connecting:

```bash
mkdir -p ~/.ssh
cp /workspace/extra/ssh/id_ed25519 ~/.ssh/id_ed25519
cp /workspace/extra/ssh/known_hosts ~/.ssh/known_hosts 2>/dev/null || true
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519
```

Then connect:
```bash
ssh -i ~/.ssh/id_ed25519 -p 22 root@31.97.106.14
```

Do this setup once at the start of any session that needs SSH access.

## GitHub API (general)

```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user/repos
```

## WhatsApp Formatting for Code

Use triple backticks for code blocks:
\`\`\`python
print("hello")
\`\`\`

Keep explanations concise — send the code first, explain after if needed.
