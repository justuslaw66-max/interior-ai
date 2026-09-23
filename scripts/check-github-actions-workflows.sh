#!/usr/bin/env bash

set -euo pipefail

readonly ACTIONLINT_VERSION="1.7.12"
readonly ACTIONLINT_RELEASE="v${ACTIONLINT_VERSION}"

actionlint_binary="${ACTIONLINT_BIN:-}"
temporary_directory=""

cleanup() {
  if [ -n "$temporary_directory" ]; then
    rm -rf "$temporary_directory"
  fi
}
trap cleanup EXIT

if [ -z "$actionlint_binary" ]; then
  operating_system="$(uname -s)"
  machine_architecture="$(uname -m)"

  case "$operating_system:$machine_architecture" in
    Darwin:arm64)
      archive_platform="darwin_arm64"
      expected_sha256="aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f"
      ;;
    Darwin:x86_64)
      archive_platform="darwin_amd64"
      expected_sha256="5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644"
      ;;
    Linux:aarch64 | Linux:arm64)
      archive_platform="linux_arm64"
      expected_sha256="325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6"
      ;;
    Linux:x86_64)
      archive_platform="linux_amd64"
      expected_sha256="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
      ;;
    *)
      echo "Unsupported actionlint platform: $operating_system $machine_architecture" >&2
      exit 1
      ;;
  esac

  temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/interior-ai-actionlint.XXXXXX")"
  archive_name="actionlint_${ACTIONLINT_VERSION}_${archive_platform}.tar.gz"
  archive_path="$temporary_directory/$archive_name"
  download_url="https://github.com/rhysd/actionlint/releases/download/${ACTIONLINT_RELEASE}/${archive_name}"

  curl --fail --location --silent --show-error --retry 3 "$download_url" --output "$archive_path"

  if command -v sha256sum >/dev/null 2>&1; then
    actual_sha256="$(sha256sum "$archive_path" | awk '{print $1}')"
  else
    actual_sha256="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
  fi

  if [ "$actual_sha256" != "$expected_sha256" ]; then
    echo "actionlint archive checksum mismatch" >&2
    exit 1
  fi

  tar -xzf "$archive_path" -C "$temporary_directory" actionlint
  actionlint_binary="$temporary_directory/actionlint"
fi

if [ ! -x "$actionlint_binary" ]; then
  echo "ACTIONLINT_BIN must identify an executable actionlint binary" >&2
  exit 1
fi

installed_version="$("$actionlint_binary" -version | sed -n '1p')"
if [ "$installed_version" != "$ACTIONLINT_VERSION" ]; then
  echo "Expected actionlint $ACTIONLINT_VERSION, found $installed_version" >&2
  exit 1
fi

workflow_files=()
while IFS= read -r -d '' workflow_file; do
  workflow_files+=("$workflow_file")
done < <(find .github/workflows -type f \( -name '*.yml' -o -name '*.yaml' \) -print0)

if [ "${#workflow_files[@]}" -eq 0 ]; then
  echo "No GitHub Actions workflow files found" >&2
  exit 1
fi

"$actionlint_binary" -shellcheck="" "${workflow_files[@]}"
