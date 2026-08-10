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

dev:
	$(NPM) run dev

typecheck:
	$(NPM) run typecheck

test:
	$(NPM) test -- --run

check: typecheck test

web-build:
	$(NPM) run build

build:
	@set -eu; \
	case "$$(uname -s)" in \
		Linux*) \
			$(NPM) run tauri -- build --config src-tauri/tauri.linux.conf.json --bundles deb; \
			;; \
		MINGW*|MSYS*|CYGWIN*) \
			$(NPM) run tauri -- build --config src-tauri/tauri.windows.conf.json; \
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
