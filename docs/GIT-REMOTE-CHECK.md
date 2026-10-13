# Git remote verification — October 7, 2026

Repository checked: `C:/Users/Lenovo/CodeGeeXProjects/usama-sftp`.

User-requested GitHub URL: `https://github.com/ai-ml-software/usama-cv`.

| Check | Result |
| --- | --- |
| Current origin | `https://github.com/ai-ml-software/usama-cv.git` for fetch and push. |
| Preserved upstream | `https://github.com/Natizyskunk/vscode-sftp.git`. |
| Requested repository read access | Passed. `git ls-remote --heads` returned `c4add5e898de7192277599ff85e75c936699da2b refs/heads/main`. |
| Proposed source branch | `usama-sftp`, separate from the CV website's existing `main` branch. |
| Non-writing push check | `git push --dry-run origin HEAD:refs/heads/usama-sftp` could not authenticate: HTTPS credentials unavailable with interactive prompting disabled. |
| Actual write permission | Unverified; authenticate a GitHub account with repository write permission, then repeat the preview. |
| Actual push | Not performed. No GitHub files/commits changed. |

Only remote URL configuration was changed locally. Repository files were not cloned, checked out or downloaded for the access checks. `upstream` retains the original shallow clone's pinned-tag refspec; its rename warning refers to that refspec, not a failed connection. The new `origin` has its own normal branch refspec.

The source files contain all current extension work, still uncommitted. A dry-run against `HEAD` checks the committed ref, not those uncommitted files. Review and commit them on `usama-sftp` before uploading the final source branch.

See README.md for authentication, direct server editing, Git deployment and publishing instructions. GitHub Git transport does not provide SFTP filesystem access. Direct remote editor tests use actual SFTP/FTP/FTPS servers; repository access tests use Git refs.
