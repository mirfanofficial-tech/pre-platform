import subprocess
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]


def run_fresh(code: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", code], cwd=API_ROOT, capture_output=True, text=True, check=False
    )


def test_scripts_register_every_table_in_a_fresh_process() -> None:
    """Regression: the seed script only imports catalogue models, but `questions` has
    foreign keys to `users`. Creating the engine must register all tables, otherwise the
    first flush fails with NoReferencedTableError."""
    result = run_fresh(
        "import app.scripts.seed\n"
        "from app.db.base import Base\n"
        "from app.db.session import get_engine\n"
        "get_engine()\n"
        "need = {'users', 'sessions', 'email_tokens', 'audit_log', 'questions'}\n"
        "missing = need - set(Base.metadata.tables)\n"
        "assert not missing, missing\n"
        "print('ok')\n"
    )
    assert result.returncode == 0, result.stderr
    assert "ok" in result.stdout
