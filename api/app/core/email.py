import logging
from dataclasses import dataclass
from typing import Protocol

log = logging.getLogger("app.email")


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    body: str


class EmailSender(Protocol):
    async def send(self, email: Email) -> None: ...


# Development/test sender: logs the message and keeps it in memory.
OUTBOX: list[Email] = []


class ConsoleEmailSender:
    async def send(self, email: Email) -> None:
        OUTBOX.append(email)
        log.info("EMAIL to=%s subject=%s\n%s", email.to, email.subject, email.body)


def get_email_sender() -> EmailSender:
    # A real provider (Resend) is added when email delivery is set up.
    return ConsoleEmailSender()
