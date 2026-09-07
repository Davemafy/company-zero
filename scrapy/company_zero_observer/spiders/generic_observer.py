from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
import ipaddress
import re

import scrapy


class GenericObserverSpider(scrapy.Spider):
    name = "generic_observer"

    def __init__(self, url=None, max_pages="1", allowed_domains="", *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not url:
            raise ValueError("url spider argument is required")
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("url must be an absolute http(s) URL")
        self._reject_private_literal(parsed.hostname)
        self.start_url = url
        try:
            self.max_pages = max(1, min(5, int(max_pages)))
        except ValueError:
            raise ValueError("max_pages must be an integer from 1 to 5")
        supplied = [x.strip().lower() for x in str(allowed_domains or "").split(",") if x.strip()]
        host = parsed.hostname.lower()
        if supplied and host not in supplied and not any(host.endswith("." + d) for d in supplied):
            raise ValueError("target host must be within allowed_domains")
        self.allowed_hosts = set(supplied or [host])
        self.visited = set()

    def start_requests(self):
        yield scrapy.Request(self.start_url, callback=self.parse_page, dont_filter=True)

    def parse_page(self, response):
        if len(self.visited) >= self.max_pages:
            return
        source_url = response.url
        self.visited.add(source_url)

        title = " ".join(response.css("title::text").getall()).strip()[:500]
        text = " ".join(x.strip() for x in response.xpath("//body//text()[not(ancestor::script) and not(ancestor::style)]").getall() if x.strip())
        text = re.sub(r"\s+", " ", text)[:200000]
        links = []
        for href in response.css("a::attr(href)").getall():
            try:
                absolute = urljoin(source_url, href)
                parsed = urlparse(absolute)
                if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                    continue
                host = parsed.hostname.lower()
                if not self._allowed_host(host):
                    continue
                if absolute not in links:
                    links.append(absolute)
                if len(links) >= 50:
                    break
            except Exception:
                continue

        yield {
            "source_url": source_url,
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "status": int(response.status),
            "title": title,
            "text": text,
            "links": links,
            "content_type": response.headers.get("Content-Type", b"").decode("latin1", errors="ignore")[:200],
        }

        if len(self.visited) >= self.max_pages:
            return
        for link in links:
            if link not in self.visited:
                yield scrapy.Request(link, callback=self.parse_page)

    def _allowed_host(self, host):
        return any(host == d or host.endswith("." + d) for d in self.allowed_hosts)

    @staticmethod
    def _reject_private_literal(host):
        if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
            raise ValueError("private/local targets are not allowed")
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            return
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            raise ValueError("private/local targets are not allowed")
