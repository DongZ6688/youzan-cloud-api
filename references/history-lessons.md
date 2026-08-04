# Sanitized lessons from prior Youzan Cloud work

This summary consolidates the reusable conclusions from earlier order-ranking, product-profit, promotion, Feishu synchronization, and commission-audit work. It intentionally excludes tokens, secrets, webhooks, shop IDs, employee names, phone numbers, server addresses, internal links, and raw production responses.

## Authentication

- A recorded expiry time does not guarantee usability. Production jobs have seen `4203`/token-not-found before the local timestamp suggested expiry.
- Scheduled jobs should validate or refresh before high-cost fan-out work, then stop if authentication is not healthy.
- “Long-lived token” was actually automated rotation before each scheduled job, not a permanently valid access token.
- External refresh is application-dependent. A console debug tool may work through a platform channel while a server receives parameter or capability errors.
- Keep a manual rotation path and expiry alert even when automatic refresh works.

## Orders and rankings

- The proven order flow used a paginated order-list API plus an order-detail API when list data lacked salesman, line-item, refund, or real-payment fields.
- Large monthly runs can involve thousands of detail requests and occasional failures. Track coverage and never silently describe partial data as complete.
- Confirm the metric explicitly: paid amount, real payment, gross merchandise value, or net amount after refunds.
- When excluding one product from a mixed order, allocate the included line-item amount instead of dropping the full order or counting the excluded line.
- A zero-order result after an API error must not generate or send a blank report.

## Goods, promotions, and profit

- Use one row per SKU when specifications can differ in price, stock, cost, discount, or commission.
- A practical “truly on sale” definition was: include an item when at least one branch reports it on sale; stock zero alone does not necessarily remove it.
- The agreed front-end price definition was ordinary customer, quantity one, active limited-time discount only, excluding member price and coupons unless a task explicitly changes the stack.
- When no active limited-time discount exists, front-end price equals SKU sale price.
- Use the SKU supply/cost field. If it is absent, leave cost, profit, and profit-derived fields empty rather than inventing zero.

## Commission

- Distinguish three rule families: percentage of profit, percentage of transaction price, and fixed amount.
- For percentage rules, use the current front-end real price defined by the task, not a stale backend list price.
- Default and custom commission APIs may expose different pieces of the rule. Do not infer a rule type from only a percentage field.
- Coupon amount and product/limited-time discount amount are different fields and should remain separate in audits.

## Synchronization and operations

- Upsert destination rows with a stable synchronization key; retain manual fields and avoid duplicate rows.
- Use checkpoints and bounded retries. An upstream failure must not clear existing Feishu records.
- Read credentials at every scheduled run so token rotation is picked up without redeployment.
- Server-side scheduling is more reliable than depending on a personal computer being awake.
- IP allowlists can fail when local outbound addresses change; a stable server egress is preferable.
- Verify the entire chain separately: scheduler, runtime path, token, API, transformation, rendering or table write, and downstream delivery.
