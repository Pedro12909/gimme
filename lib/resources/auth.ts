import * as cdk from "aws-cdk-lib/core";
import { Duration } from "aws-cdk-lib/core";
import { aws_cognito } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";

export type Auth = {
  userPool: aws_cognito.UserPool;
  userPoolClient: aws_cognito.UserPoolClient;
};

// Owners only: guests never get accounts, they use share tokens instead
export function createAuth(stack: cdk.Stack, siteUrl: string): Auth {
  const userPool = new aws_cognito.UserPool(stack, "UserPool", {
    // Invite-only: accounts are created by an admin (AdminCreateUser). Guests never need one.
    selfSignUpEnabled: false,
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

  // Rewords every email Cognito sends (sign-in code, verification, invite). Only the
  // sign-in code email strictly needs this; there's no template setting for it.
  const authEmailsFn = new NodejsFunction(stack, "AuthEmailsFn", {
    entry: "lambda/auth-emails/index.ts",
    handler: "handler",
    runtime: lambda.Runtime.NODEJS_22_X,
    environment: { SITE_URL: siteUrl },
  });
  userPool.addTrigger(
    aws_cognito.UserPoolOperation.CUSTOM_MESSAGE,
    authEmailsFn,
  );

  const userPoolClient = userPool.addClient("UserPoolClient", {
    authFlows: {
      user: true,
    },
    refreshTokenValidity: Duration.days(90),
    // Time allowed to enter the emailed sign-in code (default is 3 minutes)
    authSessionValidity: Duration.minutes(10),
  });

  return { userPool, userPoolClient };
}
