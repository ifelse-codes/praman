# Structure Steering

src/
  cli.ts            CLI entry (commander)
  case/             declaration schemas, workflow/trace reconstruction, composition
  eval/             browser + command proof engines, identity, media, verdict type
  core/             demonstrate/preview/workflow/campaign orchestration
  environments/     kind/Docker providers, ownership, runtime, schema
  gateway/          declared stateful HTTP test service + replay
  report/           proof-gated video, command video, speech cache, spotlight
  review/           feedback, diagnostics, coverage review
  mcp/              stdio MCP server
examples/first-use/ public negative-control runner (CLI + MCP, 12 outcomes)
examples/self-check/ PRAMAN checks its own fixes (PRAMAN is the target; repair mode)
docs/               product docs (first-use, static acceptance, release, status)
.kiro/              specs, steering, hooks, agent
praman/.praman/     ignored private runtime evidence (not in Git)

Removed 2026-11-05: legacy checkout pipeline (verify/world/gateway/chaos/soak/
trace/dashboard), target-specific integrations/examples, process-log docs.
Top-level directories not listed here (headlamp/, kan/, luma/, stern/) are separate
checkouts, not part of the product.
