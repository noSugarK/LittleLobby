# Project Git requirements

- Create commits, merge branches, rewrite history, and push only through WSL Git. Do not use Windows Git for these actions.
- Author and committer must both be `nosugark <nosugark@qq.com>`; verify the effective identity before committing.
- The project repository is `git@github.com:noSugarK/LittleLobby.git`.
- Preserve existing uncommitted work. Do not push unrelated branches, backup refs, or tags.

- Commit only the current runtime character atlases. Do not commit generated source images, historical sprite variants, preview captures, or one-off image-processing scripts.
- Website deployment uses `.github/workflows/deploy.yml` and uploads `dist`; do not create a `docs` deployment directory.
