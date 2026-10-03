# SynAmp analyzer settings for this Mac.
#
# Copy this file to ~/SynAmp-data/env.sh, fill in the token, then load it in
# each new Terminal window with:   source ~/SynAmp-data/env.sh

# The music share, mounted from the NAS (Finder: smb://Syd.local/music)
export LIBRARY_PATH=/Volumes/music/library

# The analyzer's own database: on the Mac's disk, never on the share
export ANALYZER_DB_PATH="$HOME/SynAmp-data/analyzer.sqlite3"

# Moves made by SynAmp's librarian, so moved tracks keep their analysis
export RENAME_JOURNAL_PATH=/Volumes/music/.synamp/renames.jsonl

# Progress reports go to the web app
export SYNAMP_BRAIN_URL=http://Syd.local:8080

# Paste the PLAYLIST_API_TOKEN from deploy/.env on the NAS between the quotes
export SYNAMP_BRAIN_TOKEN="PASTE_YOUR_TOKEN_HERE"
