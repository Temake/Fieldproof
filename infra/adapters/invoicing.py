"""Invoice provider (PRD FR-14). Simulated for the MVP (PRD 39).

The simulation is deliberately honest about idempotency: submitting the same
key twice returns the first invoice, which is how a real provider such as
Stripe or QuickBooks behaves and what prevents duplicate invoices (PRD 33).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from domain.ids import new_id


class InvoiceProviderError(RuntimeError):
    pass


@dataclass
class SimulatedInvoiceProvider:
    submitted: dict[str, dict[str, Any]] = field(default_factory=dict)
    fail_next: int = 0
    """Test hook: fail this many upcoming submissions (PRD 36 failure path)."""

    def submit(self, payload: dict[str, Any], idempotency_key: str) -> dict[str, Any]:
        if idempotency_key in self.submitted:
            return self.submitted[idempotency_key]
        if self.fail_next > 0:
            self.fail_next -= 1
            raise InvoiceProviderError("invoice provider unavailable")
        invoice = {"invoice_id": new_id("INV"), "status": "submitted", **payload}
        self.submitted[idempotency_key] = invoice
        return invoice
