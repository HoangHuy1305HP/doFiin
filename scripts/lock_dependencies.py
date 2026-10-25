"""Snapshot installed runtime/dev dependency versions for repeatable team setup."""

from importlib.metadata import distribution, version
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

root = Path(__file__).resolve().parents[1]
packages = set()
visited = set()


def visit(spec):
    req = Requirement(spec)
    name = canonicalize_name(req.name)
    extras = set(req.extras) | {""}
    key = (name, tuple(sorted(extras)))
    if key in visited:
        return
    visited.add(key)
    packages.add(name)
    for child in distribution(name).requires or []:
        dependency = Requirement(child)
        # Evaluate markers separately for every requested extra on this platform.
        if dependency.marker is None or any(
            dependency.marker.evaluate({"extra": extra}) for extra in extras
        ):
            visit(str(dependency))


import tomllib  # noqa: E402

project = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))["project"]
for requirement in project["dependencies"]:
    visit(requirement)
runtime = sorted(packages)
(root / "requirements.lock").write_text(
    "# Runtime versions verified on Python 3.12.\n"
    + "\n".join(f"{name}=={version(name)}" for name in runtime)
    + "\n",
    encoding="utf-8",
)
for requirement in project["optional-dependencies"]["dev"]:
    visit(requirement)
(root / "requirements-dev.lock").write_text(
    "-r requirements.lock\n"
    + "\n".join(f"{name}=={version(name)}" for name in sorted(packages - set(runtime)))
    + "\n",
    encoding="utf-8",
)
print(f"Locked {len(runtime)} runtime and {len(packages) - len(runtime)} dev packages.")
