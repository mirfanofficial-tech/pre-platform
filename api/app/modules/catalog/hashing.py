import hashlib
import re


def question_hash(text: str, options: list[str]) -> str:
    """Stable fingerprint of a question, used to detect exact duplicates."""

    def norm(value: str) -> str:
        return re.sub(r"\s+", " ", value).strip().lower()

    payload = norm(text) + "\x1f" + "\x1f".join(norm(o) for o in options)
    return hashlib.sha256(payload.encode()).hexdigest()
