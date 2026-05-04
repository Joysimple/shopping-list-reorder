#!/bin/bash

# Exit on error
set -e

# Check if version is provided
if [ -z "$1" ]; then
  echo "Error: No version provided."
  echo "Usage: ./release.sh <version>"
  echo "Example: ./release.sh 0.0.6"
  exit 1
fi

VERSION=$1

# Ensure there are no unstaged changes in tracked files
if ! git diff --quiet; then
  echo "Error: There are unstaged changes in tracked files. Please stage or stash them first."
  exit 1
fi

echo "Bumping version to $VERSION..."

# 1. Update package.json and package-lock.json
# This automatically triggers the 'version' script in package.json,
# which runs 'node version-bump.mjs' and stages manifest.json and versions.json.
npm version "$VERSION" --no-git-tag-version

# 2. Stage the package files (npm version doesn't always stage them with --no-git-tag-version)
git add package.json package-lock.json

# 3. Commit the changes
git commit -m "chore: bump version to $VERSION"

# 4. Create an annotated tag
git tag -a "$VERSION" -m "$VERSION"

echo "---------------------------------------"
echo "Successfully bumped version to $VERSION"
echo "Tag $VERSION created locally."
echo "Run 'git push origin main --tags' to publish."
echo "---------------------------------------"
