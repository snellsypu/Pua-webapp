"""Premium subscription (Stripe, test mode) — mirrored in frontend/src/lib/types.ts."""

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
    renewsOn: str | None = None  # YYYY-MM-DD
    demo: bool = False
    testMode: bool = True  # Stripe test mode: test cards only until the sandbox is claimed
    prices: list[PremiumPrice]
    freeBouquets: int = 1
    freeGroupSize: int = 6


class CheckoutIn(BaseModel):
    plan: PremiumPlan
    origin_url: str = Field(min_length=8, max_length=300)


class CheckoutOut(BaseModel):
    checkout_url: str
    session_id: str


class PaymentStatus(BaseModel):
    session_id: str
    status: str
    payment_status: str
