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

export class WishlistStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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

    const httpApi = new HttpApi(this, "WishlistHttpApi", {
      corsPreflight: {
        allowOrigins: ["http://localhost:5173"],
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
