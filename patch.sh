#! /bin/sh

cd node_modules

for patch in ../patches/*.diff; do
  echo $patch
  cat $patch | patch -p1
done
