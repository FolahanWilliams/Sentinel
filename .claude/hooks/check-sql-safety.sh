#!/usr/bin/env bash
# Sentinel — PreToolUse hook for mcp__claude_ai_Supabase__execute_sql
#
# Reads the hook input JSON from stdin, extracts the SQL query, and BLOCKS
# the call if it contains destructive keywords. Safe (read-only) SQL passes
# through silently — exit 0 with no output → default allow.
#
# Patterns that trip the gate:
#   - DROP <table|database|schema|function|trigger|view|index|policy|extension|column>
#   - TRUNCATE [TABLE]
#   - DELETE FROM <table> (without a WHERE clause)
#   - ALTER TABLE … DROP COLUMN
#   - ALTER SYSTEM …
#   - DELETE FROM auth.* / storage.* (always destructive)

set -euo pipefail

# Read full stdin into a variable (hooks send JSON on stdin).
INPUT="$(cat || true)"

# Extract the SQL query — use empty string on parse failure.
QUERY="$(printf '%s' "$INPUT" | jq -r '.tool_input.query // ""' 2>/dev/null || true)"

if [ -z "$QUERY" ]; then
    # No query to inspect — let the call proceed.
    exit 0
fi

# Normalize for regex matching: lowercase, collapse whitespace.
NORM="$(printf '%s' "$QUERY" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' ')"

# Patterns. The trailing -E uses ERE; \b is GNU-grep-only on macOS so we use
# explicit word boundaries with surrounding spaces / start of string.
DESTRUCTIVE_RE='(^|[^a-z])(drop[[:space:]]+(table|database|schema|function|trigger|view|index|policy|extension|column|role|user|materialized|sequence|type|publication|subscription)|truncate([[:space:]]+table)?[[:space:]]+|alter[[:space:]]+table[[:space:]]+[a-z0-9_."]+[[:space:]]+drop|alter[[:space:]]+system|delete[[:space:]]+from[[:space:]]+(auth|storage|vault|supabase_functions)\.)'

# DELETE FROM <table> without WHERE — slightly more permissive: match `delete from <ident> ;|$|returning`.
DELETE_NO_WHERE_RE='delete[[:space:]]+from[[:space:]]+[a-z0-9_."]+([[:space:]]*;|[[:space:]]*$|[[:space:]]+returning)'

REASON=""
if printf '%s' "$NORM" | grep -Eq "$DESTRUCTIVE_RE"; then
    REASON="Destructive SQL keyword detected (DROP / TRUNCATE / ALTER … DROP / ALTER SYSTEM / DELETE on system schema)."
elif printf '%s' "$NORM" | grep -Eq "$DELETE_NO_WHERE_RE"; then
    REASON="DELETE FROM <table> without a WHERE clause — run manually if intended."
fi

if [ -n "$REASON" ]; then
    # Emit a deny decision. The hook runtime parses this JSON and blocks
    # the tool call without prompting.
    jq -nc --arg reason "$REASON" '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: $reason
        }
    }'
    exit 0
fi

# Safe SQL — exit silently, default permission flow applies.
exit 0
