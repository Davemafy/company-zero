# Scrapy Cloud observation provider

Company Zero can use the GitHub Student Developer Pack Scrapy Cloud unit without requiring a paid Zyte API subscription. The current Scrapy Cloud project ID is `877155`.

## Deploy the observer

The deployable Scrapy project lives in `scrapy/` and contains a single bounded spider named `generic_observer`.

```bash
cd scrapy
pip install --upgrade shub
shub login
shub deploy 877155
```

`shub login` expects the **Scrapy Cloud API key**, which is different from a Zyte API key. Do not commit the key.

The current recommended Scrapy Cloud stack is declared in `scrapy/scrapinghub.yml`.

## Runtime configuration

Configure these server-side variables on Railway (and on Vercel only if API-side code invokes the provider):

```text
SCRAPY_CLOUD_API_KEY=...
SCRAPY_CLOUD_PROJECT_ID=877155
SCRAPY_CLOUD_SPIDER=generic_observer
SCRAPY_CLOUD_POLL_MS=1000
SCRAPY_CLOUD_POLL_WINDOW_MS=120000
```

The adapter tags each launch with a stable hash of the durable invocation key and stores the returned job ID in the invocation journal. It polls for a bounded window, which defaults to 120 seconds, and requeues another check when the job is still running. A retry recovers the original job by ID or tag and never schedules it again. `SCRAPY_CLOUD_JOB_TIMEOUT_MS` remains a backwards-compatible fallback and is clamped to at least 120 seconds.

After the job finishes, the adapter retrieves at most five items through the Items API, validates and normalizes the result, and persists it as `EXTERNAL_OBSERVATION`. Scraped content never becomes outcome proof merely because the crawl succeeded.

## Spider bounds

`generic_observer` accepts:

- `url` (required)
- `max_pages` (1 to 5)
- `allowed_domains` (comma-separated; defaults to the target host)

It obeys `robots.txt`, uses AutoThrottle, limits concurrency, follows only allowed-domain links, and emits title/text/link metadata for evidence ingestion.
