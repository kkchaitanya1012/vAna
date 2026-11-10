# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private reporting: open this repository's **Security** tab and choose **Report a vulnerability**. If that option is not available, open an issue that says only that you have a security report, with no details, and a maintainer will arrange a private channel.

Helpful to include:

- what you found and where (file, route, or setting),
- the steps to reproduce it, using fictional data and your own test keys,
- what an attacker could do with it.

This is a small project maintained on a best-effort basis. There is no guaranteed response time and no bug bounty. Reports are read and taken seriously, and you will be credited in the fix if you want to be.

## Supported versions

Only the latest commit on `main` is supported. There are no tagged releases yet.

## What is in scope

- The API (`services/api`), the voice server (`services/voice`) and the web app (`apps/web`).
- Defaults that make a deployment unsafe, such as routes that should require the internal token but do not.

Out of scope: problems in third-party providers or libraries (report those upstream), and issues that need access to your own `.env` or machine.

## Running it safely

The local defaults are open on purpose. Before you expose an instance to the internet, follow "Before you expose it to the internet" in the [README](README.md#before-you-expose-it-to-the-internet). In short:

- Set `VANA_INTERNAL_TOKEN` so only the API and the voice server can call each other's control routes.
- Put your own sign-in and rate limits in front of it, and set spend limits in each provider's dashboard.
- Keep the cost guards on (`VANA_MAX_CALL_S`, `VANA_IDLE_S`, `VANA_MAX_CONCURRENT`).
- Remember that calls are recorded to disk. Tell people, and decide how long you keep recordings.
- Never commit `.env` or share provider keys.
