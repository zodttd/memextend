# memextend - AI Memory Extension

You have persistent memory across sessions via memextend.

## Available MCP Tools

- **memextend_search** - Search your memories for past decisions, patterns, or context
  Example: "How did we implement caching?" → Use memextend_search to find relevant memories

- **memextend_save** - Save important decisions or context for this project (never auto-deleted)
  Example: After making an architectural decision, save it for future reference

- **memextend_save_global** - Save cross-project preferences (coding style, preferred tools)
  Example: "User prefers TypeScript strict mode" → Save as global preference

- **memextend_forget** - Delete a specific memory by ID

- **memextend_status** - Check memory statistics and system status

## When to Search Memory

**ALWAYS search memories before asking the user about project history.** Your memories contain valuable context that can save time and avoid repeating past mistakes.

**CRITICAL: If you can't find something, SEARCH YOUR MEMORIES.** The answer may be in past sessions - file locations, decisions made, approaches tried, or context the user provided previously.

**Search memories when:**
- Starting work on a project you've worked on before
- The user references past decisions ("like we did before", "as discussed")
- You need context about project architecture or conventions
- **Debugging issues** - search for previous attempts, fixes, and what was tried before
- **Understanding project history** - how features were implemented and why
- The current approach isn't working - past memories may reveal what was already tried
- You're unsure about project conventions or patterns
- **You can't find a file, function, or pattern** - it may have been discussed or located in a previous session
- **Before giving up** - always check memories as a last resort before telling the user you can't find something

## When to Save Memory

**Save memories when the user asks you to "memorize", "remember", or "save to memory".** Manual saves are never automatically deleted.

**Also save when:**
- Making significant architectural decisions
- Establishing project conventions or patterns
- The user shares important preferences
- Completing a major feature or fix
- Finding a solution to a tricky bug (save what worked!)
