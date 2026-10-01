# UNAPPLIED / UNVALIDATED reference deployment: one EC2 host running the compose stack + an S3 bucket for the cold tier.
# Run `terraform init && terraform validate && terraform plan` yourself before relying on it.
# The cloud-agnostic deployment path is the Helm chart in infra/helm.
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "region" {
  type    = string
  default = "ap-south-1"
}
variable "instance_type" {
  type    = string
  default = "c6i.4xlarge"
}
variable "repo_url" {
  type        = string
  description = "git URL of this repository"
}
variable "admin_cidr" {
  type        = string
  description = "CIDR allowed to reach UI/SSH, e.g. 203.0.113.4/32"
}
variable "key_name" {
  type        = string
  description = "existing EC2 key pair name"
}

provider "aws" {
  region = var.region
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

resource "aws_security_group" "fleet" {
  name_prefix = "fleetnorm-"
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }
  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "fleet" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.fleet.id]

  root_block_device {
    volume_size = 200
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = <<-EOT
    #!/bin/bash
    apt-get update && apt-get install -y docker.io docker-compose-v2 git make
    git clone ${var.repo_url} /opt/fleetnorm && cd /opt/fleetnorm
    export JWT_SECRET=$(openssl rand -hex 32)
    export DEVICE_API_KEY=$(openssl rand -hex 16)
    docker compose -f infra/docker-compose.yml up -d --build
  EOT

  tags = {
    Name = "fleetnorm"
  }
}

resource "aws_s3_bucket" "cold" {
  bucket_prefix = "fleetnorm-cold-"
}

resource "aws_s3_bucket_public_access_block" "cold" {
  bucket                  = aws_s3_bucket.cold.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cold" {
  bucket = aws_s3_bucket.cold.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

output "public_ip" {
  value = aws_instance.fleet.public_ip
}
output "cold_bucket" {
  value = aws_s3_bucket.cold.bucket
}
