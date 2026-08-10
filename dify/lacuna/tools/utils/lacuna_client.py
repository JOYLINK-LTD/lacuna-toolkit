"""Thin HTTP client for the Lacuna Music API.

Kept dependency-free beyond `requests` so the packaged plugin stays small and
auditable. The error surface is normalised once here: every Lacuna error body
follows `{"error": {"type", "code", "message", ...}}`, and callers only ever see
a `LacunaError` with a human-readable message.

The bearer credential is never returned from a function and never interpolated
into an error message — it only ever reaches the header dict of a live request.
"""

from __future__ import annotations

import time
from typing import Any

import requests

DEFAULT_BASE_URL = "https://www.lacuna.fm/api/v1"
USER_AGENT = "lacuna-dify-plugin/0.1.0"

#: Models the public API accepts. `aether` returns two takes per request and
#: exposes the vocal-register and negative-tag controls; `echo` returns one take
#: with a complete song structure of up to three minutes.
SUPPORTED_MODELS = ("aether", "echo")

#: Terminal task states. Anything else means the task is still in flight.
TERMINAL_STATUSES = ("ready", "failed")


class LacunaError(Exception):
    """An API-reported failure, already formatted for the end user."""

    def __init__(self, message: str, *, code: str | None = None, status: int | None = None):
        super().__init__(message)
        self.code = code
        self.status = status


class LacunaClient:
    def __init__(self, credential: str, base_url: str = DEFAULT_BASE_URL, timeout: int = 60):
        self._credential = (credential or "").strip()
        self.base_url = (base_url or DEFAULT_BASE_URL).strip().rstrip("/")
        self.timeout = timeout

    # ------------------------------------------------------------------ HTTP

    def _request(self, method: str, path: str, *, json: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}{path}"
        try:
            response = requests.request(
                method,
                url,
                json=json,
                headers={
                    "authorization": f"Bearer {self._credential}",
                    "content-type": "application/json",
                    "accept": "application/json",
                    "user-agent": USER_AGENT,
                },
                timeout=self.timeout,
            )
        except requests.exceptions.Timeout as exc:
            raise LacunaError(f"Request to {url} timed out after {self.timeout}s.") from exc
        except requests.exceptions.RequestException as exc:
            raise LacunaError(f"Could not reach the Lacuna API: {exc}") from exc

        if response.status_code >= 400:
            raise self._to_error(response)

        try:
            return response.json()
        except ValueError as exc:
            raise LacunaError("The Lacuna API returned a response that was not JSON.") from exc

    @staticmethod
    def _to_error(response: requests.Response) -> LacunaError:
        code: str | None = None
        message = f"Lacuna API returned HTTP {response.status_code}."
        try:
            body = response.json()
            error = body.get("error") if isinstance(body, dict) else None
            if isinstance(error, dict):
                code = error.get("code")
                message = error.get("message") or message
                if error.get("param"):
                    message = f"{message} (field: {error['param']})"
        except ValueError:
            pass
        return LacunaError(message, code=code, status=response.status_code)

    # ------------------------------------------------------------------ API

    def create_generation(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /v1/music/generations — deducts credits and enqueues the task."""
        return self._request("POST", "/music/generations", json=payload)

    def get_generation(self, task_id: str) -> dict[str, Any]:
        """GET /v1/music/generations/{id}."""
        return self._request("GET", f"/music/generations/{task_id}")

    def validate_credentials(self) -> None:
        """Cheapest possible authenticated probe.

        A task id that cannot exist reaches the handler only after the key,
        its scopes and the account tier have all been checked, so a 404 is
        proof the credential is good. Nothing is generated and no credits move.
        """
        try:
            self.get_generation("credential-probe")
        except LacunaError as exc:
            if exc.status == 404:
                return
            raise

    def wait_for_generation(
        self,
        task_id: str,
        *,
        timeout_seconds: int,
        poll_interval_seconds: int = 5,
    ) -> dict[str, Any]:
        """Poll until the task settles, the deadline passes, or the API errors."""
        deadline = time.monotonic() + timeout_seconds
        task = self.get_generation(task_id)
        while task.get("status") not in TERMINAL_STATUSES:
            if time.monotonic() >= deadline:
                raise LacunaError(
                    f"Generation {task_id} was still running after {timeout_seconds}s. "
                    f"It keeps running on Lacuna — retrieve it later with the "
                    f"'Get generation' tool."
                )
            time.sleep(poll_interval_seconds)
            task = self.get_generation(task_id)
        return task


def build_generate_payload(params: dict[str, Any]) -> dict[str, Any]:
    """Map Dify tool parameters onto the API's GenerateRequest body.

    The API rejects unknown keys outright, so only set what the caller filled
    in — and only send the aether-specific controls when aether is selected.
    """
    style = (params.get("style") or "").strip()
    title = (params.get("title") or "").strip()
    if not style:
        raise LacunaError("`style` is required, e.g. 'lofi hip hop, mellow piano, 70 bpm'.")
    if not title:
        raise LacunaError("`title` is required.")

    model = (params.get("model") or "aether").strip()
    if model not in SUPPORTED_MODELS:
        raise LacunaError(f"Unknown model '{model}'. Choose one of: {', '.join(SUPPORTED_MODELS)}.")

    instrumental = bool(params.get("instrumental", False))
    lyrics = (params.get("lyrics") or "").strip()
    if not instrumental and not lyrics:
        raise LacunaError(
            "`lyrics` is required for a vocal track. Set `instrumental` to true for a "
            "music-only bed."
        )

    payload: dict[str, Any] = {
        "style": style,
        "title": title,
        "instrumental": instrumental,
        "model": model,
    }
    if lyrics and not instrumental:
        payload["lyrics"] = lyrics

    # vocal_gender and negative_tags are aether-only; sending them with another
    # model is a 400 rather than a silent no-op.
    if model == "aether":
        vocal_gender = (params.get("vocal_gender") or "").strip()
        if vocal_gender:
            payload["vocal_gender"] = vocal_gender
        negative_tags = (params.get("negative_tags") or "").strip()
        if negative_tags:
            payload["negative_tags"] = negative_tags

    return payload


def summarize_tracks(task: dict[str, Any]) -> str:
    """One human-readable line per track, for the tool's text output."""
    tracks = task.get("tracks") or []
    if not tracks:
        return "The generation finished but returned no tracks."
    lines = []
    for track in tracks:
        title = track.get("title") or "Untitled"
        duration = track.get("duration")
        duration_text = f"{round(float(duration))}s" if duration else "unknown length"
        lines.append(f"{title} ({duration_text}) — {track.get('audio_url')}")
    return "\n".join(lines)
