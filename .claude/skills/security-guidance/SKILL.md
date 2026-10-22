---
name: security-guidance
description: Proactively warns about and prevents common security vulnerabilities when writing or editing code. Use this skill when writing any code that involves: file editing, shell commands, web output, serialization, GitHub Actions workflows, JavaScript eval/innerHTML/document.write, Python os.system/pickle, or any user-controlled input flowing into dangerous sinks. Trigger this whenever you're about to write code that touches command execution, HTML rendering, or dynamic code evaluation — even if the user hasn't explicitly asked for a security review.
---

# Security Guidance

Whenever you're about to write or edit code, check whether the new content matches any of the patterns below **before proceeding**. If a match is found and you haven't already warned about it in this conversation, surface the warning clearly and ask the user to confirm they understand the risk before continuing.

The goal isn't to block everything — it's to make sure the user is making an informed decision. A one-time, clear warning per risk is enough.

---

## Security Patterns to Check

### 1. GitHub Actions Workflow Injection

**Trigger:** Editing any file under `.github/workflows/` (`.yml` or `.yaml`)

**Risk:** Command injection via untrusted event inputs (issue title, PR body, commit messages, etc.) inserted directly into `run:` steps.

**Warn if you see patterns like:**
```yaml
# ❌ UNSAFE — user-controlled input flows into shell
run: echo "${{ github.event.issue.title }}"
run: echo "${{ github.event.pull_request.body }}"
```

**Safe alternative:**
```yaml
# ✅ SAFE — pass through env variable with proper quoting
env:
  TITLE: ${{ github.event.issue.title }}
run: echo "$TITLE"
```

**High-risk GitHub Actions inputs to flag:**
- `github.event.issue.title` / `.body`
- `github.event.pull_request.title` / `.body` / `.head.ref` / `.head.label`
- `github.event.comment.body`
- `github.event.review.body` / `github.event.review_comment.body`
- `github.event.commits.*.message`
- `github.event.head_commit.message` / `.author.email` / `.author.name`
- `github.head_ref`

Reference: https://github.blog/security/vulnerability-research/how-to-catch-github-actions-workflow-injections-before-attackers-do/

---

### 2. Command Injection via `child_process.exec()` (Node.js)

**Trigger:** Writing `child_process.exec`, `exec(`, or `execSync(` in JavaScript/TypeScript

**Risk:** Shell injection when user-controlled input is interpolated into the command string.

**Warn if you see:**
```js
// ❌ UNSAFE
exec(`git checkout ${branchName}`)
execSync(`rm -rf ${userPath}`)
```

**Safe alternative:**
```js
// ✅ SAFE — use execFile, which avoids shell interpretation
import { execFileNoThrow } from '../utils/execFileNoThrow.js'
await execFileNoThrow('git', ['checkout', branchName])
```

`execFile` passes arguments as a list, not a shell string — no injection possible.

---

### 3. Dynamic Code Evaluation — `eval()` (JavaScript)

**Trigger:** Writing `eval(` in JavaScript/TypeScript

**Risk:** Arbitrary code execution if the argument contains any user-controlled data.

```js
// ❌ UNSAFE
eval(userInput)
eval(`return ${expression}`)
```

Prefer `JSON.parse()` for data, or restructure logic to avoid dynamic evaluation entirely.

---

### 4. Dynamic Code Evaluation — `new Function()` (JavaScript)

**Trigger:** Writing `new Function` in JavaScript/TypeScript

**Risk:** Similar to `eval()` — executes arbitrary code from strings.

```js
// ❌ UNSAFE
const fn = new Function('x', userCode)
```

Alert the user and suggest a safe design pattern alternative.

---

### 5. XSS via `dangerouslySetInnerHTML` (React)

**Trigger:** Writing `dangerouslySetInnerHTML` in JSX/TSX

**Risk:** Cross-Site Scripting (XSS) if content is not sanitized.

```jsx
// ❌ UNSAFE — if `html` comes from user input or an API
<div dangerouslySetInnerHTML={{ __html: html }} />
```

If HTML rendering is genuinely required, sanitize with **DOMPurify** first:
```jsx
// ✅ SAFE
import DOMPurify from 'dompurify'
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
```

---

### 6. XSS via `document.write()` (JavaScript)

**Trigger:** Writing `document.write` in JavaScript

**Risk:** XSS and performance issues. `document.write` should be avoided entirely.

**Safe alternative:** Use `createElement()` + `appendChild()` or `textContent`.

---

### 7. XSS via `.innerHTML` Assignment (JavaScript)

**Trigger:** Writing `.innerHTML =` or `.innerHTML=` in JavaScript

**Risk:** XSS if the value contains untrusted HTML.

```js
// ❌ UNSAFE
element.innerHTML = userInput
```

```js
// ✅ SAFE alternatives
element.textContent = userInput  // for plain text
element.innerHTML = DOMPurify.sanitize(userInput)  // if HTML is needed
```

---

### 8. Unsafe Deserialization via `pickle` (Python)

**Trigger:** Writing `pickle` in Python files

**Risk:** Arbitrary code execution when deserializing untrusted data. `pickle.loads()` from unknown sources is essentially `eval()`.

```python
# ❌ UNSAFE
import pickle
obj = pickle.loads(user_data)
```

Prefer `json`, `msgpack`, or `protobuf` for data serialization unless pickle is explicitly required and the data source is fully trusted.

---

### 9. Shell Injection via `os.system()` (Python)

**Trigger:** Writing `os.system` or `from os import system` in Python

**Risk:** Shell injection if arguments are user-controlled.

```python
# ❌ UNSAFE
os.system(f"rm {filename}")
```

**Safe alternative:** Use `subprocess.run()` with a list argument:
```python
# ✅ SAFE
import subprocess
subprocess.run(["rm", filename])  # no shell, no injection
```

---

## How to Apply This Guidance

1. **Before writing or editing code**, scan the content you're about to produce for these patterns.
2. **If a match is found**, surface the relevant warning above — concisely, not lecturing.
3. **Ask once** whether the user confirms they understand the risk or wants to use the safer pattern.
4. **Don't warn twice** about the same pattern in the same file within a conversation — one warning per file/pattern pair is enough.
5. **Don't block benign code.** For example, a comment mentioning `eval` or a test asserting that `innerHTML` is forbidden don't need warnings.

The spirit of this skill is: catch the dangerous case before it happens, explain why it matters, and suggest a concrete safer path. Then trust the user to make the final call.
