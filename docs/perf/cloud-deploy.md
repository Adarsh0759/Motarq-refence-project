# Cloud deployment: real, applied, measured

Run 2026-10-01, ~19:00-19:45 IST, under the submission deadline — this is a genuine `terraform apply`
against a live AWS account, not a plan-only validation (see `docs/perf/iac-validate.md` for the earlier
plan-only check).

## What happened

1. `terraform validate` / `plan` (done earlier today) were clean against this AWS account.
2. On `apply`, the originally-specified instance type (`c6i.4xlarge`) was rejected: this AWS account
   has a guardrail restricting new instances to free-tier-eligible types only
   (`InvalidParameterCombination: The specified instance type is not eligible for Free Tier`). This is
   an account-level policy, not a Terraform or application bug.
3. Re-applied with `instance_type=m7i-flex.large` (2 vCPU, 8 GiB RAM, free-tier eligible on this
   account) — the largest free-tier-eligible option available (`aws ec2 describe-instance-types
   --filters Name=free-tier-eligible,Values=true`). Apply succeeded:
   - Instance ID: `i-02fa7164f491fdd72`
   - Public IP: `16.4.74.215`
   - Region: `ap-south-1`
   - Security group: SSH/8080/3000 restricted to the operator's IP (`45.119.28.59/32`), not open to
     the internet
   - S3 cold-tier bucket: `fleetnorm-cold-20261001134539379200000001` (encrypted, public access blocked)
4. The instance self-bootstraps via EC2 user-data (no manual SSH steps required): installs Docker,
   `git clone`s the repo, generates fresh random `JWT_SECRET`/`DEVICE_API_KEY`, and runs
   `docker compose -f infra/docker-compose.yml up -d --build`.

## Honest scope note

A `c6i.4xlarge` (16 vCPU) was the original reference spec; the account-level free-tier guardrail forced
a much smaller `m7i-flex.large` (2 vCPU / 8 GiB) instead. The full 13-service stack (Redpanda,
ClickHouse, Postgres, MongoDB, Redis, 4 backend services, ML, frontend, Prometheus, Grafana) is heavier
than this box is sized for under real load — this deployment demonstrates **the stack runs and is
reachable on real cloud infrastructure**, not that it sustains production load there. The load-test
numbers in `docs/perf/load-test.md` were measured on the original local Docker topology, not here;
doing a fair load comparison would need an instance actually sized to the architecture's target spec,
which this AWS account's free-tier guardrail doesn't currently allow without a billing/limit change.

## Teardown

This is left running only long enough to capture screenshots/video evidence, then destroyed:
`terraform destroy -var="repo_url=..." -var="admin_cidr=..." -var="key_name=fleetnorm-key"
-var="instance_type=m7i-flex.large"` — to avoid leaving a billed instance running after submission.
