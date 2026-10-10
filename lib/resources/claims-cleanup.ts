import * as cdk from "aws-cdk-lib/core";
import { Duration } from "aws-cdk-lib/core";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import {
  DynamoEventSource,
  SqsDlq,
} from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Tables } from "./tables";

// When an item is deleted, delete its claim. Runs off the Items stream so the owner Lambda
// never needs access to Claims.
export function createClaimsCleanup(
  stack: cdk.Stack,
  { itemsTable, claimsTable }: Pick<Tables, "itemsTable" | "claimsTable">,
) {
  const claimsCleanupFn = new NodejsFunction(stack, "ClaimsCleanupFn", {
    entry: "lambda/claims-cleanup/index.ts",
    handler: "handler",
    runtime: lambda.Runtime.NODEJS_22_X,
    environment: { CLAIMS_TABLE_NAME: claimsTable.tableName },
  });
  // Delete-only: it can't read or write claims
  claimsTable.grant(claimsCleanupFn, "dynamodb:DeleteItem");

  // Batches that still fail after retries are recorded here instead of being lost
  const claimsCleanupDlq = new sqs.Queue(stack, "ClaimsCleanupDlq", {
    retentionPeriod: Duration.days(14),
    enforceSSL: true,
  });

  claimsCleanupFn.addEventSource(
    new DynamoEventSource(itemsTable, {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 100,
      // Only deletions matter; inserts and edits never invoke the function
      filters: [
        lambda.FilterCriteria.filter({
          eventName: lambda.FilterRule.isEqual("REMOVE"),
        }),
      ],
      reportBatchItemFailures: true,
      retryAttempts: 5,
      onFailure: new SqsDlq(claimsCleanupDlq),
    }),
  );
}
