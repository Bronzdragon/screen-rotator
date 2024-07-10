#!make

.DEFAULT_GOAL := default

EXT_UUID := $(shell cat src/metadata.json | node_modules/.bin/json uuid)

default: install build deploy

install:
	@yarn install

build:
	@yarn tsc
	cp src/metadata.json target

deploy:
	mkdir -p $(HOME)/.local/share/gnome-shell/extensions/$(EXT_UUID)
	cp target/* $(HOME)/.local/share/gnome-shell/extensions/$(EXT_UUID)
	cp src/metadata.json $(HOME)/.local/share/gnome-shell/extensions/$(EXT_UUID)

release: install build
	rm -rf release
	cd target; zip -r $(EXT_UUID).zip .
	mkdir release
	mv target/$(EXT_UUID).zip release/$(EXT_UUID).zip

clean:
	rm -rf target
	rm -rf release
