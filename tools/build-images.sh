#!/bin/sh
set -eu

if [ "$#" -gt 2 ]; then
  echo "Usage: $0 [image-prefix [tag]]" >&2
  exit 2
fi

image_prefix=${1:-${PEERWEAVE_IMAGE_PREFIX:-peerweave-example}}
image_tag=${2:-${PEERWEAVE_IMAGE_TAG:-local}}
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

for target in web signaling; do
  docker build --pull \
    --file "$repo_root/Dockerfile" \
    --target "$target" \
    --tag "$image_prefix-$target:$image_tag" \
    "$repo_root"
done

printf '\nBuilt %s-web:%s and %s-signaling:%s\n' \
  "$image_prefix" "$image_tag" "$image_prefix" "$image_tag"
