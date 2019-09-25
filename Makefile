SHELL := /bin/bash

.PHONY: all clean publish

all:
	pushd serialize-closures; tsc; popd
	pushd ts-closure-transform; tsc; popd

clean:
	rm -rf serialize-closures/dist
	rm -rf ts-closure-transform/dist
	rm -rf serialize-closures/src/*.js
	rm -rf ts-closure-transform/src/*.js

publish:
	pushd serialize-closures; npm version patch && npm publish; popd
	pushd ts-closure-transform; npm version patch && npm publish; popd

publish-prerelease:
	pushd serialize-closures; npm version prerelease --preid=next && npm publish; popd
	pushd ts-closure-transform; npm version prerelease --preid=next && npm publish; popd
