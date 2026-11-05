# Public repository and CI

## Attribution

This is an independent Electron rebuild of
[SJTU Canvas Helper](https://github.com/Okabe-Rintarou-0/SJTU-Canvas-Helper).
LICENSE preserves the upstream MIT notice, including Zihong Lin's copyright.
THIRD-PARTY-NOTICES.md records adapted code and icon attribution; licenses are
included in packaged files.

## Publication boundary

The original development history contained personal absolute paths. It remains
local only. The public main branch starts from a reviewed source snapshot and
does not descend from that private history. Do not push all branches, mirror the
repository, or upload old history bundles to the public repository.

Personal paths in documentation were replaced with repository-relative paths.
The tracked-file allowlist excludes credentials, session profiles, downloaded
media, logs, node_modules and release outputs. Test tokens and signatures are
explicit synthetic fixtures. The public scanner checks recognizable credential
and personal-path patterns; passing it is not a guarantee that every possible
secret format is detectable. Review every staged diff before publication.

Run `node scripts/audit-public.cjs` after staging new files. The script scans Git
tracked files, not the user's private profile directory. It prints file names
and rule names only, never matched secret values.

## Windows Actions build

Pushes to main/master/ci branches, pull requests and workflow_dispatch run:
locked dependency install, explicit Electron runtime install, public-source
audit, TypeScript checks, fixture tests, production build, Electron fixture
smoke and Windows x64 portable packaging. CI never logs into school services.

Open the successful run in the repository's Actions tab and download its
`windows-x64-portable-...` artifact. Artifacts include the executable, SHA256 and
license/use notices and expire after 14 days. No Release, tag publishing,
automatic updater, signing certificate or write-scoped repository permission is
configured. An Actions artifact is a build output, not a verified signed release.

## First hosted verification

The Windows GitHub-hosted build passed all steps, including 48 tests,
TypeScript, the Electron fixture smoke, portable packaging, checksums and
artifact upload:
https://github.com/0kitasan/SJTU-Canvas-Helper-Electron/actions/runs/41984385959

The remote repository initially contained no refs. Only the reviewed main
branch was pushed; local development branches and history bundles were not.
