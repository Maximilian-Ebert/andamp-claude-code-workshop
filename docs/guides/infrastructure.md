# Infrastructure (AWS CDK)

Cloud resources are defined in `infrastructure/` using the AWS CDK with
TypeScript (npm). See [ADR 0003](../decisions/0003-typescript-for-aws-cdk.md).

## Install

```bash
cd infrastructure
npm install
```

## Compile

```bash
npm run build      # tsc — compile TypeScript
npm run watch      # tsc -w — recompile on change
```

## CDK commands

```bash
npx cdk synth      # synthesize the CloudFormation template
npx cdk diff       # diff deployed stack vs current code
npx cdk deploy     # deploy to the configured AWS account/region
```

The runtime stack is named **`ApplicationStack`** (entry point
`bin/infrastructure.ts`, definition in `stack/application-stack.ts`, composed from the
constructs in `component/`). A second, real-AWS-only **`BootstrapStack`**
(`stack/bootstrap-stack.ts`) is a placeholder for the future CI/CD pipeline.

## First-time per account/region

Before the first deploy into a new account/region, bootstrap the CDK toolkit:

```bash
npx cdk bootstrap
```

AWS credentials come from the AWS CLI (`aws configure` or SSO). The target
account/region follows your CLI/profile and `CDK_DEFAULT_*` environment.

## Notes

- The stack is currently empty. Lambda functions from `application/functions/` and
  hosting for `application/web-app/` will be wired in here (e.g. via `NodejsFunction`),
  bundled the same way `application/functions/build.mjs` does.
