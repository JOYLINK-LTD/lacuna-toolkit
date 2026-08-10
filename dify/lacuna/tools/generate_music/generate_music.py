from collections.abc import Generator
from typing import Any

from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from tools.utils.lacuna_client import (
    LacunaClient,
    LacunaError,
    build_generate_payload,
    summarize_tracks,
)

MIN_TIMEOUT_SECONDS = 60
MAX_TIMEOUT_SECONDS = 900
DEFAULT_TIMEOUT_SECONDS = 420


class GenerateMusicTool(Tool):
    """Submit a generation and block until the audio is ready."""

    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage, None, None]:
        credential = self.runtime.credentials.get("lacuna_api_key")
        if not credential:
            raise Exception("A Lacuna API key is required. Configure it on the plugin provider.")

        timeout_seconds = int(tool_parameters.get("timeout_seconds") or DEFAULT_TIMEOUT_SECONDS)
        timeout_seconds = max(MIN_TIMEOUT_SECONDS, min(MAX_TIMEOUT_SECONDS, timeout_seconds))

        client = LacunaClient(credential)
        try:
            payload = build_generate_payload(tool_parameters)
            task = client.create_generation(payload)
            task = client.wait_for_generation(task["id"], timeout_seconds=timeout_seconds)
        except LacunaError as exc:
            raise Exception(str(exc)) from exc

        if task.get("status") == "failed":
            error = task.get("error") or {}
            refunded = task.get("credits_refunded") or 0
            message = error.get("message") or "The generation failed."
            raise Exception(f"{message} Credits refunded: {refunded}.")

        tracks = task.get("tracks") or []

        yield self.create_text_message(summarize_tracks(task))
        yield self.create_json_message(task)
        yield self.create_variable_message("task_id", task.get("id"))
        yield self.create_variable_message("credits_used", task.get("credits_used"))
        yield self.create_variable_message("audio_urls", [t.get("audio_url") for t in tracks])
        if tracks:
            yield self.create_variable_message("audio_url", tracks[0].get("audio_url"))
        for track in tracks:
            if track.get("audio_url"):
                yield self.create_link_message(track["audio_url"])
