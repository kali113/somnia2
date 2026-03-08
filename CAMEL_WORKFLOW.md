# CAMEL Workflow

Use CAMEL as your planning/coordinator layer and OpenCode as your implementation layer.

## Recommended split

- OpenCode: edit code, run tests, fix bugs, commit, ship
- CAMEL: plan large features, split workstreams, research dependencies, review branches, generate QA/release checklists

## Installed locations

### Local Windows

- venv: `C:\Users\gamin.DESKTOP-Q0G3AKH\.venvs\camel`

### VM

- venv: `/root/venvs/camel`
- repo clone: `/opt/camel`

## OpenAI environment

Set these variables before using CAMEL.

### Windows PowerShell

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:DEFAULT_MODEL_PLATFORM_TYPE="openai"
$env:DEFAULT_MODEL_TYPE="gpt-4o-mini"
$env:CAMEL_MODEL_LOG_ENABLED="true"
$env:CAMEL_LOG_DIR="camel_logs"
```

### Linux / VM

```bash
export OPENAI_API_KEY="sk-..."
export DEFAULT_MODEL_PLATFORM_TYPE="openai"
export DEFAULT_MODEL_TYPE="gpt-4o-mini"
export CAMEL_MODEL_LOG_ENABLED=true
export CAMEL_LOG_DIR=camel_logs
```

## Local usage

```powershell
C:\Users\gamin.DESKTOP-Q0G3AKH\.venvs\camel\Scripts\Activate.ps1
python -c "import camel; print('CAMEL OK')"
```

## VM usage

```bash
source /root/venvs/camel/bin/activate
python -c "import camel; print('CAMEL OK')"
cd /opt/camel
```

## Good first commands

### Verify imports

```bash
python -c "from camel.agents import ChatAgent; print('imports ok')"
```

### Run example workflows on VM

```bash
cd /opt/camel
source /root/venvs/camel/bin/activate
python examples/ai_society/role_playing.py
python examples/workforce/multiple_single_agents.py
```

## Practical huge-app workflow

### 1. Planning with CAMEL

Use CAMEL to produce:

- `plan.md`
- `tasks.md`
- `risks.md`
- `qa-checklist.md`

Prompt pattern:

```text
You are the planning layer for a software project.
Break this feature into architecture, backend, frontend, infra, testing, and release tasks.
Identify dependencies, risks, and order of execution.
Output a concrete implementation plan.
```

### 2. Execution with OpenCode

Use OpenCode to implement each task from the plan.

### 3. Review with CAMEL

Ask CAMEL to review for:

- missing edge cases
- missing tests
- rollout risks
- docs/release notes

Prompt pattern:

```text
Review this implementation plan and branch output.
List missing edge cases, test gaps, production risks, and release notes.
```

## Recommended defaults

- model platform: `openai`
- model: `gpt-4o-mini` for planning/research
- heavier reasoning: switch to a stronger OpenAI model only when needed

## Fast mental model

- CAMEL decides what to do next
- OpenCode does the actual coding
