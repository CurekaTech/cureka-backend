# Infrastructure

This directory holds infrastructure-as-code and deployment configuration.

## Planned structure

```
infrastructure/
├── k8s/           # Kubernetes manifests (Deployment, Service, Ingress, HPA)
│   ├── api/
│   ├── worker/
│   └── base/
├── helm/          # Helm charts
├── terraform/     # Cloud resource provisioning (RDS, ElastiCache, ECS/EKS)
└── ci/            # CI pipeline configs (GitHub Actions workflows)
```
