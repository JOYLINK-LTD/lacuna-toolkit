# Privacy Policy

This plugin is a thin client for the Lacuna Music API. It stores nothing itself and runs no analytics.

## What the plugin sends

Every tool call sends the following to `https://www.lacuna.fm/api/v1` over HTTPS:

- Your Lacuna API key, in the `Authorization` header. It is supplied by Dify from the provider
  credential store, is never logged by the plugin, and is never included in an error message.
- The generation parameters you pass in: style description, title, lyrics, instrumental flag, model,
  vocal gender and negative tags.
- For `Get generation`, only the task id.

Nothing else leaves the plugin. It does not read files, environment variables, or any part of the
conversation other than the tool parameters listed above.

## What the plugin stores

Nothing. There is no local database, cache or log file. Generated audio is not downloaded — the tools
return the URLs that the Lacuna API reports and pass them to the next node.

## What Lacuna stores

Lacuna receives the request in order to run the generation and to bill credits, and retains the
resulting tracks in your account so you can retrieve them later. That processing is governed by
Lacuna's own policies:

- Privacy Policy: <https://www.lacuna.fm/privacy>
- Terms of Service: <https://www.lacuna.fm/terms>

## Sensitive data

The plugin does not request or process health, financial, biometric, location or children's data. The
only credential involved is the Lacuna API key, which is handled by Dify's secret-input field.

## Contact

<https://github.com/JOYLINK-LTD/lacuna-toolkit/issues>
