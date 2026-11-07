import * as cdk from "aws-cdk-lib/core";
import { Duration } from "aws-cdk-lib/core";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import { aws_apigatewayv2_authorizers } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Auth } from "./auth";
import { Tables } from "./tables";

// One HTTP API, two Lambdas with separate IAM roles: claim privacy is enforced by IAM,
// because the owner Lambda is never granted access to the Claims table.
export function createApi(
  stack: cdk.Stack,
  {
    auth,
    tables,
    allowedOrigins,
    imagesBucket,
    siteUrl,
  }: {
    auth: Auth;
    tables: Tables;
    allowedOrigins: string[];
    imagesBucket: s3.IBucket;
    siteUrl: string;
  },
) {
  const { listsTable, itemsTable, claimsTable, ownersTable } = tables;

  const ownerApiFn = new NodejsFunction(stack, "OwnerApiFn", {
    entry: "lambda/owner/index.ts",
    handler: "handler",
    runtime: lambda.Runtime.NODEJS_22_X,
    environment: {
      LISTS_TABLE_NAME: listsTable.tableName,
      ITEMS_TABLE_NAME: itemsTable.tableName,
      IMAGES_BUCKET_NAME: imagesBucket.bucketName,
      IMAGES_BASE_URL: siteUrl,
      OWNERS_TABLE_NAME: ownersTable.tableName,
    },
    // The presigned POST helper isn't part of the Lambda runtime's SDK, so bundle the whole
    // SDK to keep its packages on matching versions
    bundling: { externalModules: [] },
  });
  listsTable.grantReadWriteData(ownerApiFn);
  itemsTable.grantReadWriteData(ownerApiFn);
  // Signs upload forms for pending/, copies uploads to images/, deletes both.
  // Reading pending/ also lists the bucket, so a missing upload is a 404 rather than a 403.
  imagesBucket.grantPut(ownerApiFn);
  imagesBucket.grantRead(ownerApiFn, "pending/*");
  imagesBucket.grantDelete(ownerApiFn);
  ownersTable.grantReadWriteData(ownerApiFn);

  const guestApiFn = new NodejsFunction(stack, "GuestApiFn", {
    entry: "lambda/guest/index.ts",
    handler: "handler",
    runtime: lambda.Runtime.NODEJS_22_X,
    environment: {
      LISTS_TABLE_NAME: listsTable.tableName,
      ITEMS_TABLE_NAME: itemsTable.tableName,
      CLAIMS_TABLE_NAME: claimsTable.tableName,
      OWNERS_TABLE_NAME: ownersTable.tableName,
    },
  });
  listsTable.grantReadData(guestApiFn);
  itemsTable.grantReadData(guestApiFn);
  claimsTable.grantReadWriteData(guestApiFn);
  ownersTable.grantReadData(guestApiFn);

  // Fetches shop pages for the add-item preview: internet access, but no table access at all
  const previewFn = new NodejsFunction(stack, "PreviewFn", {
    entry: "lambda/preview/index.ts",
    handler: "handler",
    runtime: lambda.Runtime.NODEJS_22_X,
    // Shop pages take 1-3 s; the fetch itself gives up after 8 s
    timeout: Duration.seconds(15),
    memorySize: 512,
  });

  const authorizer = new aws_apigatewayv2_authorizers.HttpUserPoolAuthorizer(
    "Authorizer",
    auth.userPool,
    {
      userPoolClients: [auth.userPoolClient],
    },
  );

  const ownerApiIntegration = new HttpLambdaIntegration(
    "WishlistOwnerApiIntegration",
    ownerApiFn,
  );
  const previewIntegration = new HttpLambdaIntegration(
    "WishlistPreviewIntegration",
    previewFn,
  );
  const guestApiIntegration = new HttpLambdaIntegration(
    "WishlistGuestApiIntegration",
    guestApiFn,
  );

  const httpApi = new HttpApi(stack, "WishlistHttpApi", {
    corsPreflight: {
      allowOrigins: allowedOrigins,
      allowMethods: [
        CorsHttpMethod.GET,
        CorsHttpMethod.POST,
        CorsHttpMethod.PATCH,
        CorsHttpMethod.DELETE,
      ],
      allowHeaders: ["Authorization", "Content-Type"],
      maxAge: Duration.hours(1),
    },
  });

  // Explicit methods (not ANY) so CORS preflights are answered by API Gateway, not routed here
  httpApi.addRoutes({
    path: "/lists",
    methods: [HttpMethod.GET, HttpMethod.POST],
    integration: ownerApiIntegration,
    authorizer,
  });
  httpApi.addRoutes({
    path: "/lists/{proxy+}",
    methods: [
      HttpMethod.GET,
      HttpMethod.POST,
      HttpMethod.PATCH,
      HttpMethod.DELETE,
    ],
    integration: ownerApiIntegration,
    authorizer,
  });
  // The views across all lists (All items, Want most, Got it)
  httpApi.addRoutes({
    path: "/items",
    methods: [HttpMethod.GET],
    integration: ownerApiIntegration,
    authorizer,
  });
  httpApi.addRoutes({
    path: "/me",
    methods: [HttpMethod.GET, HttpMethod.PATCH],
    integration: ownerApiIntegration,
    authorizer,
  });
  httpApi.addRoutes({
    path: "/preview",
    methods: [HttpMethod.POST],
    integration: previewIntegration,
    authorizer,
  });
  // Guests have no account: access comes from the unguessable share token in the path
  httpApi.addRoutes({
    path: "/share/{proxy+}",
    methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.DELETE],
    integration: guestApiIntegration,
  });

  return { httpApi };
}
