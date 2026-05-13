#!/bin/bash

# Configuration
PLUGIN_NAME="shopping-list-automatic-reorder"
VAULT_PLUGINS_DIR="$HOME/Documents/Obsidian Vault/.obsidian/plugins"
TARGET_DIR="$VAULT_PLUGINS_DIR/$PLUGIN_NAME"
SOURCE_DIR="$(pwd)"

echo "Setting up local installation for $PLUGIN_NAME..."

# Ensure the plugins directory exists
if [ ! -d "$VAULT_PLUGINS_DIR" ]; then
    echo "Creating plugins directory: $VAULT_PLUGINS_DIR"
    mkdir -p "$VAULT_PLUGINS_DIR"
fi

# Remove existing symlink or folder if it exists
if [ -L "$TARGET_DIR" ] || [ -e "$TARGET_DIR" ]; then
    echo "Cleaning up existing installation at $TARGET_DIR..."
    rm -rf "$TARGET_DIR"
fi

# Create the symlink
echo "Creating symlink..."
ln -s "$SOURCE_DIR" "$TARGET_DIR"

if [ $? -eq 0 ]; then
    echo "------------------------------------------------"
    echo "SUCCESS: Plugin symlinked to vault!"
    echo "Target: $TARGET_DIR"
    echo "------------------------------------------------"
    echo "Next steps:"
    echo "1. Run 'npm run build' to ensure main.js is up to date."
    echo "2. Open Obsidian > Settings > Community Plugins."
    echo "3. Refresh and enable '$PLUGIN_NAME'."
else
    echo "ERROR: Failed to create symlink."
    exit 1
fi
