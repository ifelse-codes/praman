# Publishing identity (owner rule, 2026-11-08)

The repository is public. Before **any** push or merge:

1. Check the identity every new commit will carry: `git log --format='%an <%ae> | %cn <%ce>'`
   for the commits being pushed. Public history uses
   `Suman Patra <ifelse-codes@users.noreply.github.com>`.
2. Merges made by GitHub (`gh pr merge`, the web button) are authored with the GitHub
   account's primary email. Check `gh api user/emails` first: if the primary email is
   not private, a GitHub-made merge commit would publish it. Stop and ask the owner, or
   use a merge that creates no new commit (fast-forward of a branch whose commits
   already carry the public identity).
3. Never push, merge or force-push without the owner's explicit yes for that action.
