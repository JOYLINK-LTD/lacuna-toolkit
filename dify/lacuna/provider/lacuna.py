from typing import Any

from dify_plugin import ToolProvider
from dify_plugin.errors.tool import ToolProviderCredentialValidationError

from tools.utils.lacuna_client import LacunaClient, LacunaError


class LacunaProvider(ToolProvider):
    def _validate_credentials(self, credentials: dict[str, Any]) -> None:
        credential = str(credentials.get("lacuna_api_key") or "").strip()
        if not credential:
            raise ToolProviderCredentialValidationError("A Lacuna API key is required.")
        if not credential.startswith("lyr_"):
            raise ToolProviderCredentialValidationError(
                "That does not look like a Lacuna API key — keys begin with 'lyr_live_'. "
                "Create one at https://www.lacuna.fm/profile/api"
            )

        try:
            LacunaClient(credential, timeout=20).validate_credentials()
        except LacunaError as exc:
            raise ToolProviderCredentialValidationError(str(exc)) from exc
