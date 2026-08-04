# Proven workflow patterns

## Order ranking or reporting

1. Define the Shanghai-time window and whether boundaries use created, paid/success, or updated time.
2. Page through the official order-list API with a maximum-page guard.
3. Fetch order details only for fields absent from the list response.
4. Use bounded concurrency and retain failed order IDs for retry.
5. Extract a stable promoter/salesman identifier and display name separately.
6. Calculate the stated amount definition; deduct refunds only when required.
7. Apply exclusions at the correct granularity. For a mixed order, exclude the affected line rather than the whole order.
8. Fail or mark incomplete when coverage is below the accepted threshold.
9. Generate or write downstream output only after the data gate passes.

Historically useful interfaces included:

- `youzan.trades.sold.get/4.0.4`
- `youzan.trade.get/4.0.2`
- `youzan.salesman.accounts.get/3.0.0`

Re-confirm versions and permission bundles in the current catalog.

## Goods, limited-time discount, and profit sync

1. Enumerate on-sale and inventory candidates across required shops/branches.
2. Normalize to `itemId + skuId` and keep one row per SKU.
3. Resolve current active limited-time discounts for the target time.
4. Compute `frontPrice = skuSalePrice - activeLimitedDiscountAmount` only for the agreed promotion stack.
5. Read SKU supply/cost price; preserve null when absent.
6. Compute profit only when both front price and cost are known.
7. Upsert by stable key and preserve destination-only/manual columns.
8. Mark last sync time and row-specific errors without deleting old valid data.

Historically useful interfaces included:

- `youzan.items.onsale.get/3.0.0`
- `youzan.items.inventory.get/3.0.0`
- `youzan.item.get/3.0.0`
- `youzan.item.sub.status.get/1.0.0`
- `youzan.ump.limitdiscount.detail.query/1.0.0`

## Commission calculation or audit

1. Load item/SKU participation and the applicable salesman level.
2. Resolve custom versus default rules and their calculation dimension.
3. Calculate:
   - profit ratio: `(frontPrice - cost) * ratio`
   - transaction-price ratio: `frontPrice * ratio`
   - fixed amount: configured fixed amount
4. Keep coupon, product promotion, cost, settlement status, participation, and rule type as separate audit columns.
5. Classify a zero commission only from verified fields; otherwise label it for backend rule review.

Historically useful interfaces included:

- `youzan.salesman.items.get/3.0.1`
- `youzan.salesman.customers.list/1.0.0`

Do not assume enum meanings across versions. Verify them in current official documentation and with a known sample.
