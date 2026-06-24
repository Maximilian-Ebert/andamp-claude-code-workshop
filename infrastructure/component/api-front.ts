import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib/core';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';

const TREAT_ALL_MEDIA_AS_BINARY = ['*/*'];
const STAGE_NAME = 'prod';
const LOCALSTACK_EXECUTE_API_HOST =
  'execute-api.localhost.localstack.cloud:4566';
// LocalStack honours the `_custom_id_` tag to pin a REST API's id, giving the
// nginx edge a stable upstream host across deploys. Ignored by real AWS.
const LOCALSTACK_API_ID = 'timetracker';

// Cache-Control is passed through from the S3 object's own metadata, the same way
// Content-Type/Length already are. Metadata is set at upload time — `make sync-static`
// locally, BucketDeployment on AWS — so `/_astro/*` ships `immutable` and the
// unhashed entries (index.html, favicons, regions.json) ship `no-cache`. See ADR 0010.
// (A static-literal value here would be more direct, but LocalStack's API Gateway
// rejects it — it breaks the 200 output mapping — and `staged` must mirror prod.)
const STATIC_INTEGRATION_RESPONSES: apigateway.IntegrationResponse[] = [
  {
    statusCode: '200',
    responseParameters: {
      'method.response.header.Content-Type':
        'integration.response.header.Content-Type',
      'method.response.header.Content-Length':
        'integration.response.header.Content-Length',
      'method.response.header.Cache-Control':
        'integration.response.header.Cache-Control',
    },
  },
  { statusCode: '403', selectionPattern: '403' },
  { statusCode: '404', selectionPattern: '404' },
];

const STATIC_METHOD_RESPONSES: apigateway.MethodResponse[] = [
  {
    statusCode: '200',
    responseParameters: {
      'method.response.header.Content-Type': true,
      'method.response.header.Content-Length': true,
      'method.response.header.Cache-Control': true,
    },
  },
  { statusCode: '403' },
  { statusCode: '404' },
];

export interface ApiFrontProps {
  readonly isLocal: boolean;
  readonly bucket: s3.Bucket;
  readonly astroServer: lambda.Function;
}

export class ApiFront extends Construct {
  readonly url: string;

  constructor(scope: Construct, id: string, props: ApiFrontProps) {
    super(scope, id);
    const { isLocal, bucket, astroServer } = props;

    const api = new apigateway.RestApi(this, 'RestApi', {
      binaryMediaTypes: TREAT_ALL_MEDIA_AS_BINARY,
      deployOptions: { stageName: STAGE_NAME },
      // Gzip responses above ~1 KB (when the client sends Accept-Encoding). Pages
      // inline their CSS (ADR 0010), so HTML is ~38 KB raw → ~6 KB compressed.
      minCompressionSize: cdk.Size.bytes(1024),
    });

    if (isLocal) {
      (api.node.defaultChild as apigateway.CfnRestApi).tags.setTag(
        '_custom_id_',
        LOCALSTACK_API_ID,
      );
    }

    this.routeStaticAssetsToBucket(api, bucket);
    this.routeEverythingElseToAstroServer(api, astroServer);

    this.url = isLocal ? this.localStackInvokeUrl(api) : api.url;
  }

  private localStackInvokeUrl(api: apigateway.RestApi): string {
    return `http://${api.restApiId}.${LOCALSTACK_EXECUTE_API_HOST}/${STAGE_NAME}/`;
  }

  // Carve the known static paths out to S3; the SSR Lambda is the default for
  // everything else, so new on-demand pages need no routing changes here.
  private routeStaticAssetsToBucket(
    api: apigateway.RestApi,
    bucket: s3.Bucket,
  ): void {
    const reader = new iam.Role(this, 'S3Role', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
    });
    bucket.grantRead(reader);

    const serveObject = (
      resource: apigateway.IResource,
      method: string,
      objectPath: string,
      requestParameters?: Record<string, string>,
      methodRequestParameters?: Record<string, boolean>,
    ): void => {
      resource.addMethod(
        method,
        this.s3ObjectIntegration(reader, objectPath, requestParameters),
        {
          requestParameters: methodRequestParameters,
          methodResponses: STATIC_METHOD_RESPONSES,
        },
      );
    };

    serveObject(api.root, 'GET', `${bucket.bucketName}/index.html`);

    serveObject(
      api.root.addResource('_astro').addResource('{proxy+}'),
      'GET',
      `${bucket.bucketName}/_astro/{object}`,
      { 'integration.request.path.object': 'method.request.path.proxy' },
      { 'method.request.path.proxy': true },
    );

    for (const file of ['favicon.ico', 'favicon.svg', 'regions.json']) {
      serveObject(
        api.root.addResource(file),
        'GET',
        `${bucket.bucketName}/${file}`,
      );
    }
  }

  private routeEverythingElseToAstroServer(
    api: apigateway.RestApi,
    astroServer: lambda.Function,
  ): void {
    const integration = new apigateway.LambdaIntegration(astroServer);
    api.root.addProxy({ anyMethod: true, defaultIntegration: integration });
  }

  private s3ObjectIntegration(
    reader: iam.IRole,
    objectPath: string,
    requestParameters?: Record<string, string>,
  ): apigateway.AwsIntegration {
    return new apigateway.AwsIntegration({
      service: 's3',
      integrationHttpMethod: 'GET',
      path: objectPath,
      options: {
        credentialsRole: reader,
        requestParameters,
        integrationResponses: STATIC_INTEGRATION_RESPONSES,
      },
    });
  }
}
