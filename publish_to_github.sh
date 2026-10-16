#!/usr/bin/env bash
# Publishes SpaceKeeper for ChromeOS to a PUBLIC GitHub repository and turns
# on its website (GitHub Pages), which is where Chromebooks open it from.
#
#   bash publish_to_github.sh                   -> repository "SpaceKeeper-ChromeOS"
#   bash publish_to_github.sh MyRepoName        -> choose another name
#
# What it does:
#   1. Installs the GitHub command-line tool (gh) with Homebrew if needed.
#   2. Signs you in to GitHub in your browser (first time only).
#   3. Runs the tests (if Node is installed).
#   4. Commits the files (using your private GitHub "noreply" email address),
#      after checking nothing looks like a key or secret, then lists the
#      files that will become public and asks you to confirm.
#   5. Creates the repository and uploads the files.
#   6. Turns on GitHub Pages, so the app is at
#      https://<you>.github.io/<repository>/
# Run it again later to upload changes (the website updates in a minute or two).
set -euo pipefail
cd "$(dirname "$0")"

REPO_NAME="${1:-SpaceKeeper-ChromeOS}"
DESCRIPTION="Name, colour and jump between ChromeOS desks (installable web app using the ChromeOS Desk API)."

if ! command -v git >/dev/null 2>&1; then
  echo "Git isn't installed. Run: xcode-select --install   then run this script again."
  exit 1
fi
if ! command -v gh >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "> Installing the GitHub command-line tool (gh)..."
    brew install gh
  else
    echo "Install Homebrew from https://brew.sh or gh from https://cli.github.com, then run this again."
    exit 1
  fi
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "> Signing in to GitHub (a browser window will open)..."
  gh auth login --hostname github.com --git-protocol https --web
fi
gh auth setup-git >/dev/null 2>&1 || true
LOGIN="$(gh api user --jq .login)"
USER_ID="$(gh api user --jq .id)"
FULL_NAME="$(gh api user --jq '.name // .login')"

if command -v node >/dev/null 2>&1; then
  echo "> Running the tests..."
  node --test >/dev/null || { echo "✗ A test failed. Run: node --test   to see which, then fix it before publishing."; exit 1; }
fi

[ -d .git ] || git init -b main >/dev/null
git config user.name "${FULL_NAME}"
git config user.email "${USER_ID}+${LOGIN}@users.noreply.github.com"

git add -A

# Safety check: refuse files that look like keys or secrets.
RISKY_NAMES='\.(p12|pfx|pem|key|cer|crt|mobileprovision|provisionprofile)$|(^|/)\.env|id_(rsa|ed25519)'
RISKY_TEXT='BEGIN ([A-Z ]*)PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,}'
risky="$(git diff --cached --name-only | grep -E "$RISKY_NAMES" || true)"
secrets="$(git diff --cached -G"$RISKY_TEXT" --name-only || true)"
if [ -n "$risky$secrets" ]; then
  echo "✗ Stopped: these files look like keys or secrets and must not be published:"
  printf '%s\n' $risky $secrets | sort -u | sed 's/^/    /'
  echo "  Remove them from the folder (or add them to .gitignore), then run this again."
  git reset -q
  exit 1
fi

if git diff --cached --quiet; then
  echo "> Nothing new to commit."
else
  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    git commit -m "Update SpaceKeeper for ChromeOS" >/dev/null
  else
    git commit -m "Initial commit: SpaceKeeper for ChromeOS" >/dev/null
  fi
  echo "> Committed: $(git log -1 --pretty=%s)"
fi

# Show what will become PUBLIC and ask before uploading.
if git remote get-url origin >/dev/null 2>&1; then
  git fetch -q origin main 2>/dev/null || true
fi
if git rev-parse --verify -q origin/main >/dev/null; then RANGE="origin/main..HEAD"; else RANGE="HEAD"; fi
CHANGED="$(git log --name-status --pretty=format: "$RANGE" 2>/dev/null | sed '/^$/d' | sort -u)"
if [ -n "$CHANGED" ]; then
  echo ""
  echo "These files will be published to a PUBLIC repository (A = added, M = changed, D = deleted):"
  echo "$CHANGED" | sed 's/^/    /'
  echo ""
  read -r -p "Publish them? [y/N] " answer
  case "$answer" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Not published. Your commit is kept locally; run this again when ready."; exit 0 ;;
  esac
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "> Uploading..."
  git push -u origin main
else
  echo "> Creating public repository ${LOGIN}/${REPO_NAME}..."
  gh repo create "${REPO_NAME}" --public --description "${DESCRIPTION}" --source . --remote origin --push
fi

# Website: serve the repository's main branch as https://LOGIN.github.io/REPO/
if ! gh api "repos/${LOGIN}/${REPO_NAME}/pages" >/dev/null 2>&1; then
  echo "> Turning on the website (GitHub Pages)..."
  gh api -X POST "repos/${LOGIN}/${REPO_NAME}/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null \
    || echo "  Couldn't turn it on automatically: in the repository, open Settings › Pages and choose 'main' and '/ (root)'."
fi
gh api -X PUT "repos/${LOGIN}/${REPO_NAME}/pages" -F https_enforced=true >/dev/null 2>&1 || true

SITE="https://${LOGIN}.github.io/${REPO_NAME}/"
echo ""
echo "Done!"
echo "  Code:     https://github.com/${LOGIN}/${REPO_NAME}"
echo "  App:      ${SITE}   (ready in a minute or two)"
echo "  Demo:     ${SITE}?demo"
echo "  Admins:   allow https://${LOGIN}.github.io in the Desk API settings (see ADMIN-SETUP.md)"
