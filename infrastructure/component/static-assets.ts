import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

const clientBuildDir = path.resolve(
  __dirname,
  '../../application/web-app/dist/client',
);

export interface StaticAssetsProps {
  readonly isLocal: boolean;
}

export class StaticAssets extends Construct {
  readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StaticAssetsProps) {
    super(scope, id);
    const { isLocal } = props;

    this.bucket = new s3.Bucket(this, 'Bucket', {
      removalPolicy: isLocal
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: isLocal,
    });

    const uploadedByBucketDeployment = !isLocal;
    if (uploadedByBucketDeployment) {
      // The served Cache-Control is set authoritatively at the API Gateway front
      // (see api-front.ts / ADR 0010); this object metadata is defense-in-depth
      // for any path that reads S3 directly. Uploads everything as revalidate-on-
      // use and prunes stale hashes...
      const deployment = new s3deploy.BucketDeployment(this, 'Deployment', {
        sources: [s3deploy.Source.asset(clientBuildDir)],
        destinationBucket: this.bucket,
        cacheControl: [s3deploy.CacheControl.fromString('no-cache')],
      });

      // ...then re-stamps the content-hashed `_astro/*` assets as immutable.
      // prune:false (no overlap-driven deletes) and ordered after the base
      // deployment so the immutable metadata wins. Skipped when there are no
      // hashed assets (e.g. CSS is inlined into HTML) — an empty source would
      // be a no-op deployment at best and a synth/deploy error at worst.
      if (fs.existsSync(path.join(clientBuildDir, '_astro'))) {
        const immutableAssets = new s3deploy.BucketDeployment(
          this,
          'ImmutableAssets',
          {
            sources: [
              s3deploy.Source.asset(clientBuildDir, {
                exclude: ['**', '!_astro/**'],
              }),
            ],
            destinationBucket: this.bucket,
            prune: false,
            cacheControl: [
              s3deploy.CacheControl.fromString(
                'public, max-age=31536000, immutable',
              ),
            ],
          },
        );
        immutableAssets.node.addDependency(deployment);
      }
    }
  }
}
