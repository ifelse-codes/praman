# Product Steering

PRAMAN (प्रमाण) is an evidence-driven verification toolkit that augments AI coding agents. It does not generate code; it experiences, stimulates, observes and reviews the software an agent produced, then returns actionable, evidence-backed findings.

Core loop: Build → Experience → Stimulate → Test → Observe → Review → Improve → Repeat.

Principles:
- Never turn missing evidence into a green tick.
- Distinguish "passed", "not executed", "insufficient evidence".
- Define business invariants (no duplicate charge, non-negative inventory, completed order has payment).
- Reuse existing browser automation, infra, observability; do not rebuild a browser engine or LLM.

Video quality is a product contract, not optional demo polish. Read
`docs/video-guidelines.md` before preparing walkthroughs. Explain the real problem,
why it matters, the relevant old/fixed code in small focused steps, the same
workflow working afterward, and the delivered result/limits. Use conversational,
easy-to-follow language, real surfaces, measured narration and focused visuals.
Do not narrate raw action notes or dump a diff/output log as the explanation.
The coding agent authors the story from evidence; PRAMAN does not invent causes.

