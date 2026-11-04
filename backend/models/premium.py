"""Premium subscription — MOCKED checkout (no real payment) until Stripe is added.
Mirrored in frontend/src/lib/types.ts."""

from typing import Literal

from pydantic import BaseModel, Field

PremiumPlan = Literal["monthly", "yearly"]


class PremiumPrice(BaseModel):
    plan: PremiumPlan
    label: str  # "£2.99 / month"
    amount: float
    currency: str = "GBP"


class PremiumState(BaseModel):
    active: bool
    plan: PremiumPlan | None = None
    since: str | None = None  # YYYY-MM-DD
    renewsOn: str | None = None  # YYYY-MM-DD (demo — nothing is charged)
    demo: bool = True  # checkout is a placeholder: no card is charged
    prices: list[PremiumPrice]
    freeBouquets: int = 2


class CheckoutIn(BaseModel):
    plan: PremiumPlan
    cardName: str = Field(min_length=1, max_length=80)
    cardLast4: str = Field(pattern=r"^\d{4}$")  # demo form only — the full number never leaves the browser
