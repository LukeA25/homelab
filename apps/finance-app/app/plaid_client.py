"""All Plaid SDK configuration and calls live here.

Nothing in this module is called on a plain page load. Plaid bills per API
call (Balance especially), so the only callers are the explicit /refresh and
the link/exchange flow.
"""

import os
from datetime import date

import plaid
from plaid.api import plaid_api
from plaid.api_client import ApiClient
from plaid.configuration import Configuration
from plaid.model.accounts_balance_get_request import AccountsBalanceGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import (
    ItemPublicTokenExchangeRequest,
)
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import (
    TransactionsGetRequestOptions,
)

PLAID_CLIENT_ID = os.environ["PLAID_CLIENT_ID"]
PLAID_SECRET = os.environ["PLAID_SECRET"]
PLAID_ENV = os.getenv("PLAID_ENV", "sandbox")

_PAGE_SIZE = 100


def _get_host():
    if PLAID_ENV == "sandbox":
        return plaid.Environment.Sandbox
    if PLAID_ENV == "production":
        return plaid.Environment.Production
    raise ValueError(f"Unsupported PLAID_ENV: {PLAID_ENV}")


_configuration = Configuration(
    host=_get_host(),
    api_key={"clientId": PLAID_CLIENT_ID, "secret": PLAID_SECRET},
)
client = plaid_api.PlaidApi(ApiClient(_configuration))


def create_link_token() -> dict:
    request = LinkTokenCreateRequest(
        products=[Products("transactions")],
        client_name="Homelab Finance App",
        country_codes=[CountryCode("US")],
        language="en",
        user=LinkTokenCreateRequestUser(client_user_id="landerson"),
    )
    return client.link_token_create(request).to_dict()


def exchange_public_token(public_token: str) -> dict:
    request = ItemPublicTokenExchangeRequest(public_token=public_token)
    return client.item_public_token_exchange(request).to_dict()


def get_balances(access_token: str) -> list[dict]:
    request = AccountsBalanceGetRequest(access_token=access_token)
    return client.accounts_balance_get(request).to_dict().get("accounts", [])


def get_transactions(
    access_token: str, start_date: date, end_date: date
) -> list[dict]:
    """Fetch every transaction in the window, paginating until complete."""
    all_txns: list[dict] = []
    offset = 0

    while True:
        request = TransactionsGetRequest(
            access_token=access_token,
            start_date=start_date,
            end_date=end_date,
            options=TransactionsGetRequestOptions(count=_PAGE_SIZE, offset=offset),
        )
        resp = client.transactions_get(request).to_dict()
        batch = resp.get("transactions", [])
        all_txns.extend(batch)

        total = resp.get("total_transactions", len(all_txns))
        offset += len(batch)
        if not batch or offset >= total:
            break

    return all_txns
