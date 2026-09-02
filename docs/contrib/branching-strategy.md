---
description: Direct commit, push, and version tag workflow for the Cherry Reader fork
---

# Branching Strategy

Cherry Reader uses a direct commit and tag workflow for this private fork.

## Main Branch

`main` contains the latest development code. Changes are committed and pushed
directly from the current working branch.

## Release Tags

Version tags trigger the desktop release workflow:

- Major releases: `v1.0.0`, `v2.0.0`
- Feature releases: `v1.1.0`, `v1.2.0`
- Patch releases: `v1.0.1`, `v1.0.2`
- Hotfix releases: `v1.0.1-hotfix`

Release steps:

1. Update release metadata and generated artifacts.
2. Commit the version change on the current branch.
3. Push the branch commit to `origin`.
4. Create and push the matching `vX.Y.Z` tag.
5. Let `.github/workflows/release.yml` build and publish the artifacts.
