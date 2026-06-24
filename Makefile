# Local dev orchestration across the two package-manager domains:
#   application/   — pnpm workspace (web-app, functions, shared)
#   infrastructure/ — npm island (AWS CDK)
# See docs/guides/local-development.md.

SHELL := bash
.ONESHELL:
.SHELLFLAGS := -euo pipefail -c
.DEFAULT_GOAL := help

ROOT := $(shell pwd)
COMPOSE := docker compose
ENDPOINT := http://localhost:4566
AWS := aws --endpoint-url=$(ENDPOINT)
STACK := ApplicationStack
# `make dev` mirrors the dev server's output here (truncated each run). Gitignored
# via *.log; tail it to inspect SSR/action/middleware errors.
DEV_LOG := $(ROOT)/dev.log

# Load LocalStack env (dummy creds + region + endpoint) into a recipe.
define load_env
set -a; source $(ROOT)/.env.localstack; set +a
endef

.PHONY: help up down build deploy redeploy sync-static dev seed destroy endpoints

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  %-12s %s\n", $$1, $$2}'

up: build ## Build assets, start LocalStack + nginx edge, bootstrap cdklocal
	# `cdklocal bootstrap` synthesizes the app, which validates fromAsset paths — so build first.
	$(load_env)
	$(COMPOSE) up -d localstack nginx
	echo "waiting for LocalStack to be ready..."
	until curl -sf $(ENDPOINT)/_localstack/health >/dev/null; do sleep 1; done
	cd infrastructure && npm run bootstrap:local

down: ## Stop containers, clear LocalStack state
	$(COMPOSE) down -v

build: ## Install deps and build the SSR Lambda + function bundles
	# .ONESHELL: one cd holds for the whole recipe.
	cd application
	corepack pnpm install
	# Local-only: relax Astro's origin check in the deployed Lambda bundle (the
	# LocalStack API Gateway front can't preserve the client Host). Real-AWS
	# builds omit this, keeping the check on. See application/web-app/astro.config.mjs.
	ASTRO_LOCAL_EDGE=true corepack pnpm --filter web-app run build:ssr
	corepack pnpm run bundle:functions

deploy: build ## Deploy the stack to LocalStack, sync static assets
	# Subshell so the `cd` doesn't leak into the next line under .ONESHELL.
	( $(load_env); cd infrastructure && npm run deploy:local )
	$(MAKE) sync-static
	echo "staged -> http://staged.timetracker.test (needs /etc/hosts + 'make up' nginx)"

redeploy: deploy ## Rebuild and redeploy
	echo "redeploy complete"

sync-static: ## Upload built static assets to the local S3 bucket (BucketDeployment is AWS-only)
	$(load_env)
	BUCKET=$$(aws cloudformation describe-stacks --stack-name $(STACK) \
	  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
	# Cache-Control is stored as object metadata and passed through by API Gateway
	# (see api-front.ts / ADR 0010). Unhashed files revalidate; hashed _astro/* is
	# immutable. Pass 1 prunes stale objects (--delete) but leaves _astro untouched
	# (excluded); pass 2 prunes old hashes within _astro only.
	aws s3 sync $(ROOT)/application/web-app/dist/client s3://$$BUCKET --delete \
	  --exclude '_astro/*' --cache-control 'no-cache' >/dev/null
	# Hashed _astro/* assets are immutable. Sync them (scoped --delete prunes old
	# hashes) when present; otherwise (e.g. CSS inlined into HTML) clear the prefix.
	if [ -d $(ROOT)/application/web-app/dist/client/_astro ]; then \
	  aws s3 sync $(ROOT)/application/web-app/dist/client/_astro s3://$$BUCKET/_astro --delete \
	    --cache-control 'public, max-age=31536000, immutable' >/dev/null; \
	else \
	  aws s3 rm s3://$$BUCKET/_astro --recursive >/dev/null 2>&1 || true; \
	fi
	echo "static synced -> s3://$$BUCKET"

dev: up build ## Fast loop: deploy once, then astro HMR dev server (Ctrl-C to stop)
	( $(load_env); cd infrastructure && npm run deploy:local )
	$(MAKE) sync-static
	$(MAKE) seed
	echo "dev server -> http://live.timetracker.test — Ctrl-C to stop"
	echo "logs -> $(DEV_LOG)"
	$(load_env)
	export USER_TABLE_NAME=$$(aws cloudformation describe-stacks --stack-name $(STACK) \
	  --query "Stacks[0].Outputs[?OutputKey=='UserTableName'].OutputValue" --output text)
	export TIME_RECORD_TABLE_NAME=$$(aws cloudformation describe-stacks --stack-name $(STACK) \
	  --query "Stacks[0].Outputs[?OutputKey=='TimeRecordTableName'].OutputValue" --output text)
	export JWT_SECRET_ARN=$$(aws cloudformation describe-stacks --stack-name $(STACK) \
	  --query "Stacks[0].Outputs[?OutputKey=='JwtSecretArn'].OutputValue" --output text)
	# ASTRO_LOCAL_EDGE makes astro.config bind 0.0.0.0 so the nginx edge can reach
	# the dev server via host-gateway (and relaxes the origin check, as in build).
	cd application && ASTRO_LOCAL_EDGE=true corepack pnpm --filter web-app run dev 2>&1 | tee $(DEV_LOG)

seed: ## Seed a user into the user table (SEED_EMAIL/SEED_NAME/SEED_PASSWORD to override)
	$(load_env)
	export USER_TABLE_NAME=$$(aws cloudformation describe-stacks --stack-name $(STACK) \
	  --query "Stacks[0].Outputs[?OutputKey=='UserTableName'].OutputValue" --output text)
	cd application && corepack pnpm exec esbuild scripts/seed-user.ts \
	  --bundle --platform=node --format=cjs --tsconfig=tsconfig.base.json \
	  | node --input-type=commonjs

destroy: ## Tear down the stack in LocalStack
	$(load_env); cd infrastructure && npm run destroy:local

endpoints: ## Print the deployed stack outputs (SSR URL, UserTable, Bucket)
	$(load_env); aws cloudformation describe-stacks --stack-name $(STACK) \
	  --query "Stacks[0].Outputs[].{Key:OutputKey,Value:OutputValue}" --output table
