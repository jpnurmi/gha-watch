NPM ?= npm

.PHONY: help deps dev typecheck test check web-build build tauri-build clean

help:
	@printf '%s\n' \
		'Targets:' \
		'  deps         Install npm dependencies' \
		'  dev          Run the Vite development server' \
		'  typecheck    Run TypeScript type checks' \
		'  test         Run the test suite once' \
		'  check        Run typecheck and test' \
		'  web-build    Build the web UI' \
		'  build        Build the release app bundle' \
		'  clean        Remove generated build output'

deps:
	$(NPM) install

node_modules:
	$(MAKE) deps

dev:
	$(NPM) run dev

typecheck:
	$(NPM) run typecheck

test:
	$(NPM) test -- --run

check: typecheck test

web-build:
	$(NPM) run build

build: | node_modules
	@set -eu; \
	case "$$(uname -s)" in \
		Linux*) \
			$(NPM) run tauri -- build --config src-tauri/tauri.linux.conf.json --bundles deb; \
			deb=''; \
			for candidate in "$(CURDIR)"/src-tauri/target/release/bundle/deb/*.deb; do \
				if [ -f "$$candidate" ]; then deb=$$candidate; break; fi; \
			done; \
			if [ -z "$$deb" ]; then \
				printf '%s\n' 'Missing Linux .deb package under src-tauri/target/release/bundle/deb/' >&2; \
				exit 1; \
			fi; \
			printf '\033[1;32m%s\033[0m %s \033[1;33m%s\033[0m:\n%s\n' \
				'    Install' \
				'and' \
				'restart' \
				"        pkill -x gha-watch || true; sudo dpkg -i '$$deb' && (nohup gha-watch >/dev/null 2>&1 &)"; \
			;; \
		MINGW*|MSYS*|CYGWIN*) \
			$(NPM) run tauri -- build --config src-tauri/tauri.windows.conf.json; \
			installer=''; \
			for candidate in "$(CURDIR)"/src-tauri/target/release/bundle/nsis/*.exe; do \
				if [ -f "$$candidate" ]; then installer=$$candidate; break; fi; \
			done; \
			if [ -z "$$installer" ]; then \
				printf '%s\n' 'Missing Windows NSIS installer under src-tauri/target/release/bundle/nsis/' >&2; \
				exit 1; \
			fi; \
			printf '\033[1;32m%s\033[0m %s \033[1;33m%s\033[0m:\n%s\n' \
				'    Install' \
				'and' \
				'restart' \
				"        MSYS_NO_PATHCONV=1 '$$installer' /S /R"; \
			;; \
		*) \
			$(NPM) run tauri build; \
			printf '\033[1;32m%s\033[0m %s \033[1;33m%s\033[0m:\n%s\n' \
				'    Install' \
				'and' \
				'restart' \
				'        pkill -x gha-watch || true; ditto "$(CURDIR)/src-tauri/target/release/bundle/macos/GHA Watch.app" ~/Applications/"GHA Watch.app" && open ~/Applications/"GHA Watch.app"'; \
			;; \
	esac

tauri-build: build

clean:
	rm -rf dist src-tauri/target
