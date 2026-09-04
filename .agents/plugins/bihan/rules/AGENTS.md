# Bi-Han Subagent Guidelines for Gemini and Antigravity

When this plugin is active, you have access to specialized Sub-contractors (subagents) and the Icebox state bus.

## When to use Bi-Han Tools

1. Multi-turn Exploration & Refactoring:
   - When a user request requires inspecting numerous files, running repeated terminal verification loops, or heavy research, do NOT exhaust your own conversation context.
   - Call bihan_hire_subcontractor with contractor Scout (for file reconnaissance) or Coder (for code changes and command runs).

2. Large Artifact Management (Icebox):
   - If you produce or receive large JSON blobs, ASTs, or multi-megabyte text outputs, store them in the Icebox using bihan_freeze(key, data).
   - Retrieve them on-demand with bihan_thaw(key).

3. Inspect Active Contractors:
   - Use bihan_list_contractors to discover available subagents, their skillsets, and their tool bundles.
   - Use bihan_get_contract to check the progress or outcome of a delegated task.