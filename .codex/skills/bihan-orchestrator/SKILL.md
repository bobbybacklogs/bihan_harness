---
name: bihan-orchestrator
description: Bi-Han subagent orchestration and Icebox memory bus for OpenAI and Codex environments.
---

# Bi-Han Orchestrator for Codex & OpenAI

Use this skill to delegate multi-turn exploration, complex implementation loops, and heavy data artifacts to Bi-Han Sub-contractors.

## Tools
- bihan_list_contractors: View available subagents (e.g. Scout, Coder).
- bihan_hire_subcontractor: Dispatch a task to a specialized agent with its own isolated tool loop.
- bihan_get_contract: Retrieve status or result for a contractId.
- bihan_cancel_contract: Cancel an active contract.
- bihan_freeze: Store large payloads in Icebox memory.
- bihan_thaw: Retrieve stored payloads by key from Icebox memory.