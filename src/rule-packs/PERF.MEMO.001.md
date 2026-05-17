# PERF.MEMO.001 — Heavy React component without memoization

- **Severity (default):** LOW
- **Category:** Performance
- **Source:** static heuristic + Claude reasoning
- **Citation:** [React docs — `useMemo`, `React.memo`](https://react.dev/reference/react/memo)

## Why

A component that does meaningful work on every render but isn't wrapped in `React.memo`,
and doesn't use `useMemo`/`useCallback` for expensive children, will re-render on every
parent state change. Common cause of janky lists & charts.

## Bad

```tsx
export default function ProductRow({ product, onSelect }: Props) {
  const formatted = expensiveFormat(product);
  return <div onClick={onSelect}>{formatted}</div>;
}
```

## Good

```tsx
const ProductRow = React.memo(function ProductRow({ product, onSelect }: Props) {
  const formatted = useMemo(() => expensiveFormat(product), [product]);
  return <div onClick={onSelect}>{formatted}</div>;
});
```

## Suppress

```tsx
// ai-review-ignore: PERF.MEMO.001 — component renders once at page load only
```
