from setuptools import setup, find_packages

setup(
    name="company-zero-observer",
    version="1.0.0",
    packages=find_packages(),
    entry_points={"scrapy": ["settings = company_zero_observer.settings"]},
)
