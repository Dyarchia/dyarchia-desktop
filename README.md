# crawlee-lab

On-demand web scraping toolkit built on [Crawlee for Python](https://crawlee.dev/python).

Point it at a URL and it scrapes. Freeze a run that worked into a reusable profile when the target becomes
recurring. Snapshot any target to track how its content changes over time.

## Install

```bash
uv sync --dev
```

## Quick start

```bash
uv run crawlee-lab inspect https://example.com
uv run crawlee-lab crawl https://example.com --depth 2 --extract auto --format jsonl
```

## Documentation

- Design spec: `docs/superpowers/specs/2026-08-10-crawlee-toolkit-design.md`
- Crawlee API reference index: `docs/reference/crawlee.md`

## License

MIT
