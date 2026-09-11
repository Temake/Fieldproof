# FieldProof - development tasks
.PHONY: install api web seed seed-all demo test fixtures lint validate deploy clean

install:            ## install python + node dependencies
	pip install -e ".[dev]"
	cd apps/web && npm install

api:                ## run the API on :8000
	uvicorn fieldproof_api.main:app --reload --port 8000 $(if $(wildcard .env),--env-file .env,)

web:                ## run the web client on :3000
	cd apps/web && npm run dev

seed:               ## seed the hero job, paused at the supervisor decision
	python scripts/seed.py --reset

seed-all:           ## seed every fixture plus the hero job
	python scripts/seed.py --reset --all

demo:               ## run the whole PRD 42 demo headless
	python -m demo.run_demo

test:               ## run the invariant and scenario suites
	python -m pytest -q

fixtures:           ## regenerate the evaluation dataset
	python scripts/generate_fixtures.py

lint:
	ruff check .
	cd apps/web && npm run typecheck

validate:           ## lint the SAM template
	python -c "import sys; from cfnlint.runner import main; sys.argv=['cfn-lint','infra/aws/template.yaml']; main()"

deploy:             ## build and deploy the backend to AWS (needs the SAM CLI)
	cd infra/aws && sam build && sam deploy --guided

# Called by `sam build` (BuildMethod: makefile) with ARTIFACTS_DIR set.
# Wheels are fetched for the Lambda platform, not the build machine.
build-ApiFunction build-WorkflowFunction:
	python -m pip wheel --no-deps --wheel-dir .lambda-build .
	python -m pip install --target "$(ARTIFACTS_DIR)" --platform manylinux2014_x86_64 --implementation cp --python-version 3.12 --only-binary=:all: .lambda-build/*.whl "mangum>=0.17" "strands-agents>=1.0" "boto3>=1.34"
	rm -rf .lambda-build

clean:
	rm -rf .fieldproof-data .pytest_cache .ruff_cache .lambda-build .aws-sam
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
