.PHONY: help web-deps web-start web-start-with-server web-build web-preview web-lint web-typecheck web-clean \
	server-deps server-start server-build server-test server-lint server-typecheck server-clean test

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-26s %s\n", $$1, $$2}'

web-deps: ## Install web dependencies
	cd web && npm install

web-start: ## Run the web dev server with the built-in API mock (no server/ needed)
	cd web && npm run dev

web-start-with-server: ## Run the web dev server proxying /api to the real service on :4000
	cd web && VITE_API_MOCK=0 npm run dev

web-build: ## Build the web production bundle into web/dist/
	cd web && npm run build

web-preview: ## Serve the built web bundle locally
	cd web && npm run preview

web-lint: ## Run ESLint on web
	cd web && npm run lint

web-typecheck: ## Run TypeScript type-check on web
	cd web && npm run typecheck

web-clean: ## Remove web build output and node_modules
	cd web && rm -rf node_modules dist tsconfig.tsbuildinfo

server-deps: ## Install server dependencies
	cd server && npm install

server-start: ## Run the service in watch mode (reads env vars; see server/.env.example)
	cd server && npm run dev

server-build: ## Compile the service to server/dist/
	cd server && npm run build

server-test: ## Run the service test suite (vitest + nock; no Avni needed)
	cd server && npm test

server-lint: ## Run ESLint on server
	cd server && npm run lint

server-typecheck: ## Run TypeScript type-check on server
	cd server && npm run typecheck

server-clean: ## Remove server build output and node_modules
	cd server && rm -rf node_modules dist

test: web-typecheck web-build server-typecheck server-test server-build ## Everything CI runs
