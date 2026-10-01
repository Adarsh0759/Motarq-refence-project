# IaC validation: Terraform and Helm

Run 2026-10-01. Neither had been `validate`d, `lint`ed, or applied before this (see README's original
"NOT verified" disclosure). This closes that gap for syntax/structural validity; it does **not** by
itself constitute a cloud deployment (see the apply note at the bottom).

## Terraform (`infra/terraform/main.tf`, AWS)

```
$ terraform init -backend=false
Terraform has been successfully initialized!

$ terraform validate
Success! The configuration is valid.

$ terraform fmt -check -diff
(no output — already correctly formatted)
```

Went further than `validate`: ran `terraform plan` with placeholder values for the three required
variables (`repo_url`, `admin_cidr`, `key_name`). This machine has a live AWS identity configured
(`arn:aws:iam::081452989999:user/vle3-cli-user`), so the plan resolved for real — it read a live Ubuntu
AMI (`data.aws_ami.ubuntu` → `ami-007b1f3fdea0383d9`) and produced a clean plan:

```
Plan: 5 to add, 0 to change, 0 to destroy.

Changes to Outputs:
  + cold_bucket = (known after apply)
  + public_ip   = (known after apply)
```

Resources: one `aws_instance` (`c6i.4xlarge`, running the compose stack as a single-host reference
deploy — the file's own header comment is explicit that this is a reference/dev deployment, not the
horizontally-scaled target architecture), a security group (opens 22/3000/8080 to `admin_cidr` only),
and an S3 bucket for the cold tier.

**Not run: `terraform apply`.** That creates a real, billed EC2 instance and S3 bucket in a real AWS
account. That's a cost and blast-radius decision for the account owner, not something to do
unilaterally while chasing a submission deadline — ask first if you want an actual apply/destroy cycle
captured as evidence too.

## Helm (`infra/helm/fleetnorm`)

```
$ helm lint infra/helm/fleetnorm
==> Linting /chart
[INFO] Chart.yaml: icon is recommended
1 chart(s) linted, 0 chart(s) failed

$ helm template infra/helm/fleetnorm
(renders cleanly: 5 Services + Deployments for api/frontend/ingest/ml/processor, 208 lines of valid YAML)
```

Zero lint failures; the only note is a cosmetic missing `icon` field in `Chart.yaml`. Template rendering
produces valid Kubernetes manifests for every service in the stack. No cluster was targeted — this
validates the chart's correctness, not a live Kubernetes deployment.

## Honest summary

Before today: Terraform and Helm were unvalidated, per the project's own disclosure. Now: both are
confirmed syntactically and structurally correct, and the Terraform plan resolves against a real cloud
account with no errors. What remains unproven is an actual `apply`/`helm install` — i.e., "deployable
on a cloud" is now **demonstrated as planned/rendered**, not yet as **running**.
