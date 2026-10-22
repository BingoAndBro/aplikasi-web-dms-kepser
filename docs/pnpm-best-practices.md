# pnpm Best Practices

pnpm ( performant npm ) is a fast, disk-space-efficient package manager that uses content-addressable storage and symlinks instead of a flat `node_modules` structure.

---

## Common Commands

### Install All Dependencies

```bash
# Install all dependencies from package.json
pnpm install

# Install only production dependencies (skip devDependencies)
pnpm install --prod

# Install only devDependencies
pnpm install --dev

# Skip optionalDependencies
pnpm install --no-optional

# Re-fetch and rebuild everything (force)
pnpm install --force

# Use only cached packages (offline)
pnpm install --offline
pnpm install --prefer-offline

# Update lockfile only, skip node_modules
pnpm install --lockfile-only

# Fail if lockfile is out of sync (use in CI)
pnpm install --frozen-lockfile

# Auto-repair broken lockfile entries
pnpm install --fix-lockfile

# Resolve dependencies without writing to node_modules
pnpm install --resolution-only

# Skip postinstall/prepare scripts
pnpm install --ignore-scripts
```

### Add a Package

```bash
# Add as production dependency (default)
pnpm add <package>
pnpm add -P <package>
pnpm add --save-prod <package>

# Add as dev dependency
pnpm add -D <package>
pnpm add --save-dev <package>

# Add as optional dependency
pnpm add -O <package>
pnpm add --save-optional <package>

# Add exact version (no semver range)
pnpm add -E <package>

# Add from workspace
pnpm add <package> --filter <workspace-package>

# Add to workspace root (monorepo)
pnpm add <package> -w
pnpm add <package> --ignore-workspace-root-check
```

### Update Packages

```bash
# Update all packages within their semver ranges
pnpm up

# Update all packages to absolute latest
pnpm up --latest

# Update a specific package
pnpm up <package>
pnpm up foo@2          # Update to v2
pnpm up "babel/*"      # Update all babel packages

# Interactive update (select which packages)
pnpm up --interactive

# Align versions across workspace packages
pnpm up --workspace

# Update only production or dev dependencies
pnpm up --prod
pnpm up --dev

# Skip optional dependencies
pnpm up --no-optional

# Preview without modifying package.json
pnpm up --no-save

# Update recursively across workspace
pnpm up --recursive
```

### Remove a Package

```bash
pnpm remove <package>
pnpm rm <package>           # alias
pnpm uninstall <package>    # alias
pnpm un <package>           # alias

# Remove from specific dependency type
pnpm remove -P <package>    # from dependencies
pnpm remove -D <package>    # from devDependencies
pnpm remove -O <package>    # from optionalDependencies

# Remove recursively in workspace
pnpm remove -r <package>

# Remove with filter
pnpm remove <package> --filter <workspace-package>
```

### Run Scripts

```bash
# Run a script from package.json
pnpm run <script>
pnpm <script>          # shorthand (if no name conflict)

# Run across all workspace packages
pnpm run <script> --recursive
pnpm run <script> -r

# Run multiple scripts by regex
pnpm run "/<regex>/"
pnpm run "/^watch:.*/"    # run all scripts starting with "watch:"

# Don't fail if script is missing
pnpm run <script> --if-present

# Run concurrently (no dependency ordering)
pnpm run <script> --parallel

# Stream interleaved output from multiple packages
pnpm run <script> --stream

# Target specific package
pnpm run <script> --filter <package>
```

### Query Dependencies

```bash
# List direct dependencies
pnpm list
pnpm ls

# List all (deep) dependencies
pnpm list --depth Infinity

# Show only direct deps (default depth=0)
pnpm list --depth 0

# List packages matching pattern
pnpm list "babel-*" "eslint-*"

# JSON output
pnpm list --json

# Parseable (directory) output
pnpm list --parseable

# Read from lockfile instead of node_modules
pnpm list --lockfile-only

# List global packages
pnpm list --global

# Recursive (workspace)
pnpm list --recursive

# Only show workspace dependencies
pnpm list --only-projects
```

### Other Useful Commands

```bash
# Execute a command in each workspace package
pnpm exec <command>
pnpm recursive exec <command>

# Import existing lockfile (npm or yarn) to pnpm
pnpm import

# Prune extraneous dependencies
pnpm prune

# Display why a package is installed
pnpm why <package>
pnpm why <package> --recursive

# Rebuild native modules
pnpm rebuild

# Store management
pnpm store status
pnpm store prune
pnpm store add <package>
```

---

## Global vs Project Installs

| Use Case | Command | Installs To |
|----------|---------|-------------|
| CLI tool needed in one project only | `pnpm add -D <pkg>` | Project's `node_modules` (local) |
| CLI tool needed across all projects | `pnpm add -g <pkg>` | Global store |
| Build/CI tool used by every project | `pnpm add -D <pkg>` | Local (committed via package.json) |

### When to Use Global

Use `--global` (or `-g`) only for **CLI tools you invoke from the terminal directly and repeatedly across many projects**:

```bash
# Good global installs
pnpm add -g typescript
pnpm add -g pnpm

# Bad - local installs are almost always better
pnpm add -g webpack    # wrong: should be a project devDependency
pnpm add -g eslint     # wrong: should be a project devDependency
```

### When to Use Project Installs

Always prefer project-level installs. Add packages to `package.json` so the project is reproducible:

```bash
# Default: installs as production dependency (dependencies)
pnpm add express

# Dev tools: testing, linting, TypeScript, build tools
pnpm add -D jest
pnpm add -D typescript
pnpm add -D vite
pnpm add -D eslint
pnpm add -D @types/node

# Production runtime dependencies
pnpm add express
pnpm add lodash
pnpm add zod

# Optional dependencies (platform-specific extras)
pnpm add -O fsevents    # only needed on macOS/Windows
```

---

## Workspace / Monorepo Setup

### Initialize a Workspace

Create `pnpm-workspace.yaml` in the repository root:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
  # or list individually:
  # - 'packages/ui'
  # - 'packages/api'
```

### Key Workspace Commands

```bash
# Add a package to a specific workspace package
pnpm add <pkg> --filter <workspace-package>

# Add a local workspace package as a dependency
pnpm add <workspace-package>

# Run script in all workspace packages
pnpm --recursive run build
pnpm -r run test

# Update across all workspace packages
pnpm up --recursive --workspace

# List packages in workspace
pnpm list --recursive

# Remove from all workspace packages
pnpm remove <pkg> --recursive
```

### Workspace Protocol

Reference local packages in `package.json` using the `workspace:` protocol:

```json
{
  "dependencies": {
    "@myorg/ui": "workspace:*",
    "@myorg/utils": "workspace:^1.0.0"
  }
}
```

| Protocol | Behavior |
|----------|----------|
| `workspace:*` | Always use the local version |
| `workspace:~` | Patch-compatible updates allowed |
| `workspace:^` | Minor and patch updates allowed |

> When published, `workspace:` specs are automatically converted to semver ranges.

### Recommended Workspace Settings (.npmrc)

```ini
# Link local packages instead of downloading
link-workspace-packages=true

# Single shared lockfile for entire workspace
shared-workspace-lockfile=true

# Include root in recursive operations
include-workspace-root=true

# Fail if a filter matches nothing
fail-if-no-match=true
```

---

## Cheat Sheet

| Task | Command |
|------|---------|
| Install all deps | `pnpm install` |
| Add production dep | `pnpm add <pkg>` |
| Add dev dep | `pnpm add -D <pkg>` |
| Add global tool | `pnpm add -g <pkg>` |
| Update all | `pnpm up` |
| Update to latest | `pnpm up --latest` |
| Interactive update | `pnpm up --interactive` |
| Remove package | `pnpm remove <pkg>` |
| Run script | `pnpm run <script>` |
| Recursive in workspace | `pnpm -r <command>` |
| List deps | `pnpm list` |
| List global deps | `pnpm list -g` |
| Why is it installed | `pnpm why <pkg>` |
| Import npm/yarn lock | `pnpm import` |
| Update lockfile only | `pnpm install --lockfile-only` |
| CI frozen lockfile | `pnpm install --frozen-lockfile` |
| Offline install | `pnpm install --offline` |
| Target workspace pkg | `pnpm <cmd> --filter <pkg>` |
| Add to workspace root | `pnpm add <pkg> -w` |
| Update workspace-wide | `pnpm up --workspace` |
| Skip scripts | `pnpm install --ignore-scripts` |

---

## Common Mistakes to Avoid

### 1. Using `--shamefully-hoist` to Fix Compatibility Issues

```bash
# AVOID - creates a flat node_modules that hides bugs
pnpm install --shamefully-hoist
```

**Why it is bad:** This flattens `node_modules`, making transitive dependencies accessible like npm/yarn. It can mask missing direct dependencies and causes issues when packages ship incorrect bundled dependencies.

**Correct approach:** Fix the root cause (missing peer dependencies, broken packages). Only use `--shamefully-hoist` as a last resort for legacy tooling that truly requires it.

### 2. Confusing `pnpm add` vs `pnpm install`

- Use `pnpm add` when **adding a new package** to your project. It updates `package.json`.
- Use `pnpm install` when **restoring** all dependencies (e.g., after `git clone`, switching branches, or manual `package.json` edits).

```bash
# After git clone - use install (no package changes)
pnpm install

# To add a new package - use add
pnpm add lodash
pnpm add -D jest
```

### 3. Not Specifying Dependency Type

Always be intentional about where a package goes:

```bash
# WRONG - ESLint should be a devDependency
pnpm add eslint          # installs as production dep by default

# CORRECT - linting tools are dev dependencies
pnpm add -D eslint

# CORRECT - runtime libraries are production dependencies
pnpm add express
```

### 4. Using `--force` or `--ignore-scripts` by Default

```bash
# WRONG - --force bypasses cache and slows installs
pnpm install --force    # avoid in normal workflow

# OK when needed - skip native module build scripts
pnpm install --ignore-scripts
```

Reserve `--force` and `--ignore-scripts` for CI troubleshooting, not daily use.

### 5. Committing `node_modules`

```bash
# WRONG - never commit node_modules
git add node_modules/

# CORRECT - commit package.json and lockfile only
git add package.json pnpm-lock.yaml
```

pnpm's content-addressable store means you never need to commit installed packages.

### 6. Ignoring the Lockfile in CI

```bash
# WRONG - no lockfile enforcement
pnpm install

# CORRECT - fail fast if dependencies drift
pnpm install --frozen-lockfile
```

Always use `--frozen-lockfile` in CI pipelines to ensure reproducible builds.

### 7. Forgetting `--filter` in Monorepos

In workspaces, commands run in the current directory only by default:

```bash
# WRONG - only affects current package
pnpm add lodash

# CORRECT - explicitly target the package
pnpm add lodash --filter @myorg/api

# CORRECT - add to workspace root
pnpm add lodash -w
```

### 8. Mixing Package Managers

Do not mix `pnpm`, `npm`, and `yarn` in the same project. They use different lockfile formats and `node_modules` structures:

```bash
# Use pnpm consistently
pnpm install
pnpm add <pkg>

# If migrating from npm/yarn, use import first
pnpm import    # converts package-lock.json or yarn.lock
```

### 9. Not Using Workspace Protocol for Internal Packages

```json
// WRONG - resolves from registry, not locally
{ "dependencies": { "@myorg/ui": "^1.0.0" } }

# CORRECT - uses local package
{ "dependencies": { "@myorg/ui": "workspace:*" } }
```

The `workspace:` protocol ensures local development always uses the source code, not the published version.

### 10. Skipping `--no-optional` in Production Docker Builds

```dockerfile
# Recommended Dockerfile optimization
RUN pnpm install --prod --no-optional
```

Optional dependencies (e.g., platform-specific native modules) are not needed in production and increase image size.

---

## Quick Reference: --save-dev vs --save-prod vs Default

| Flag | Saves To | Use When |
|------|----------|----------|
| (default, no flag) | `dependencies` | Runtime libraries (express, lodash, zod) |
| `-D, --save-dev` | `devDependencies` | Build tools, test runners, linters, TypeScript |
| `-O, --save-optional` | `optionalDependencies` | Platform-specific modules (fsevents), optional native bindings |
| `-E, --save-exact` | exact version in whichever field | Reproducible builds for a specific package |

---

Sources:
- [pnpm add command](https://pnpm.io/cli/add)
- [pnpm install command](https://pnpm.io/cli/install)
- [pnpm remove command](https://pnpm.io/cli/remove)
- [pnpm update command](https://pnpm.io/cli/update)
- [pnpm run command](https://pnpm.io/cli/run)
- [pnpm list command](https://pnpm.io/cli/list)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [pnpm import command](https://pnpm.io/cli/import)
