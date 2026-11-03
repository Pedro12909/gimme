import * as cdk from "aws-cdk-lib/core";
import { Duration } from "aws-cdk-lib/core";
import * as s3 from "aws-cdk-lib/aws-s3";

// Owners' item photos. Private like the site bucket: CloudFront serves only images/, and
// browsers upload to pending/ with presigned forms from the owner Lambda.
export function createImagesBucket(
  stack: cdk.Stack,
  { allowedOrigins }: { allowedOrigins: string[] },
) {
  return new s3.Bucket(stack, "ImagesBucket", {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
    // The browser posts uploads straight to the bucket
    cors: [
      {
        allowedMethods: [s3.HttpMethods.POST],
        allowedOrigins,
        allowedHeaders: ["*"],
        maxAge: 3600,
      },
    ],
    // Uploads that were never saved to an item
    lifecycleRules: [{ prefix: "pending/", expiration: Duration.days(1) }],
  });
}
