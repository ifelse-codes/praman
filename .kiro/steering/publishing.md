# Publishing identity (owner rule, 2026-11-08)

The repository is public. Before **any** push or merge:

1. Check the identity every new commit will carry: `git log --format='%an <%ae> | %cn <%ce>'`
   for the commits being pushed. Public history uses
   `Suman Patra <ifelse-codes@users.noreply.github.com>`.
2. Merges made by GitHub (`gh pr merge`, the web button) are authored by the GitHub
   account, not the local config. Check `gh api user/emails` first. Since 2026-11-08 the
   primary email is private, so a GitHub-made commit would use
   `61561324+ifelse-codes@users.noreply.github.com`: no private address leaks, but it
   differs from public history. Prefer a merge that creates no new commit (fast-forward
   of a tested branch whose commits already carry the public identity). If the primary
   email ever shows as public again, stop and ask the owner.
3. Never push, merge or force-push without the owner's explicit yes for that action.
