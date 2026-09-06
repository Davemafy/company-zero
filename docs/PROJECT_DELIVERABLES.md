# Project companies and deliverables

Company Zero now supports a first-class project-company path.

A user can create a company with a plain-language outcome such as "Build and launch a website for my new restaurant". Project companies automatically receive the built-in Company Zero Studio provider, then use the normal organization synthesis, launch, durable queue, worker, evaluation, Governor and evidence layers.

## End-to-end website path

1. Create a project company from a plain-language outcome.
2. Company Zero provisions three built-in capabilities: understand_brief, build_deliverable and quality_review.
3. Organization synthesis creates a Brief Strategist, Builder and Quality Reviewer.
4. Launch creates the production organization revision.
5. Submit the project brief as work.
6. The durable worker executes each role in order.
7. TensorMux plans and builds the deliverable in production. Development/test mode can use a deterministic fallback only when production is not active or STUDIO_ALLOW_FALLBACK=true.
8. The quality-review capability checks the generated files.
9. The finished deliverable is persisted as an artifact record.
10. The Work UI shows the deliverable, QA state, website preview and ZIP download.

Website artifacts contain index.html, styles.css and main.js. Preview is served by /api/artifact?id=<artifactId>&mode=preview. Download is served as a real ZIP by /api/artifact?id=<artifactId>&mode=download.

Other built-in output classes supported by the Studio adapter are report, campaign, document and general file deliverables. TensorMux is instructed not to invent external research or citations.
