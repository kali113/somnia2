#!/usr/bin/env bash
set -euo pipefail

export DEFAULT_MODEL_PLATFORM_TYPE="openai"
export DEFAULT_MODEL_TYPE="gpt-4o-mini"
export CAMEL_MODEL_LOG_ENABLED="true"
export CAMEL_LOG_DIR="camel_logs"

source /root/venvs/camel/bin/activate
python -c "import camel; print('CAMEL ready on VM')"
