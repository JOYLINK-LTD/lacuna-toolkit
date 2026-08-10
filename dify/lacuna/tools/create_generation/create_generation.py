from collections.abc import Generator
from typing import Any

from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from tools.utils.lacuna_client import LacunaClient, LacunaError, build_generate_payload


class CreateGenerationTool(Tool):
    """Enqueue a generation and return immediately with the task id."""

    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage, None, None]:
        credential = self.runtime.credentials.get("lacuna_api_key")
        if not credential:
            raise Exception("A Lacuna API key is required. Configure it on the plugin provider.")

        client = LacunaClient(credential)
        try:
            task = client.create_generation(build_generate_payload(tool_parameters))
        except LacunaError as exc:
            raise Exception(str(exc)) from exc

        yield self.create_text_message(
            f"Queued generation {task.get('id')} (status: {task.get('status')}, "
            f"credits used: {task.get('credits_used')})."
        )
        yield self.create_json_message(task)
        yield self.create_variable_message("task_id", task.get("id"))
        yield self.create_variable_message("status", task.get("status"))
        yield self.create_variable_message("credits_used", task.get("credits_used"))
