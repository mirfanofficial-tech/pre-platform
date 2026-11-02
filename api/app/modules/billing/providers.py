"""Payment gateways behind one interface.

`FakeProvider` is for development and tests only. `JazzCashProvider` implements JazzCash's
hosted-page redirect ("Page Redirection") integration with the HMAC-SHA256 `pp_SecureHash`.
It follows JazzCash's published scheme but has not been exercised against their sandbox yet:
verify it with real merchant credentials before going live (see docs/RUNBOOK.md).
"""

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone
from typing import Any, Protocol

from app.config import Settings

PKT = timezone(timedelta(hours=5))  # Pakistan has no daylight saving time


class InvalidSignature(Exception):
    pass


@dataclass
class CheckoutRequest:
    method: str  # "POST" (auto-submitted form) or "GET"
    action_url: str
    fields: dict[str, str]


@dataclass
class Notification:
    ref: str
    amount_paisa: int
    success: bool
    event_id: str
    payload: dict[str, str]


class PaymentProvider(Protocol):
    name: str

    def new_ref(self) -> str: ...

    def build_request(
        self, *, ref: str, amount_paisa: int, description: str
    ) -> CheckoutRequest: ...

    def parse_notification(self, data: dict[str, str]) -> Notification: ...


def _sign(key: str, message: str) -> str:
    return hmac.new(key.encode(), message.encode(), hashlib.sha256).hexdigest().upper()


# ---- JazzCash -----------------------------------------------------------------


class JazzCashProvider:
    name = "jazzcash"

    def __init__(self, settings: Settings) -> None:
        self.s = settings

    def new_ref(self) -> str:
        # pp_TxnRefNo is limited to 20 characters.
        return f"T{datetime.now(PKT):%Y%m%d%H%M%S}{secrets.randbelow(100000):05d}"

    def _hash(self, fields: dict[str, str]) -> str:
        salt = self.s.jazzcash_integrity_salt
        parts = [v for k, v in sorted(fields.items()) if v != "" and k != "pp_SecureHash"]
        return _sign(salt, "&".join([salt, *parts]))

    def build_request(self, *, ref: str, amount_paisa: int, description: str) -> CheckoutRequest:
        now = datetime.now(PKT)
        fields = {
            "pp_Version": "1.1",
            "pp_TxnType": "",
            "pp_Language": "EN",
            "pp_MerchantID": self.s.jazzcash_merchant_id,
            "pp_SubMerchantID": "",
            "pp_Password": self.s.jazzcash_password,
            "pp_BankID": "TBANK",
            "pp_ProductID": "RETL",
            "pp_TxnRefNo": ref,
            "pp_Amount": str(amount_paisa),
            "pp_TxnCurrency": "PKR",
            "pp_TxnDateTime": f"{now:%Y%m%d%H%M%S}",
            "pp_BillReference": "prepmaster",
            "pp_Description": description[:100],
            "pp_TxnExpiryDateTime": f"{now + timedelta(hours=1):%Y%m%d%H%M%S}",
            "pp_ReturnURL": f"{self.s.api_base_url}/api/v1/billing/webhooks/jazzcash",
            "ppmpf_1": "1",
            "ppmpf_2": "2",
            "ppmpf_3": "3",
            "ppmpf_4": "4",
            "ppmpf_5": "5",
        }
        fields["pp_SecureHash"] = self._hash(fields)
        return CheckoutRequest("POST", self.s.jazzcash_endpoint, fields)

    def parse_notification(self, data: dict[str, str]) -> Notification:
        received = data.get("pp_SecureHash", "")
        signed = {k: v for k, v in data.items() if k.startswith(("pp_", "ppmpf_"))}
        if not received or not hmac.compare_digest(received.upper(), self._hash(signed)):
            raise InvalidSignature("JazzCash signature mismatch")
        try:
            amount = int(data["pp_Amount"])
            ref = data["pp_TxnRefNo"]
        except (KeyError, ValueError) as exc:
            raise InvalidSignature("JazzCash notification is missing fields") from exc
        code = data.get("pp_ResponseCode", "")
        return Notification(
            ref=ref,
            amount_paisa=amount,
            success=code == "000",
            event_id=f"{ref}:{code}",
            payload={k: v for k, v in signed.items() if k != "pp_Password"},
        )


# ---- local test gateway ---------------------------------------------------------


class FakeProvider:
    name = "fake"

    def __init__(self, settings: Settings) -> None:
        self.s = settings

    def new_ref(self) -> str:
        return f"F{datetime.now(UTC):%Y%m%d%H%M%S}{secrets.randbelow(100000):05d}"

    def sign(self, ref: str, amount_paisa: int, outcome: str) -> str:
        return _sign(self.s.fake_gateway_secret, f"{ref}|{amount_paisa}|{outcome}")

    def build_request(self, *, ref: str, amount_paisa: int, description: str) -> CheckoutRequest:
        return CheckoutRequest("GET", f"{self.s.web_base_url}/checkout/test-gateway", {"ref": ref})

    def notification(self, ref: str, amount_paisa: int, outcome: str) -> dict[str, str]:
        return {
            "ref": ref,
            "amount": str(amount_paisa),
            "outcome": outcome,
            "signature": self.sign(ref, amount_paisa, outcome),
        }

    def parse_notification(self, data: dict[str, Any]) -> Notification:
        try:
            ref, amount, outcome = data["ref"], int(data["amount"]), data["outcome"]
        except (KeyError, ValueError) as exc:
            raise InvalidSignature("Malformed notification") from exc
        expected = self.sign(ref, amount, outcome)
        if not hmac.compare_digest(str(data.get("signature", "")), expected):
            raise InvalidSignature("Bad signature")
        return Notification(
            ref=ref,
            amount_paisa=amount,
            success=outcome == "success",
            event_id=f"{ref}:{outcome}",
            payload={k: str(v) for k, v in data.items() if k != "signature"},
        )


def get_provider(settings: Settings) -> PaymentProvider:
    if settings.payment_provider == "jazzcash":
        return JazzCashProvider(settings)
    return FakeProvider(settings)
