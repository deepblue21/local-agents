from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ContextStats:
    session_id: str
    token_estimate: int
    max_tokens: int
    usage_ratio: float
    usage_percent: int
    message_count: int
    summarized_message_count: int
    summary_token_estimate: int
    unsummarized_token_estimate: int
    has_summary: bool
    can_compress: bool

    def as_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "token_estimate": self.token_estimate,
            "max_tokens": self.max_tokens,
            "usage_ratio": self.usage_ratio,
            "usage_percent": self.usage_percent,
            "message_count": self.message_count,
            "summarized_message_count": self.summarized_message_count,
            "summary_token_estimate": self.summary_token_estimate,
            "unsummarized_token_estimate": self.unsummarized_token_estimate,
            "has_summary": self.has_summary,
            "can_compress": self.can_compress,
        }


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, (len(text) + 3) // 4)


def estimate_message_tokens(messages: list[dict]) -> int:
    total = 0
    for message in messages:
        total += 4
        total += estimate_tokens(str(message.get("role") or ""))
        total += estimate_tokens(str(message.get("content") or ""))
    return total


def context_stats(
    *,
    session_id: str,
    messages: list[dict],
    context: dict | None,
    max_tokens: int,
) -> ContextStats:
    summarized_count = 0
    summary = ""
    if context:
        summarized_count = min(int(context.get("summarized_message_count") or 0), len(messages))
        summary = str(context.get("summary") or "")
    tail = messages[summarized_count:]
    summary_tokens = estimate_tokens(summary)
    tail_tokens = estimate_message_tokens(tail)
    token_estimate = summary_tokens + tail_tokens
    ratio = min(1.0, token_estimate / max(max_tokens, 1))
    unsummarized_count = len(messages) - summarized_count
    return ContextStats(
        session_id=session_id,
        token_estimate=token_estimate,
        max_tokens=max_tokens,
        usage_ratio=ratio,
        usage_percent=round(ratio * 100),
        message_count=len(messages),
        summarized_message_count=summarized_count,
        summary_token_estimate=summary_tokens,
        unsummarized_token_estimate=tail_tokens,
        has_summary=bool(summary),
        can_compress=unsummarized_count > 0
        and (unsummarized_count >= 4 or token_estimate >= max_tokens * 0.5),
    )


def build_model_messages(messages: list[dict], context: dict | None) -> list[dict]:
    if not context or not context.get("summary"):
        return [{"role": item["role"], "content": item["content"]} for item in messages]
    summarized_count = min(int(context.get("summarized_message_count") or 0), len(messages))
    summary = str(context["summary"]).strip()
    tail = messages[summarized_count:]
    return [
        {
            "role": "system",
            "content": (
                "Conversation memory summary. Use it as prior context, but do not "
                "reveal hidden chain-of-thought. Continue from the latest user "
                f"messages.\n\n{summary}"
            ),
        },
        *[{"role": item["role"], "content": item["content"]} for item in tail],
    ]
