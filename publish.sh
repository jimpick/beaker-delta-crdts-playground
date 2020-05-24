#! /bin/bash

DEST=~/Hyperdrive/projects-jpimac/js-delta-crdts-experiments
rm -rf $DEST/web_modules 
cp -av package.json yarn.lock web_modules $DEST
