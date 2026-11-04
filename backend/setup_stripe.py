"""Idempotent Stripe catalog for PUA Premium. Run: cd /app/backend && python setup_stripe.py"""
import os

import stripe
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"

CATALOG = [{
    "emergent_product_id": "pua_premium",
    "name": "PUA Premium",
    "tax_code": "txcd_10103001",  # SaaS
    "prices": [
        {"lookup_key": "pua_premium_monthly", "amount": 299, "currency": "gbp", "interval": "month"},
        {"lookup_key": "pua_premium_yearly", "amount": 2499, "currency": "gbp", "interval": "year"},
    ],
}]


def get_or_create_product(entry):
    for p in stripe.Product.list(active=True).auto_paging_iter():
        if p.to_dict().get("metadata", {}).get("emergent_product_id") == entry["emergent_product_id"]:
            return p
    return stripe.Product.create(name=entry["name"], tax_code=entry.get("tax_code"),
                                 metadata={"managed_by": "emergent", "emergent_product_id": entry["emergent_product_id"]})


def main():
    print("country:", stripe.Account.retrieve()["country"])
    for entry in CATALOG:
        product = get_or_create_product(entry)
        for p in entry["prices"]:
            existing = stripe.Price.list(lookup_keys=[p["lookup_key"]], active=True, limit=1).data
            if existing and (existing[0].unit_amount != p["amount"] or existing[0].currency != p["currency"]):
                stripe.Price.modify(existing[0].id, active=False)
                existing = []
            if not existing:
                stripe.Price.create(product=product.id, unit_amount=p["amount"], currency=p["currency"],
                                    lookup_key=p["lookup_key"], transfer_lookup_key=True,
                                    recurring={"interval": p["interval"]})
            print("price ok:", p["lookup_key"])


if __name__ == "__main__":
    main()
