"""TEST-ONLY deterministic wallets.

These private keys are publicly known constants used exclusively by the test
suite to produce real secp256k1 signatures for verification tests. They are
never loaded by application runtime code, never funded, never used on any
network, and must never appear in .env files or application configuration.
"""

from eth_account import Account
from eth_account.messages import encode_defunct

# Trivial, well-known test constants — not secrets.
TEST_KEY_A = "0x" + "01" * 32
TEST_KEY_B = "0x" + "02" * 32
TEST_KEY_C = "0x" + "03" * 32

WALLET_A = Account.from_key(TEST_KEY_A).address.lower()
WALLET_B = Account.from_key(TEST_KEY_B).address.lower()
WALLET_C = Account.from_key(TEST_KEY_C).address.lower()

KEY_FOR = {WALLET_A: TEST_KEY_A, WALLET_B: TEST_KEY_B, WALLET_C: TEST_KEY_C}


def sign_message(message: str, private_key: str) -> str:
    """Personal-sign (EIP-191) signature of a text message, 0x-prefixed."""
    signed = Account.sign_message(encode_defunct(text=message), private_key=private_key)
    signature = signed.signature.hex()
    return signature if signature.startswith("0x") else "0x" + signature
