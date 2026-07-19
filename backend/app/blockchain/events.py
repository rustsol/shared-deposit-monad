"""Receipt decoding for transaction verification.

Decodes exactly two things, both against the real compiled ABI (never
hand-written): the events inside one transaction receipt, and the function
call encoded in one transaction's input data. There is no log scanning here -
the only inputs are a receipt or a transaction that the application already
holds by hash.

Decoded payloads are JSON-safe and exact: addresses are lowercase strings,
``bytes32`` values are 0x-hex strings, and every unsigned integer is a decimal
string so 128-bit wei amounts can never lose precision in JSON or JavaScript.
"""

from dataclasses import dataclass
from typing import Any, cast

from eth_typing import ABIEvent
from eth_utils.abi import event_abi_to_log_topic
from hexbytes import HexBytes
from web3 import Web3
from web3._utils.events import get_event_data

from app.blockchain.service import load_escrow_abi


@dataclass(frozen=True)
class DecodedEvent:
    """One decoded contract event, ready for a chain_events row."""

    event_name: str
    agreement_id: int | None
    claim_id: int | None
    payload: dict[str, Any]
    tx_hash: str
    log_index: int
    block_number: int
    block_hash: str
    contract_address: str


def _hex(value: Any) -> str:
    if isinstance(value, HexBytes | bytes):
        return "0x" + bytes(value).hex()
    return str(value)


def _json_safe(value: Any) -> Any:
    """Exact JSON encoding for a decoded ABI value."""
    if isinstance(value, list | tuple):
        return [_json_safe(item) for item in value]
    if isinstance(value, HexBytes | bytes):
        return _hex(value)
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        # All unsigned integers become decimal strings: uint128 wei amounts
        # exceed JavaScript's safe-integer range.
        return str(value)
    if isinstance(value, str):
        # The only string-typed ABI values in this contract are addresses.
        return value.lower() if value.startswith("0x") else value
    return value


class EventDecoder:
    """topic0 -> ABI decoder for every event in the escrow contract ABI."""

    def __init__(self) -> None:
        self._codec = Web3().codec  # offline ABI codec; no provider attached
        self._by_topic: dict[str, dict[str, Any]] = {}
        for entry in load_escrow_abi():
            if entry.get("type") == "event":
                topic = "0x" + event_abi_to_log_topic(cast("ABIEvent", entry)).hex()
                self._by_topic[topic] = entry

    @property
    def event_names(self) -> list[str]:
        return sorted(str(abi["name"]) for abi in self._by_topic.values())

    def decode(self, raw_log: dict[str, Any]) -> DecodedEvent | None:
        """Decodes one raw ``eth_getLogs`` entry.

        Returns None for logs whose topic0 is not an event of this contract's
        ABI. Accepts both live web3 log dicts (HexBytes values) and JSON
        fixtures (plain 0x strings / hex-encoded numbers).
        """
        topics = [HexBytes(topic) for topic in raw_log["topics"]]
        if not topics:
            return None
        event_abi = self._by_topic.get("0x" + topics[0].hex())
        if event_abi is None:
            return None

        normalized: dict[str, Any] = {
            "address": Web3.to_checksum_address(str(raw_log["address"])),
            "topics": topics,
            "data": HexBytes(raw_log["data"]),
            "blockNumber": _to_int(raw_log["blockNumber"]),
            "blockHash": HexBytes(raw_log["blockHash"]),
            "transactionHash": HexBytes(raw_log["transactionHash"]),
            "transactionIndex": _to_int(raw_log.get("transactionIndex", 0)),
            "logIndex": _to_int(raw_log["logIndex"]),
        }
        event = get_event_data(self._codec, cast("ABIEvent", event_abi), cast("Any", normalized))

        args: dict[str, Any] = dict(event["args"])
        payload = {key: _json_safe(value) for key, value in args.items()}
        agreement_id = args.get("agreementId")
        claim_id = args.get("claimId")
        return DecodedEvent(
            event_name=str(event["event"]),
            agreement_id=int(agreement_id) if agreement_id is not None else None,
            claim_id=int(claim_id) if claim_id is not None else None,
            payload=payload,
            tx_hash=_hex(normalized["transactionHash"]),
            log_index=int(normalized["logIndex"]),
            block_number=int(normalized["blockNumber"]),
            block_hash=_hex(normalized["blockHash"]),
            contract_address=str(raw_log["address"]).lower(),
        )


def _to_int(value: Any) -> int:
    if isinstance(value, str):
        return int(value, 16) if value.startswith("0x") else int(value)
    return int(value)


def decode_receipt_events(
    decoder: EventDecoder, receipt_logs: list[dict[str, Any]], contract_address: str
) -> list[dict[str, Any]]:
    """JSON-safe decoded events from ONE transaction receipt, restricted to
    the given contract. Logs from any other address are ignored, undecodable
    topics are skipped - nothing is ever invented."""
    contract = contract_address.lower()
    decoded: list[dict[str, Any]] = []
    for raw in receipt_logs:
        if str(raw.get("address", "")).lower() != contract:
            continue
        event = decoder.decode(raw)
        if event is None:
            continue
        decoded.append(
            {
                "event_name": event.event_name,
                "log_index": event.log_index,
                "payload": event.payload,
            }
        )
    return decoded


@dataclass(frozen=True)
class DecodedCall:
    """The function call encoded in a transaction's input data."""

    function_name: str
    args: dict[str, Any]
    agreement_id: int | None
    claim_id: int | None


_offline_contract: Any = None


def decode_function_input(input_hex: str) -> DecodedCall | None:
    """Decodes calldata against the real ABI. Returns None when the selector
    is not a function of this contract."""
    global _offline_contract
    if _offline_contract is None:
        _offline_contract = Web3().eth.contract(abi=load_escrow_abi())
    try:
        function, params = _offline_contract.decode_function_input(HexBytes(input_hex))
    except ValueError:
        return None
    args = {key: _json_safe(value) for key, value in dict(params).items()}
    raw_args = dict(params)
    agreement_id = raw_args.get("agreementId")
    claim_id = raw_args.get("claimId")
    return DecodedCall(
        function_name=str(function.fn_name),
        args=args,
        agreement_id=int(agreement_id) if agreement_id is not None else None,
        claim_id=int(claim_id) if claim_id is not None else None,
    )
