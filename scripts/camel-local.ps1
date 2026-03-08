$env:DEFAULT_MODEL_PLATFORM_TYPE = "openai"
$env:DEFAULT_MODEL_TYPE = "gpt-4o-mini"
$env:CAMEL_MODEL_LOG_ENABLED = "true"
$env:CAMEL_LOG_DIR = "camel_logs"

& "$env:USERPROFILE\.venvs\camel\Scripts\Activate.ps1"
python -c "import camel; print('CAMEL ready on local machine')"
