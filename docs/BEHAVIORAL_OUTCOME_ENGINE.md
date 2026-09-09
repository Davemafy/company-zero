# Behavioral Outcome Engine

Company Zero treats natural-language intent as a universal work problem, not a vertical template.

The runtime path is:

`request -> work contract -> build -> semantic critic -> revise (bounded) -> critic -> accepted artifact`

The critic is not allowed to turn a weak artifact into a pass. If semantic review fails, Studio may perform at most `STUDIO_MAX_REVISIONS` revisions (default 2). Each revision receives the work contract and the critic's failures/revision instructions. The same generic path applies to any request.

No domain prompt is embedded in the compiler or revision worker. External outcomes still require external evidence; revision can improve non-external work but cannot manufacture customers, payments, deployments, purchases, messages, measurements, or other real-world facts.

A local development fallback can still perform structural checks when TensorMux is absent, but `qa.semanticVerified` is false in that mode. Production requires TensorMux for the Studio build path.
