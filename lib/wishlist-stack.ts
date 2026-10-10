import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import {
  aws_apigatewayv2_authorizers,
  aws_cognito,
  aws_dynamodb,
} from "aws-cdk-lib";
import { CfnOutput, Duration } from "aws-cdk-lib/core";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { SiteDomain } from "./certificate-stack";
import * as fs from "node:fs";
import * as path from "node:path";

const FRONTEND_DIST = path.join(__dirname, "../frontend/dist");

export class WishlistStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps & {
      site: SiteDomain & { certificate: acm.ICertificate };
    },
  ) {
    super(scope, id, props);

    // Lambda
    const ownerApiFn = new NodejsFunction(this, "OwnerApiFn", {
      entry: "lambda/owner/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
    });

    const guestApiFn = new NodejsFunction(this, "GuestApiFn", {
      entry: "lambda/guest/index.ts",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
    });

    // Cognito
    const userPool = new aws_cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      // Sign-in settings can't change on an existing pool; changing them replaces it
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      signInPolicy: {
        allowedFirstAuthFactors: {
          emailOtp: true,
          password: true,
        },
      },
      userVerification: {
        emailStyle: aws_cognito.VerificationEmailStyle.CODE,
        emailSubject: "Your gimme code",
        emailBody: "Your gimme verification code is {####}",
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const userPoolClient = userPool.addClient("UserPoolClient", {
      authFlows: {
        user: true,
      },
      refreshTokenValidity: Duration.days(90),
      // Time allowed to enter the emailed sign-in code (default is 3 minutes)
      authSessionValidity: Duration.minutes(10),
    });

    const auth = new aws_apigatewayv2_authorizers.HttpUserPoolAuthorizer(
      "Authorizer",
      userPool,
      {
        userPoolClients: [userPoolClient],
      },
    );

    // HTTP API Gateway
    const ownerApiIntegration = new HttpLambdaIntegration(
      "WishlistOwnerApiIntegration",
      ownerApiFn,
    );
    const guestApiIntegration = new HttpLambdaIntegration(
      "WishlistGuestApiIntegration",
      guestApiFn,
    );

    // Frontend hosting: private bucket, only readable by CloudFront
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // App routes like /s/<token> aren't files, so serve index.html and let the router handle them.
    // Real files (anything with an extension) still 404 properly when missing.
    const spaRouting = new cloudfront.Function(this, "SpaRouting", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  if (!request.uri.includes(".")) {
    request.uri = "/index.html";
  }
  return request;
}`),
    });

    const distribution = new cloudfront.Distribution(this, "SiteDistribution", {
      domainNames: [props.site.domainName],
      certificate: props.site.certificate,
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        // HSTS, nosniff, frame denial, and a referrer policy that keeps share tokens out of outbound links
        responseHeadersPolicy:
          cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [
          {
            function: spaRouting,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
    });
    const siteUrl = `https://${props.site.domainName}`;

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId: props.site.hostedZoneId,
      zoneName: props.site.zoneName,
    });
    const recordName = props.site.domainName.replace(
      `.${props.site.zoneName}`,
      "",
    );
    const aliasTarget = route53.RecordTarget.fromAlias(
      new CloudFrontTarget(distribution),
    );
    new route53.ARecord(this, "SiteAliasIpv4", {
      zone,
      recordName,
      target: aliasTarget,
    });
    new route53.AaaaRecord(this, "SiteAliasIpv6", {
      zone,
      recordName,
      target: aliasTarget,
    });

    const httpApi = new HttpApi(this, "WishlistHttpApi", {
      corsPreflight: {
        allowOrigins: [siteUrl, "http://localhost:5173"],
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
    httpApi.addRoutes({
      // Explicit methods (not ANY) so CORS preflights are answered by API Gateway, not routed here
      path: "/lists",
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: ownerApiIntegration,
      authorizer: auth,
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
      authorizer: auth,
    });
    httpApi.addRoutes({
      path: "/share/{proxy+}",
      methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.DELETE],
      integration: guestApiIntegration,
    });

    // DynamoDB
    const LISTS_TABLE_NAME = "Lists";
    const listsTable = new aws_dynamodb.TableV2(this, LISTS_TABLE_NAME, {
      partitionKey: { name: "listId", type: aws_dynamodb.AttributeType.STRING },
      billing: aws_dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      globalSecondaryIndexes: [
        {
          indexName: "OwnerIndex",
          partitionKey: {
            name: "ownerId",
            type: aws_dynamodb.AttributeType.STRING,
          },
        },
        {
          indexName: "ShareTokenIndex",
          partitionKey: {
            name: "shareToken",
            type: aws_dynamodb.AttributeType.STRING,
          },
        },
      ],
    });
    listsTable.grantReadWriteData(ownerApiFn);
    listsTable.grantReadData(guestApiFn);
    ownerApiFn.addEnvironment("LISTS_TABLE_NAME", listsTable.tableName);
    guestApiFn.addEnvironment("LISTS_TABLE_NAME", listsTable.tableName);

    const itemsTable = new aws_dynamodb.TableV2(this, "Items", {
      partitionKey: { name: "listId", type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: "itemId", type: aws_dynamodb.AttributeType.STRING },
      billing: aws_dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    itemsTable.grantReadWriteData(ownerApiFn);
    itemsTable.grantReadData(guestApiFn);
    ownerApiFn.addEnvironment("ITEMS_TABLE_NAME", itemsTable.tableName);
    guestApiFn.addEnvironment("ITEMS_TABLE_NAME", itemsTable.tableName);

    const claimsTable = new aws_dynamodb.TableV2(this, "Claims", {
      partitionKey: { name: "listId", type: aws_dynamodb.AttributeType.STRING },
      sortKey: { name: "itemId", type: aws_dynamodb.AttributeType.STRING },
      billing: aws_dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    claimsTable.grantReadWriteData(guestApiFn);
    guestApiFn.addEnvironment("CLAIMS_TABLE_NAME", claimsTable.tableName);

    // Frontend deployment. The build must exist first: npm run deploy builds it, then deploys.
    if (!fs.existsSync(path.join(FRONTEND_DIST, "index.html"))) {
      throw new Error(
        "frontend/dist not found. Build it first: npm run build --prefix frontend",
      );
    }

    // Hashed bundles never change, so browsers can cache them for a year
    const assetsDeployment = new s3deploy.BucketDeployment(
      this,
      "DeploySiteAssets",
      {
        destinationBucket: siteBucket,
        sources: [
          s3deploy.Source.asset(FRONTEND_DIST, {
            exclude: ["index.html", "favicon.svg", "config.json"],
          }),
        ],
        cacheControl: [
          s3deploy.CacheControl.fromString(
            "public, max-age=31536000, immutable",
          ),
        ],
        // Keep older bundles so people with an older index.html open can still load them
        prune: false,
      },
    );

    // The entry page and runtime config must always be fresh, so they're revalidated on every load
    const shellDeployment = new s3deploy.BucketDeployment(
      this,
      "DeploySiteShell",
      {
        destinationBucket: siteBucket,
        sources: [
          s3deploy.Source.asset(FRONTEND_DIST, {
            exclude: ["*", "!index.html", "!favicon.svg"],
          }),
          s3deploy.Source.jsonData("config.json", {
            apiUrl: httpApi.apiEndpoint,
            userPoolId: userPool.userPoolId,
            userPoolClientId: userPoolClient.userPoolClientId,
          }),
        ],
        cacheControl: [s3deploy.CacheControl.fromString("no-cache")],
        prune: false,
        distribution,
        distributionPaths: ["/index.html", "/favicon.svg", "/config.json"],
      },
    );
    // New bundles must be in place before the index.html that references them
    shellDeployment.node.addDependency(assetsDeployment);

    new CfnOutput(this, "SiteUrl", {
      value: siteUrl,
    });
    new CfnOutput(this, "WishlistAPIUrl", {
      value: httpApi.apiEndpoint,
    });
    new CfnOutput(this, "Pool ID", {
      value: userPool.userPoolId,
    });
    new CfnOutput(this, "Pool Client ID", {
      value: userPoolClient.userPoolClientId,
    });
  }
}
