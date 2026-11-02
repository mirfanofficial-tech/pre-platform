"""Import every model module so Alembic and Base.metadata see all tables."""

from app.modules.attempts import models as attempt_models  # noqa: F401
from app.modules.billing import models as billing_models  # noqa: F401
from app.modules.catalog import models as catalog_models  # noqa: F401
from app.modules.study import models as study_models  # noqa: F401
from app.modules.users import models as user_models  # noqa: F401
