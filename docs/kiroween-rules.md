# Kiroween 2026 — captured official rules (2026-11-05)

Source: the official rules page at <https://kiroween.devpost.com/rules>, fetched and
text-extracted on 2026-11-05. This is a working digest, not a substitute: if anything
conflicts, the live page wins.

## Dates

- **Registration:** October 13, 2026 8:30 am PT – December 4, 2026 2:00 pm PT.
- **Submission:** October 30, 2026 9:00 am PT – **December 4, 2026 2:00 pm PT**.
- No extensions; late submissions are not accepted.
- **Judging:** December 16, 2026 – January 29, 2027. Winners on or around February 3, 2027.

## What must be built

A working software application built with **Kiro (IDE, CLI, Web, and/or Kiro Crew)**,
submitted into exactly one category:

| Category | Definition |
| --- | --- |
| Resurrection | Bring a dead technology back to life |
| **Frankenstein** | Stitch together a chimera of technologies into one app |
| Skeleton Crew | A lean skeleton template shown with two distinct applications |
| Costume Contest | Polished, haunting user interface |

**Insufficient use of Kiro results in disqualification** at the judges' discretion.
The project must be installable and run consistently on its intended platform, and must
function as depicted in the video and/or described in the text.

## Submission requirements (checklist)

1. Text description explaining the features and functionality.
2. **Demonstration video under 3 minutes**, showing the project functioning on the
   device it was built for; uploaded publicly to **YouTube** with the link in the
   submission form; no third-party trademarks or copyrighted music/material without
   permission.
3. **Public GitHub repository URL** (not GitLab or Bitbucket) containing all source
   code, assets and instructions needed to run the project.
4. Repository is **public and open source**, with an open-source license file that is
   detectable and visible in the repository About section.
5. **/.kiro directory at the repository root**, not in .gitignore (specs, hooks,
   steering, etc. count as usage evidence).
6. Identify the category and any bonus category.
7. **Write-up on how Kiro was used**: IDE/CLI/Web/Crew differences if tried, custom
   agents, agent hooks, spec-driven development versus vibe coding, steering docs,
   MCP, property-based testing, Kiro powers.
8. Bonus blog (optional): public URL, must mention it is written for Kiroween 2026 and
   be published during the submission period.
9. Bonus social post (optional): must **start** with #KiroweenHackathon26, include a
   favourite thing about Kiro and how it changed the approach, posted during the
   submission period, link in the form.
10. Conditional bonus categories (Kiro Crew App, Best Startup, Best Student) have
    their own evidence requirements.

**Judging access is required.** The Testing section says: "Access must be provided to an
Entrant's working Project for judging and testing by providing a link to a website,
functioning demo, or a test build. If the Entrant's website is private, the Entrant must
include login credentials and testing instructions... Failure to provide access to the
Project for testing when requested may result in disqualification." PRAMAN provides the
public repository as the test build, a one-click Codespaces route and explicit
[testing instructions](../TESTING.md) from the repository root.

## Judging criteria (equally weighted, 20% each)

1. **Potential Impact** — credible real-world problem, useful/intuitive/accessible.
2. **Technological Implementation** — depth and strategy of Kiro use, variety of
   Kiro tools, experimentation.
3. **Design** — a complete, coherent product experience, not just a technical proof.
4. **Innovation / Idea** — novelty versus existing concepts.
5. **Presentation** — video demonstrates end-to-end; pitch explains problem, audience
   and why it matters; memorable.

## PRAMAN mapping (honest status)

| Requirement | Status |
| --- | --- |
| Category: Frankenstein | Declared in the Devpost draft |
| Public repo + detectable MIT license | Published: github.com/ifelse-codes/praman (MIT) |
| /.kiro at root, not ignored | Present and tracked |
| Text description | Draft ready ([devpost-draft.md](devpost-draft.md)) |
| Video <=3 min on YouTube | Storyboard rewritten 2026-11-09 from recorded Kiro work only ([video-script.md](video-script.md)); recording pending (owner) |
| Kiro usage write-up | Ready ([kiro-usage.md](kiro-usage.md)): integration plus six spec-driven changes in recorded Kiro CLI sessions |
| Blog / social bonus | Drafts updated 2026-11-09; posting needs the owner's yes |
| Judge access (website/demo/test build) | Public repo test build + Codespaces + [TESTING.md](../TESTING.md) |

**Biggest risk (updated 2026-11-09):** no video yet; presentation is 20% and the video
is required. Technological Implementation now rests on recorded Kiro CLI work (specs,
hooks, custom agent, MCP, Power and the spec-driven PRAMAN changes); keep the account
precise and never inflate it. The 2026-11-05 risk (one IDE session plus a quota-blocked
CLI attempt) no longer describes the evidence.
