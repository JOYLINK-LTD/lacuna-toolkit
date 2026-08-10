from collections.abc import Generator
from typing import Any

from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from tools.utils.lacuna_client import LacunaClient, LacunaError, summarize_tracks


class GetGenerationTool(Tool):
    """Read the current state of a generation task."""

    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage, None, None]:
        credential = self.runtime.credentials.get("lacuna_api_key")
        if not credential:
            raise Exception("A Lacuna API key is required. Configure it on the plugin provider.")

        task_id = str(tool_parameters.get("task_id") or "").strip()
        if not task_id:
            raise Exception("`task_id` is required.")

        try:
            task = LacunaClient(credential).get_generation(task_id)
        except LacunaError as exc:
            raise Exception(str(exc)) from exc

        status = task.get("status")
        tracks = task.get("tracks") or []

        if status == "ready":
            yield self.create_text_message(summarize_tracks(task))
        elif status == "failed":
            error = task.get("error") or {}
            yield self.create_text_message(
                f"Generation {task_id} failed: {error.get('message') or 'unknown error'}. "
                f"Credits refunded: {task.get('credits_refunded') or 0}."
            )
        else:
            yield self.create_text_message(f"Generation {task_id} is still running.")

        yield self.create_json_message(task)
        yield self.create_variable_message("status", status)
        yield self.create_variable_message("audio_urls", [t.get("audio_url") for t in tracks])
        if tracks:
            yield self.create_variable_message("audio_url", tracks[0].get("audio_url"))
