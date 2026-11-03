import * as cdk from "aws-cdk-lib/core";
import { aws_dynamodb } from "aws-cdk-lib";

export type Tables = {
  listsTable: aws_dynamodb.TableV2;
  itemsTable: aws_dynamodb.TableV2;
  claimsTable: aws_dynamodb.TableV2;
  ownersTable: aws_dynamodb.TableV2;
};

// One table per entity. Access is granted per Lambda where each function is defined.
export function createTables(stack: cdk.Stack): Tables {
  const listsTable = new aws_dynamodb.TableV2(stack, "Lists", {
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

  const itemsTable = new aws_dynamodb.TableV2(stack, "Items", {
    partitionKey: { name: "listId", type: aws_dynamodb.AttributeType.STRING },
    sortKey: { name: "itemId", type: aws_dynamodb.AttributeType.STRING },
    billing: aws_dynamodb.Billing.onDemand(),
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    // Feeds the claims cleanup; only the keys are needed to find the matching claim
    dynamoStream: aws_dynamodb.StreamViewType.KEYS_ONLY,
  });

  const claimsTable = new aws_dynamodb.TableV2(stack, "Claims", {
    partitionKey: { name: "listId", type: aws_dynamodb.AttributeType.STRING },
    sortKey: { name: "itemId", type: aws_dynamodb.AttributeType.STRING },
    billing: aws_dynamodb.Billing.onDemand(),
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  // Per-account details shown to guests, e.g. the name in "Pedro's list"
  const ownersTable = new aws_dynamodb.TableV2(stack, "Owners", {
    partitionKey: { name: "ownerId", type: aws_dynamodb.AttributeType.STRING },
    billing: aws_dynamodb.Billing.onDemand(),
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  return { listsTable, itemsTable, claimsTable, ownersTable };
}
