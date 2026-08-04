# Authentication and token rotation

## Rules

- Keep credentials outside repositories and chat transcripts.
- Prefer environment variables for interactive use and a mode-`0600` external token store for scheduled jobs.
- Validate real API usability; a timestamp alone is insufficient because a token can be revoked before its recorded expiry.
- Refresh at most once for a failed call. Repeated refresh attempts can hide permission problems and create noisy failures.
- Never log request URLs containing `access_token`.

## Supported inputs

The caller resolves values in this order:

1. `YOUZAN_ACCESS_TOKEN`, `YOUZAN_REFRESH_TOKEN`, `YOUZAN_CLIENT_ID`, `YOUZAN_CLIENT_SECRET`.
2. The JSON path in `YOUZAN_TOKEN_STORE` or `--config`.
3. `~/.config/youzan-cloud-api/credentials.json`.

The standard store schema is available at `assets/credentials.example.json`. Keep the completed store outside the skill directory.

## Refresh behavior

The bundled caller uses the established Youzan token endpoint with `authorize_type=refresh_token` when `clientId`, `clientSecret`, and `refreshToken` are available. It refreshes proactively near expiry and once after a recognized invalid-token response.

Application type and permissions control whether external refresh is available. In particular:

- Youzan container applications may use platform token-management or no-auth SDK capabilities when eligible.
- The official no-auth SDK documentation says this capability is for container applications, not containerless applications.
- Some self-use containerless applications can call data APIs while external OAuth/refresh calls return a parameter or capability error. Treat manual console rotation as the supported fallback in that case.

When refresh fails with `4005`, `参数错误`, or an equivalent capability denial:

1. Stop automatic retries.
2. Keep the last credential store unchanged.
3. Obtain a fresh token through the authorized Youzan console/debug workflow.
4. Update the external store locally without sending the token through chat.
5. Schedule an expiry reminder and retain a manual recovery runbook.

## Official references

- [Youzan Cloud server-side documentation](https://doc.youzanyun.com/v2/doc/cloud/token/RsS0wO4sWiOHTpk6KJCczq2xnic)
- [Self-use containerless access-token guidance](https://doc.youzanyun.com/resource/develop-guide/41355/49259)
- [Service-provider no-auth SDK](https://doc.youzanyun.com/resource/develop-guide/41356/50556)
- [Youzan Cloud development rules](https://doc.youzanyun.com/resource/operate-spec/27033/27637)

Always re-check the current official documentation before changing an authentication flow.
