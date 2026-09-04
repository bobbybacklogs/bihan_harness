---
name: bihan-orchestrator
description: Delegate complex, multi-tool tasks to specialized Bi-Han Sub-contractors (subagents) and store large payloads in the Icebox state bus.
---

# Bi-Han Orchestration Skill

Use this skill whenever a user task would require heavy token consumption or multi-turn tool loops.

## Sub-contractor Toolset

- bihan_list_contractors: View available subagents and their capabilities.
- bihan_hire_subcontractor: Dispatch a task to a specialized agent (e.g. Scout or Coder) with its own isolated loop.
- bihan_get_contract: Check the status or result of a contract.
- bihan_cancel_contract: Terminate a running contract.
- bihan_freeze: Save large payloads into the shared Icebox memory.
- bihan_thaw: Retrieve payloads from the Icebox.

## Workflow

1. Check available sub-contractors with bihan_list_contractors.
2. Dispatch targeted tasks with bihan_hire_subcontractor.
3. If data is large, tell the sub-contractor to freeze the output into Icebox and thaw it as needed.