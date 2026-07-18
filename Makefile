NPM ?= npm
MACOS_APP_DIR ?= $(HOME)/Applications

.PHONY: help deps dev typecheck test check web-build build tauri-build install clean

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
		'  install      Build and install the app for this platform' \
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
			$(NPM) run tauri -- build --config src-tauri/tauri.linux.conf.json; \
			;; \
		MINGW*|MSYS*|CYGWIN*) \
			$(NPM) run tauri -- build --config src-tauri/tauri.windows.conf.json; \
			;; \
		*) \
			$(NPM) run tauri build; \
			;; \
	esac

tauri-build: build

install: build
	@set -eu; \
	case "$$(uname -s)" in \
		Darwin*) \
			app='src-tauri/target/release/bundle/macos/GHA Watch.app'; \
			if [ ! -d "$$app" ]; then \
				printf '%s\n' "Missing macOS app bundle: $$app" >&2; \
				exit 1; \
			fi; \
			mkdir -p "$(MACOS_APP_DIR)"; \
			rm -rf "$(MACOS_APP_DIR)/GHA Watch.app"; \
			cp -R "$$app" "$(MACOS_APP_DIR)/"; \
			printf '%s\n' "Installed GHA Watch to $(MACOS_APP_DIR)"; \
			;; \
		Linux*) \
			deb=''; \
			for candidate in src-tauri/target/release/bundle/deb/*.deb; do \
				if [ -f "$$candidate" ]; then deb=$$candidate; break; fi; \
			done; \
			if [ -z "$$deb" ]; then \
				printf '%s\n' 'Missing Linux .deb package under src-tauri/target/release/bundle/deb/' >&2; \
				exit 1; \
			fi; \
			if command -v apt >/dev/null 2>&1; then \
				sudo apt install "$$deb"; \
			elif command -v apt-get >/dev/null 2>&1; then \
				sudo apt-get install "$$deb"; \
			elif command -v dpkg >/dev/null 2>&1; then \
				sudo dpkg -i "$$deb"; \
			else \
				printf '%s\n' 'No apt, apt-get, or dpkg command found for installing the .deb package.' >&2; \
				exit 1; \
			fi; \
			;; \
		MINGW*|MSYS*|CYGWIN*) \
			installer=''; \
			for candidate in src-tauri/target/release/bundle/nsis/*.exe src-tauri/target/release/bundle/msi/*.msi; do \
				if [ -f "$$candidate" ]; then installer=$$candidate; break; fi; \
			done; \
			if [ -z "$$installer" ]; then \
				printf '%s\n' 'Missing Windows installer under src-tauri/target/release/bundle/nsis/ or src-tauri/target/release/bundle/msi/' >&2; \
				exit 1; \
			fi; \
			case "$$installer" in \
				*.msi) \
					msiexec.exe /i "$$(cygpath -w "$$installer")"; \
					;; \
				*) \
					"$$installer"; \
					;; \
			esac; \
			;; \
		*) \
			printf '%s\n' 'Unsupported platform for make install.' >&2; \
			exit 1; \
			;; \
	esac

clean:
	rm -rf dist src-tauri/target
