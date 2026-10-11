set shell := ["bash", "-euo", "pipefail", "-c"]

configure:
    git submodule update --init external/toolkit
    mise exec -- npm ci --ignore-scripts

build:
    mise exec -- npm run build

check:
    mise exec -- npm run check-all

release:
    mise exec -- npm run release
