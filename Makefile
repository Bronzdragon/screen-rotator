#!make

.DEFAULT_GOAL := default

EXT_UUID := $(shell cat src/metadata.json | node_modules/.bin/json uuid)

default: install build deploy

install:
	@yarn install

build:
	@yarn tsc

deploy:
	mkdir -p $(HOME)/.local/share/gnome-shell/extensions/$(EXT_UUID)
	cp target/* $(HOME)/.local/share/gnome-shell/extensions/$(EXT_UUID)
	cp src/metadata.json $(HOME)/.local/share/gnome-shell/extensions/$(EXT_UUID)

release: install build
	mkdir release
	zip release/release src/metadata.json target/*
