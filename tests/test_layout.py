"""Portfolio standard checks: the lock holds, required files exist, no public grade."""
import hashlib
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# SHA-256 of each locked file as committed in c484e54 (tag proposal-v1), before any experiment code.
LOCKED_SHA256 = {
    "SPEC.md": "1d26324cf3dab39489e57380b900cc3cdb21dea7abf3cff0e779f5d5ee4262bc",
    "HYPOTHESES.md": "91716cea81c5427642f2b4652bee446f91a7a82f3bc038cc5e252f59629f7c2d",
}
PUBLIC = ["README.md", "REPORT.md", "RESULTS.md", "METHODS.md", "DECISIONS.md", "RESEARCH.md",
          "CHANGELOG.md", "site/src/App.jsx"]
GRADE = re.compile(r"of 10,000|/ ?10,?000\b|Grade:|\bgrade\b|self-grade", re.IGNORECASE)


def test_proposal_is_unchanged_since_the_lock():
    for name, want in LOCKED_SHA256.items():
        with open(os.path.join(ROOT, name), "rb") as f:
            assert hashlib.sha256(f.read()).hexdigest() == want, \
                name + " changed after its lock; record an amendment in DECISIONS.md instead"


def test_required_files_exist():
    need = ["README.md", "SPEC.md", "HYPOTHESES.md", "METHODS.md", "REPORT.md", "RESULTS.md", "DECISIONS.md",
            "CHANGELOG.md", "CITATION.cff", "SECURITY.md", "LICENSE", "results/raw_main.json",
            "results/raw_fault.json", "results/SHA256SUMS"]
    missing = [p for p in need if not os.path.exists(os.path.join(ROOT, p))]
    assert not missing, "missing: " + ", ".join(missing)


def test_readme_opens_with_the_abstract():
    text = open(os.path.join(ROOT, "README.md"), encoding="utf-8").read()
    for field in ("**Question.**", "**Headline.**", "**Field.**", "**Job family.**", "**Verdict.**", "## Lifecycle"):
        assert field in text, "README.md lacks " + field


def test_no_public_grade():
    for name in PUBLIC:
        text = open(os.path.join(ROOT, name), encoding="utf-8").read()
        hit = GRADE.search(text)
        assert not hit, name + " carries a grade (" + hit.group(0) + "); grades are internal"
