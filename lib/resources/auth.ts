import * as cdk from "aws-cdk-lib/core";
import { Duration } from "aws-cdk-lib/core";
import { aws_cognito } from "aws-cdk-lib";

export type Auth = {
  userPool: aws_cognito.UserPool;
  userPoolClient: aws_cognito.UserPoolClient;
};

// Owners only: guests never get accounts, they use share tokens instead
export function createAuth(stack: cdk.Stack): Auth {
  const userPool = new aws_cognito.UserPool(stack, "UserPool", {
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

  return { userPool, userPoolClient };
}
